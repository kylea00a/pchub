using FFmpeg.AutoGen;
using System.Diagnostics;
using System.Net;
using SIPSorcery.Media;
using SIPSorcery.Net;
using SIPSorceryMedia.Abstractions;
using SIPSorceryMedia.Encoders;
using SIPSorceryMedia.FFmpeg;
using SIPSorceryMedia.Windows;
using PCHUB.Streaming.Input;
using Vortice.Direct3D11;
using D3D11Device = Vortice.Direct3D11.ID3D11Device;

namespace PCHUB.Streaming;

public sealed class DirectStreamPeer : IAsyncDisposable
{
    private readonly RTCPeerConnection _pc;
    private readonly string _role;
    private IVideoSource? _videoSource;
    private VpxVideoEncoder? _videoEncoder;
    private FFmpegVideoEncoder? _ffmpegEncoder;
    private FFmpegScreenSource? _screenSource;
    private DxgiScreenSource? _dxgiSource;
    private readonly InputDataChannel? _input;
    private AdaptiveBitrateController? _abr;
    private VideoCodecsEnum _negotiatedCodec = VideoCodecsEnum.VP8;
    private WindowsAudioEndPoint? _audioEp;
    private HostLoopbackAudioSource? _loopbackAudio;
    private FFmpegVideoEndPoint? _videoSink;
    private NvencD3D11Encoder? _nvencGpu;
    private bool _h264CpuFallback;
    private GpuTextureSampleDelegate? _gpuTextureHandler;
    private RawVideoSampleFasterDelegate? _cpuH264Handler;
    private D3d11H264Decoder? _h264GpuDecoder;
    private VideoCodecsEnum _renterVideoCodec = VideoCodecsEnum.H264;
    private readonly D3D11Device? _sharedGpuDevice;
    private bool _loggedGpuDecode;

    public event Action<string>? OnLog;
    public event Action<RTCPeerConnectionState>? OnConnectionState;
    public event Action<uint, uint, byte[], VideoPixelFormatsEnum>? OnVideoFrame;
    public event Action<RawImage>? OnVideoFrameDecoded;
    public event Action<GpuTextureFrame>? OnVideoGpuTexture;

    public InputDataChannel? Input => _input;

    public DirectStreamPeer(string role, IEnumerable<string> stunServers)
        : this(role, WebRtcIceServer.FromStunUrls(stunServers), null)
    {
    }

    public DirectStreamPeer(string role, IEnumerable<WebRtcIceServer> iceServers, D3D11Device? sharedGpuDevice = null)
    {
        _sharedGpuDevice = sharedGpuDevice;
        _role = role;
        var cfg = new RTCConfiguration
        {
            iceServers = iceServers.Select(s => s.ToRtcIceServer()).ToList(),
        };
        _pc = new RTCPeerConnection(cfg);
        _pc.onconnectionstatechange += state =>
        {
            Log($"WebRTC state: {state}");
            OnConnectionState?.Invoke(state);
        };
        _pc.onicecandidate += cand =>
        {
            if (cand != null) OnLocalIce?.Invoke(cand);
        };

        if (_role == "host")
        {
            _input = InputDataChannel.CreateHost(_pc, WindowsInputInjector.Process);
            SetupAudio(send: true);
            SetupHostVideoSend();
        }
        else
        {
            _input = InputDataChannel.CreateClient(_pc);
            SetupAudio(send: false);
            SetupRenterVideoRecv();
        }

        if (_input is not null)
            _input.OnLog += Log;
    }

