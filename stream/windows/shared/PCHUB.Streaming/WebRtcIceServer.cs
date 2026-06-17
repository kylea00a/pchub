using SIPSorcery.Net;

namespace PCHUB.Streaming;

public sealed class WebRtcIceServer
{
    public required string Urls { get; init; }
    public string? Username { get; init; }
    public string? Credential { get; init; }

    public static IEnumerable<WebRtcIceServer> FromStunUrls(IEnumerable<string> stunUrls) =>
        stunUrls.Select(u => new WebRtcIceServer { Urls = u });

    public RTCIceServer ToRtcIceServer()
    {
        var server = new RTCIceServer { urls = Urls };
        if (!string.IsNullOrEmpty(Username))
        {
            server.username = Username;
            server.credential = Credential;
            server.credentialType = RTCCredentialType.password;
        }
        return server;
    }
}
