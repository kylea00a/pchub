using SIPSorcery.Net;
using SIPSorceryMedia.Abstractions;
using PCHUB.Streaming.Input;
using Vortice.Direct3D11;
using D3D11Device = Vortice.Direct3D11.ID3D11Device;

namespace PCHUB.Streaming;

public sealed class DirectStreamSession : IAsyncDisposable
{
    private readonly string _role;
    private readonly SignalingSession _signal;
    private readonly DirectStreamPeer _peer;
    private bool _negotiationStarted;

    public event Action<string>? OnLog;
    public event Action<RTCPeerConnectionState>? OnConnectionState;
    public event Action<uint, uint, byte[], VideoPixelFormatsEnum>? OnVideoFrame;
    public event Action<RawImage>? OnVideoFrameDecoded;
    public event Action<GpuTextureFrame>? OnVideoGpuTexture;

    public InputDataChannel? Input => _peer.Input;

    public DirectStreamSession(
        string role,
        string rentalId,
        string token,
        string signalUrl,
        IEnumerable<string> stunServers)
        : this(role, rentalId, token, signalUrl, WebRtcIceServer.FromStunUrls(stunServers), null)
    {
    }

    public DirectStreamSession(
        string role,
        string rentalId,
        string token,
        string signalUrl,
        IEnumerable<WebRtcIceServer> iceServers,
        D3D11Device? sharedGpuDevice = null)
    {
        _role = role;
        SignalUrl = signalUrl;
        _signal = new SignalingSession(role, rentalId, token);
        _peer = new DirectStreamPeer(role, iceServers, sharedGpuDevice);
        _signal.OnLog += m => OnLog?.Invoke(m);
        _peer.OnLog += m => OnLog?.Invoke(m);
        _peer.OnConnectionState += s => OnConnectionState?.Invoke(s);
        _peer.OnVideoFrame += (w, h, b, fmt) => OnVideoFrame?.Invoke(w, h, b, fmt);
        _peer.OnVideoFrameDecoded += raw => OnVideoFrameDecoded?.Invoke(raw);
        _peer.OnVideoGpuTexture += gpu => OnVideoGpuTexture?.Invoke(gpu);
        _signal.OnPeerJoined += OnPeerJoined;
        _signal.OnOffer += sdp =>
        {
            if (_role == "host") _ = HandleOfferAsync(sdp);
        };
        _signal.OnAnswer += sdp => _peer.SetRemoteAnswer(sdp);
        _signal.OnIce += ice => _peer.AddRemoteIce(ice);
        _peer.OnLocalIce += cand => _ = _signal.SendIceAsync(new
        {
            candidate = cand.candidate,
            sdpMid = cand.sdpMid,
            sdpMLineIndex = cand.sdpMLineIndex,
        });
    }

    public string SignalUrl { get; }

    public async Task StartAsync(CancellationToken ct = default)
    {
        await _signal.ConnectAsync(SignalUrl, ct);
    }

    private void OnPeerJoined()
    {
        if (_role != "renter" || _negotiationStarted) return;
        _negotiationStarted = true;
        _ = StartNegotiationAsync();
    }

    private async Task StartNegotiationAsync()
    {
        try
        {
            var offer = await _peer.CreateOfferAsync();
            await _signal.SendOfferAsync(offer);
            OnLog?.Invoke("Sent WebRTC offer");
        }
        catch (Exception ex)
        {
            OnLog?.Invoke($"Offer failed: {ex.Message}");
        }
    }

    private async Task HandleOfferAsync(string offerSdp)
    {
        try
        {
            var answer = await _peer.CreateAnswerAsync(offerSdp);
            await _signal.SendAnswerAsync(answer);
            OnLog?.Invoke("Sent WebRTC answer");
        }
        catch (Exception ex)
        {
            OnLog?.Invoke($"Answer failed: {ex.Message}");
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _peer.DisposeAsync();
        await _signal.DisposeAsync();
    }
}
