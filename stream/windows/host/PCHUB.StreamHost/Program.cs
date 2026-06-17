using System.Text.Json;
using PCHUB.StreamHost;
using PCHUB.Streaming;

static string? Arg(string[] args, string name)
{
    for (var i = 0; i < args.Length - 1; i++)
    {
        if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase))
            return args[i + 1];
    }
    return null;
}

static IEnumerable<WebRtcIceServer> ParseIceServers(string? iceJson, IEnumerable<string> stunFallback)
{
    if (!string.IsNullOrWhiteSpace(iceJson))
    {
        try
        {
            var items = JsonSerializer.Deserialize<List<IceJsonEntry>>(iceJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (items is { Count: > 0 })
            {
                return items.Select(i => new WebRtcIceServer
                {
                    Urls = i.Urls ?? "",
                    Username = i.Username,
                    Credential = i.Credential,
                }).Where(i => !string.IsNullOrWhiteSpace(i.Urls));
            }
        }
        catch { }
    }

    return WebRtcIceServer.FromStunUrls(stunFallback);
}

var signalUrl = Arg(args, "--signal-url") ?? Arg(args, "-SignalUrl");
var rentalId = Arg(args, "--rental-id") ?? Arg(args, "-RentalId");
var token = Arg(args, "--token") ?? Arg(args, "-AgentToken");
var logFile = Arg(args, "--log") ?? Arg(args, "-LogFile");
var stunRaw = Arg(args, "--stun") ?? Arg(args, "-Stun");
var iceJson = Arg(args, "--ice-json");

if (string.IsNullOrWhiteSpace(signalUrl) || string.IsNullOrWhiteSpace(rentalId) || string.IsNullOrWhiteSpace(token))
{
    Console.Error.WriteLine("Usage: PCHUB-StreamHost --signal-url <wss://...> --rental-id <id> --token <agentToken> [--stun stun:...] [--ice-json [...]] [--log path]");
    return 1;
}

var stun = string.IsNullOrWhiteSpace(stunRaw)
    ? new[] { "stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302" }
    : stunRaw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

var iceServers = ParseIceServers(iceJson, stun);

void Log(string msg)
{
    var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {msg}";
    Console.WriteLine(line);
    if (!string.IsNullOrWhiteSpace(logFile))
    {
        try { File.AppendAllText(logFile, line + Environment.NewLine); } catch { }
    }
}

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    cts.Cancel();
};

Log($"StreamHost starting rental={rentalId}");

try
{
    StreamMediaBootstrap.EnsureFfmpeg();
    Log("FFmpeg initialised for screen capture");
}
catch (Exception ex)
{
    Log($"FFmpeg init warning: {ex.Message} (test pattern fallback may be used)");
}

await using var session = new DirectStreamSession("host", rentalId, token, signalUrl, iceServers);
session.OnLog += Log;
session.OnConnectionState += state => Log($"Connection: {state}");

try
{
    await session.StartAsync(cts.Token);
    Log("Signaling connected (host)");
    await Task.Delay(Timeout.Infinite, cts.Token);
}
catch (OperationCanceledException)
{
    Log("StreamHost stopping");
}
catch (Exception ex)
{
    Log($"ERROR: {ex.Message}");
    return 1;
}

return 0;