    private void SetupAudio(bool send)
    {
        try
        {
            var audioEncoder = new AudioEncoder(includeOpus: true);

            if (send)
            {
                // Host streams system/desktop audio (game + apps), not the microphone.
                _loopbackAudio = new HostLoopbackAudioSource(audioEncoder);
                _loopbackAudio.OnAudioSourceError += msg => Log($"Audio: {msg}");
                var track = new MediaStreamTrack(_loopbackAudio.GetAudioSourceFormats(), MediaStreamStatusEnum.SendOnly);
                _pc.addTrack(track);
                _loopbackAudio.OnAudioSourceEncodedSample += _pc.SendAudio;
                _pc.OnAudioFormatsNegotiated += formats =>
                {
                    var fmt = formats.First();
                    _loopbackAudio!.SetAudioSourceFormat(fmt);
                    Log($"Audio: {fmt.FormatName} @ {fmt.ClockRate}Hz (WASAPI loopback)");
                };
            }
            else
            {
                _audioEp = new WindowsAudioEndPoint(audioEncoder, -1, -1, disableSource: true, disableSink: false);
                var track = new MediaStreamTrack(_audioEp.GetAudioSinkFormats(), MediaStreamStatusEnum.RecvOnly);
                _pc.addTrack(track);
                _pc.OnAudioFormatsNegotiated += formats => _audioEp.SetAudioSinkFormat(formats.First());
                _pc.OnAudioFrameReceived += _audioEp.GotEncodedMediaFrame;
            }

            _pc.onconnectionstatechange += async state =>
            {
                try
                {
                    if (state == RTCPeerConnectionState.connected)
                    {
                        if (_loopbackAudio is not null) await _loopbackAudio.Start();
                        if (_audioEp is not null) await _audioEp.Start();
                    }
                    else if (state is RTCPeerConnectionState.closed or RTCPeerConnectionState.failed)
                    {
                        if (_loopbackAudio is not null) await _loopbackAudio.Close();
                        if (_audioEp is not null) await _audioEp.Close();
                    }
                }
                catch { }
            };
        }
        catch (Exception ex)
        {
            Log($"Audio disabled: {ex.Message}");
        }
    }

    public event Action<RTCIceCandidate>? OnLocalIce;

    private void SetupRenterVideoRecv()
    {
        try
        {
            StreamMediaBootstrap.EnsureFfmpeg();

            var decoderOpts = new Dictionary<string, string> { ["hwaccel"] = "d3d11va" };
            _videoSink = new FFmpegVideoEndPoint(decoderOpts);
            _videoSink.RestrictFormats(f =>
                f.Codec == VideoCodecsEnum.H264 || f.Codec == VideoCodecsEnum.VP8);

            var track = new MediaStreamTrack(_videoSink.GetVideoSinkFormats(), MediaStreamStatusEnum.RecvOnly);
            _pc.addTrack(track);

            _pc.OnVideoFormatsNegotiated += formats =>
            {
                var fmt = formats.First();
                _renterVideoCodec = fmt.Codec;
                _videoSink!.SetVideoSinkFormat(fmt);
                Log($"Renter video recv: {fmt.Codec}");
            };

            _videoSink.OnVideoSinkDecodedSampleFaster += raw =>
            {
                try { OnVideoFrameDecoded?.Invoke(raw); }
                catch { }
            };

            _pc.OnVideoFrameReceived += OnRenterVideoFrameReceived;
        }
        catch (Exception ex)
        {
            Log($"FFmpeg video recv failed, using raw frames: {ex.Message}");
            _pc.OnVideoFrameReceived += (_, _, sample, _) =>
            {
                try { OnVideoFrame?.Invoke(0, 0, sample, VideoPixelFormatsEnum.I420); }
                catch { }
            };
            _pc.addTrack(new MediaStreamTrack(
                new List<VideoFormat> { new VideoFormat(VideoCodecsEnum.VP8, 1280, 720, "") },
                MediaStreamStatusEnum.RecvOnly));
        }
    }

    private void OnRenterVideoFrameReceived(IPEndPoint ep, uint timestamp, byte[] sample, VideoFormat format)
    {
        try
        {
            if (format.Codec == VideoCodecsEnum.H264)
            {
                _h264GpuDecoder ??= new D3d11H264Decoder();
                if (!_h264GpuDecoder.IsReady)
                    _h264GpuDecoder.TryInitialize(_sharedGpuDevice);

                if (_h264GpuDecoder.TryDecode(sample, out var gpu))
                {
                    if (!_loggedGpuDecode)
                    {
                        _loggedGpuDecode = true;
                        Log("Renter H264: D3D11 hw decode active");
                    }
                    OnVideoGpuTexture?.Invoke(gpu);
                    return;
                }
            }

            _videoSink?.GotVideoFrame(ep, timestamp, sample, format);
        }
        catch (Exception ex)
        {
            Log($"Renter video decode error: {ex.Message}");
        }
    }

