using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace PCHUB.Streaming;

public sealed class SignalingSession : IAsyncDisposable
{
    private readonly ClientWebSocket _ws = new();
    private readonly string _role;
    private readonly string _rentalId;
    private readonly string _token;
    private CancellationTokenSource? _cts;

    public event Action<string>? OnLog;
    public event Action? OnPeerJoined;
    public event Action<string>? OnOffer;
    public event Action<string>? OnAnswer;
    public event Action<string>? OnIce;

    public SignalingSession(string role, string rentalId, string token)
    {
        _role = role;
        _rentalId = rentalId;
        _token = token;
    }

    public async Task ConnectAsync(string signalUrl, CancellationToken ct = default)
    {
        Log($"Connecting {signalUrl}");
        await _ws.ConnectAsync(new Uri(signalUrl), ct);
        await SendAsync(new { type = "join", role = _role, rentalId = _rentalId, token = _token }, ct);
        Log($"Joined as {_role}");
        _cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        _ = Task.Run(() => ReceiveLoop(_cts.Token), _cts.Token);
    }

    public Task SendOfferAsync(string sdp, CancellationToken ct = default) =>
        SendAsync(new { type = "offer", sdp }, ct);

    public Task SendAnswerAsync(string sdp, CancellationToken ct = default) =>
        SendAsync(new { type = "answer", sdp }, ct);

    public Task SendIceAsync(object candidate, CancellationToken ct = default) =>
        SendAsync(new { type = "ice", candidate }, ct);

    private async Task ReceiveLoop(CancellationToken ct)
    {
        var buf = new byte[16384];
        while (_ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            var seg = new ArraySegment<byte>(buf);
            var result = await _ws.ReceiveAsync(seg, ct);
            if (result.MessageType == WebSocketMessageType.Close) break;
            var text = Encoding.UTF8.GetString(buf, 0, result.Count);
            HandleMessage(text);
        }
    }

    private void HandleMessage(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeEl)) return;
            var type = typeEl.GetString();

            if (type == "peer" && root.TryGetProperty("status", out var st) && st.GetString() == "joined")
            {
                Log("Peer joined");
                OnPeerJoined?.Invoke();
                return;
            }
            if (type == "offer" && root.TryGetProperty("sdp", out var offer))
            {
                OnOffer?.Invoke(offer.GetString() ?? "");
                return;
            }
            if (type == "answer" && root.TryGetProperty("sdp", out var answer))
            {
                OnAnswer?.Invoke(answer.GetString() ?? "");
                return;
            }
            if (type == "ice" && root.TryGetProperty("candidate", out var ice))
            {
                OnIce?.Invoke(ice.GetRawText());
            }
        }
        catch (Exception ex)
        {
            Log($"Signal parse error: {ex.Message}");
        }
    }

    private async Task SendAsync(object payload, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(payload);
        var bytes = Encoding.UTF8.GetBytes(json);
        await _ws.SendAsync(bytes, WebSocketMessageType.Text, true, ct);
    }

    private void Log(string msg) => OnLog?.Invoke(msg);

    public async ValueTask DisposeAsync()
    {
        _cts?.Cancel();
        if (_ws.State == WebSocketState.Open)
        {
            try { await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None); }
            catch { }
        }
        _ws.Dispose();
        _cts?.Dispose();
    }
}
