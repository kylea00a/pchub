using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Windows;
using PCHUB.Streaming;

namespace PCHUB.Renter.Services;

public sealed class PchubApiClient : IDisposable
{
    private readonly HttpClient _http = new();
    private string _apiBase = "https://api.pchub.cloud";
    private string? _token;

    public void SetApiBase(string apiBase) => _apiBase = apiBase.TrimEnd('/');

    public async Task LoginAsync(string email, string password, CancellationToken ct = default)
    {
        var body = JsonSerializer.Serialize(new { email, password });
        using var res = await _http.PostAsync(
            $"{_apiBase}/api/auth/login",
            new StringContent(body, Encoding.UTF8, "application/json"),
            ct
        );
        var json = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException(ParseError(json) ?? "Login failed");

        using var doc = JsonDocument.Parse(json);
        _token = doc.RootElement.GetProperty("token").GetString();
        if (string.IsNullOrEmpty(_token)) throw new InvalidOperationException("No token in response");
    }

    public async Task<DashboardDto> GetDashboardAsync(CancellationToken ct = default)
    {
        EnsureToken();
        using var req = new HttpRequestMessage(HttpMethod.Get, $"{_apiBase}/api/me/dashboard");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
        using var res = await _http.SendAsync(req, ct);
        var json = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException(ParseError(json) ?? "Dashboard failed");
        return JsonSerializer.Deserialize<DashboardDto>(json, JsonOpts)
            ?? throw new InvalidOperationException("Invalid dashboard response");
    }

    public async Task<StreamConnectDto> PrepareStreamConnectAsync(string rentalId, CancellationToken ct = default)
    {
        EnsureToken();
        using var req = new HttpRequestMessage(
            HttpMethod.Post,
            $"{_apiBase}/api/me/rentals/{rentalId}/stream/connect"
        );
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
        using var res = await _http.SendAsync(req, ct);
        var json = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException(ParseError(json) ?? "Connect prepare failed");
        return JsonSerializer.Deserialize<StreamConnectDto>(json, JsonOpts)
            ?? throw new InvalidOperationException("Invalid connect response");
    }

    public string Token => _token ?? throw new InvalidOperationException("Not logged in");

    private void EnsureToken()
    {
        if (string.IsNullOrEmpty(_token)) throw new InvalidOperationException("Login required");
    }

    private static string? ParseError(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("error", out var err))
                return err.GetString();
        }
        catch { }
        return null;
    }

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    public void Dispose() => _http.Dispose();
}

public sealed class DashboardDto
{
    public List<RentalDto> ActiveSessions { get; set; } = new();
}

public sealed class RentalDto
{
    public string RentalId { get; set; } = "";
    public string MachineName { get; set; } = "";
    public string? MachineCity { get; set; }
}

public sealed class StreamConnectDto
{
    public string RentalId { get; set; } = "";
    public string MachineId { get; set; } = "";
    public WebrtcConfigDto? Webrtc { get; set; }
    public string? Message { get; set; }
}

public sealed class WebrtcConfigDto
{
    public string SignalUrl { get; set; } = "";
    public List<string> StunServers { get; set; } = new();
    public List<IceServerDto> IceServers { get; set; } = new();
    public bool TurnEnabled { get; set; }
}

public sealed class IceServerDto
{
    public string Urls { get; set; } = "";
    public string? Username { get; set; }
    public string? Credential { get; set; }

    public WebRtcIceServer ToIceServer() => new()
    {
        Urls = Urls,
        Username = Username,
        Credential = Credential,
    };
}

public sealed class SignalingClient : IAsyncDisposable
{
    private ClientWebSocket? _ws;

    public event Action<string>? OnLog;
    public event Action<string>? OnMessage;

    public async Task ConnectAndJoinAsync(
        string signalUrl,
        string rentalId,
        string jwtToken,
        CancellationToken ct = default
    )
    {
        _ws = new ClientWebSocket();
        Log($"Connecting {signalUrl}...");
        await _ws.ConnectAsync(new Uri(signalUrl), ct);

        var join = JsonSerializer.Serialize(new
        {
            type = "join",
            role = "renter",
            rentalId,
            token = jwtToken,
        });
        await SendAsync(join, ct);
        Log("Sent join (renter). Waiting for host...");

        _ = Task.Run(() => ReceiveLoop(ct), ct);
    }

    private async Task ReceiveLoop(CancellationToken ct)
    {
        if (_ws is null) return;
        var buf = new byte[8192];
        while (_ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            var seg = new ArraySegment<byte>(buf);
            var result = await _ws.ReceiveAsync(seg, ct);
            if (result.MessageType == WebSocketMessageType.Close) break;
            var text = Encoding.UTF8.GetString(buf, 0, result.Count);
            OnMessage?.Invoke(text);
            Log($"<= {text}");
        }
    }

    public async Task SendAsync(string json, CancellationToken ct = default)
    {
        if (_ws is null || _ws.State != WebSocketState.Open)
            throw new InvalidOperationException("Signaling socket not open");
        var bytes = Encoding.UTF8.GetBytes(json);
        await _ws.SendAsync(bytes, WebSocketMessageType.Text, true, ct);
    }

    private void Log(string line) => OnLog?.Invoke(line);

    public async ValueTask DisposeAsync()
    {
        if (_ws is null) return;
        try
        {
            if (_ws.State == WebSocketState.Open)
                await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None);
        }
        catch { }
        _ws.Dispose();
    }
}