    private void SetupHostVideoSend()
    {
        if (TrySetupLowLatencyDxgiCapture())
            return;

        if (TrySetupScreenCapture())
            return;

        Log("Screen capture unavailable, using test pattern");
        SetupTestPatternFallback();
    }

    private bool TrySetupLowLatencyDxgiCapture()
    {
        try
        {
            _dxgiSource = HostScreenCapture.CreatePrimaryDxgi(1280, 720, 60);
            _videoSource = _dxgiSource;

            var formats = _dxgiSource.GetVideoSourceFormats();
            var track = new MediaStreamTrack(formats, MediaStreamStatusEnum.SendOnly);
            _pc.addTrack(track);

            _pc.OnVideoFormatsNegotiated += formats =>
            {
                var fmt = formats.First();
                _dxgiSource!.SetVideoSourceFormat(fmt);
                WireGamingGradeEncoder(fmt.Codec);
                _ = _dxgiSource.StartVideo();
                Log($"Host capture started (DXGI, {fmt.Codec}, low-latency)");
            };

            return true;
        }
        catch (Exception ex)
        {
            Log($"DXGI capture init failed: {ex.Message}");
            _dxgiSource?.Dispose();
            _dxgiSource = null;
            return false;
        }
    }

    private void WireGamingGradeEncoder(VideoCodecsEnum negotiated)
    {
        if (_dxgiSource is null) return;
        _negotiatedCodec = negotiated;
        DetachH264Handlers();

        if (negotiated == VideoCodecsEnum.H264)
        {
            _h264CpuFallback = false;
            _loggedGpuNvenc = false;
            _nvencGpu = new NvencD3D11Encoder();
            _gpuTextureHandler = OnGpuTextureForH264;
            _dxgiSource.OnVideoSourceGpuTexture += _gpuTextureHandler;

            _abr?.Dispose();
            _abr = new AdaptiveBitrateController(
                _pc,
                initialBps: 8_000_000,
                minBps: 2_000_000,
                maxBps: 16_000_000,
                setVideoBitrateBps: bps =>
                {
                    var rate = (int)bps;
                    _nvencGpu?.SetBitrate(rate);
                    _ffmpegEncoder?.SetBitrate(rate, null, null, rate);
                },
                forceKeyFrame: () =>
                {
                    _nvencGpu?.ForceKeyFrame();
                    _ffmpegEncoder?.ForceKeyFrame();
                },
                log: Log,
                setTargetFps: fps => _dxgiSource?.SetTargetFps(fps));
            return;
        }

        // Fallback to VP8 (CPU) if peer doesn't accept H264.
        _videoEncoder = new VpxVideoEncoder();
        _dxgiSource.OnVideoSourceRawSampleFaster += (dur, raw) =>
        {
            var encoded = _videoEncoder!.EncodeVideoFaster(raw, VideoCodecsEnum.VP8);
            if (encoded != null) _pc.SendVideo(dur, encoded);
        };
    }

    private void DetachH264Handlers()
    {
        if (_dxgiSource is null) return;
        if (_gpuTextureHandler is not null)
            _dxgiSource.OnVideoSourceGpuTexture -= _gpuTextureHandler;
        if (_cpuH264Handler is not null)
            _dxgiSource.OnVideoSourceRawSampleFaster -= _cpuH264Handler;
        _gpuTextureHandler = null;
        _cpuH264Handler = null;
    }

    private void OnGpuTextureForH264(GpuTextureFrame frame)
    {
        if (_h264CpuFallback || _dxgiSource is null) return;

        try
        {
            if (_nvencGpu is not null && !_nvencGpu.IsReady &&
                !_nvencGpu.TryInitialize(frame.Device, frame.Width, frame.Height))
            {
                EnableH264CpuFallback();
                return;
            }

            if (_nvencGpu is null) return;

            var sw = Stopwatch.StartNew();
            var encoded = _nvencGpu.Encode(frame.Context, frame.Texture);
            sw.Stop();
            _abr?.ReportEncodeTimeMs(sw.Elapsed.TotalMilliseconds);
            if (encoded != null)
            {
                if (!_loggedGpuNvenc)
                {
                    _loggedGpuNvenc = true;
                    Log("Using H264 NVENC (D3D11 zero-copy)");
                }
                _pc.SendVideo(16, encoded);
            }
        }
        catch (Exception ex)
        {
            Log($"D3D11 NVENC error: {ex.Message}");
            EnableH264CpuFallback();
        }
    }

    private bool _loggedGpuNvenc;

    private void EnableH264CpuFallback()
    {
        if (_h264CpuFallback || _dxgiSource is null) return;
        _h264CpuFallback = true;

        if (_gpuTextureHandler is not null)
            _dxgiSource.OnVideoSourceGpuTexture -= _gpuTextureHandler;
        _gpuTextureHandler = null;
        _nvencGpu?.Dispose();
        _nvencGpu = null;

        _ffmpegEncoder = CreateH264EncoderPreferNvenc();
        _ffmpegEncoder.SetBitrate(8_000_000, null, null, 8_000_000);
        _cpuH264Handler = (dur, raw) =>
        {
            try
            {
                var sw = Stopwatch.StartNew();
                var encoded = _ffmpegEncoder!.EncodeVideoFaster(raw, VideoCodecsEnum.H264);
                sw.Stop();
                _abr?.ReportEncodeTimeMs(sw.Elapsed.TotalMilliseconds);
                if (encoded != null) _pc.SendVideo(dur, encoded);
            }
            catch (Exception ex)
            {
                Log($"H264 CPU encode error: {ex.Message}");
            }
        };
        _dxgiSource.OnVideoSourceRawSampleFaster += _cpuH264Handler;
        Log("D3D11 NVENC unavailable — using CPU encode path");
    }

    private FFmpegVideoEncoder CreateH264EncoderPreferNvenc()
    {
        // Very-low-latency defaults; can be tuned later via bitrate control.
        // NVENC options: keep buffer small, no B-frames, short GOP.
        var nvencOpts = new Dictionary<string, string>
        {
            ["preset"] = "p1",
            ["tune"] = "ull",
            ["rc"] = "cbr",
            ["b"] = "8000k",
            ["maxrate"] = "8000k",
            ["bufsize"] = "2000k",
            ["g"] = "60",
            ["bf"] = "0",
            ["refs"] = "1",
        };

        var x264Opts = new Dictionary<string, string>
        {
            ["preset"] = "ultrafast",
            ["tune"] = "zerolatency",
            ["profile"] = "baseline",
            ["b"] = "8000k",
            ["maxrate"] = "8000k",
            ["bufsize"] = "2000k",
            ["g"] = "60",
            ["bf"] = "0",
        };

        var enc = new FFmpegVideoEncoder();

        // Try NVENC first if available in the FFmpeg build.
        if (enc.SetCodec(AVCodecID.AV_CODEC_ID_H264, "h264_nvenc", nvencOpts))
        {
            Log("Using H264 NVENC via CPU frame upload");
            return enc;
        }

        // Otherwise use software x264 (still low-latency but higher CPU).
        enc.SetCodec(AVCodecID.AV_CODEC_ID_H264, "libx264", x264Opts);
        Log("Using H264 x264 (fallback; NVENC unavailable)");
        return enc;
    }

    private bool TrySetupScreenCapture()
    {
        try
        {
            _screenSource = HostScreenCapture.CreatePrimary(1280, 720, 60);
            _videoSource = _screenSource;
            var formats = _screenSource.GetVideoSourceFormats();
            var track = new MediaStreamTrack(formats, MediaStreamStatusEnum.SendOnly);
            _pc.addTrack(track);
            _screenSource.OnVideoSourceEncodedSample += _pc.SendVideo;

            _pc.OnVideoFormatsNegotiated += formats =>
            {
                var fmt = formats.First();
                _screenSource!.SetVideoSourceFormat(fmt);
                _ = _screenSource.StartVideo();
                Log($"Host screen capture started (VP8, up to 1280x720 @ 60fps)");
            };
            return true;
        }
        catch (Exception ex)
        {
            Log($"Screen capture init failed: {ex.Message}");
            _screenSource?.Dispose();
            _screenSource = null;
            _videoSource = null;
            return false;
        }
    }

    private void SetupTestPatternFallback()
    {
        try
        {
            StreamMediaBootstrap.EnsureFfmpeg();
            _screenSource = HostScreenCapture.CreatePrimary(640, 480, 15);
            _videoSource = _screenSource;
            var formats = _screenSource.GetVideoSourceFormats();
            var track = new MediaStreamTrack(formats, MediaStreamStatusEnum.SendOnly);
            _pc.addTrack(track);
            _screenSource.OnVideoSourceEncodedSample += _pc.SendVideo;

            _pc.OnVideoFormatsNegotiated += formats =>
            {
                var fmt = formats.First();
                _screenSource!.SetVideoSourceFormat(fmt);
                _ = _screenSource.StartVideo();
                Log($"Host fallback capture started (VP8, 640x480 @ 15fps)");
            };
        }
        catch (Exception ex)
        {
            Log($"Fallback video source failed: {ex.Message}");
        }
    }

    public async Task<string> CreateOfferAsync()
    {
        if (_role == "renter" && _input is not null)
            await _input.EnsureClientChannelAsync();
        var offer = _pc.createOffer();
        await _pc.setLocalDescription(offer);
        return offer.sdp;
    }

    public async Task<string> CreateAnswerAsync(string offerSdp)
    {
        _pc.setRemoteDescription(new RTCSessionDescriptionInit { type = RTCSdpType.offer, sdp = offerSdp });
        var answer = _pc.createAnswer();
        await _pc.setLocalDescription(answer);
        return answer.sdp;
    }

    public void SetRemoteAnswer(string answerSdp)
    {
        _pc.setRemoteDescription(new RTCSessionDescriptionInit { type = RTCSdpType.answer, sdp = answerSdp });
    }

    public void AddRemoteIce(string candidateJson)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(candidateJson);
            var root = doc.RootElement;
            var init = new RTCIceCandidateInit
            {
                candidate = root.GetProperty("candidate").GetString(),
                sdpMid = root.TryGetProperty("sdpMid", out var mid) ? mid.GetString() : null,
                sdpMLineIndex = root.TryGetProperty("sdpMLineIndex", out var idx) && idx.ValueKind == System.Text.Json.JsonValueKind.Number
                    ? (ushort)idx.GetInt32() : (ushort)0,
            };
            _pc.addIceCandidate(init);
        }
        catch (Exception ex)
        {
            Log($"ICE add failed: {ex.Message}");
        }
    }

    private void Log(string msg) => OnLog?.Invoke(msg);

    public async ValueTask DisposeAsync()
    {
        if (_videoSource is not null)
        {
            try { await _videoSource.CloseVideo(); } catch { }
        }
        _screenSource?.Dispose();
        _dxgiSource?.Dispose();
        DetachH264Handlers();
        _nvencGpu?.Dispose();
        _pc.close();
        _videoEncoder?.Dispose();
        _ffmpegEncoder?.Dispose();
        _abr?.Dispose();
        if (_loopbackAudio is not null)
        {
            try { await _loopbackAudio.Close(); } catch { }
            _loopbackAudio.Dispose();
        }
        if (_audioEp is not null)
        {
            try { await _audioEp.Close(); } catch { }
        }
        if (_videoSink is not null)
        {
            try { await _videoSink.CloseVideo(); } catch { }
            _videoSink.Dispose();
        }
        _h264GpuDecoder?.Dispose();
    }
}
