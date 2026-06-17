using System.Windows;
using System.Windows.Threading;
using PCHUB.Renter.Input;
using PCHUB.Renter.Rendering;
using PCHUB.Renter.Services;
using PCHUB.Streaming;
using SIPSorcery.Net;
using SIPSorceryMedia.Abstractions;

namespace PCHUB.Renter;

public partial class MainWindow : Window
{
    private readonly PchubApiClient _api = new();
    private readonly VideoSurface _video;
    private readonly RenterInputCapture _inputCapture;
    private DirectStreamSession? _session;
    private string? _activeRentalId;
    private CancellationTokenSource? _connectCts;
    private uint _videoFrameCount;
    private bool _useGpuPresenter;

    public MainWindow()
    {
        InitializeComponent();
        _video = new VideoSurface(VideoImage);
        _inputCapture = new RenterInputCapture(VideoBorder);
        AppendLog("PCHUB Renter 0.6.0 — low-latency GPU path");
    }

    private async void LoginBtn_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            LoginBtn.IsEnabled = false;
            _api.SetApiBase(ApiUrlBox.Text.Trim());
            await _api.LoginAsync(EmailBox.Text.Trim(), PasswordBox.Password);
            AppendLog("Logged in.");

            var dash = await _api.GetDashboardAsync();
            if (dash.ActiveSessions.Count == 0)
            {
                SessionLabel.Text = "No active rental. Start one on pchub.cloud first.";
                ConnectBtn.IsEnabled = false;
                _activeRentalId = null;
                return;
            }

            var rental = dash.ActiveSessions[0];
            _activeRentalId = rental.RentalId;
            SessionLabel.Text = $"Active: {rental.MachineName} ({rental.MachineCity}) — {rental.RentalId}";
            ConnectBtn.IsEnabled = true;
            AppendLog($"Active rental: {rental.RentalId}");
        }
        catch (Exception ex)
        {
            AppendLog($"Login error: {ex.Message}");
        }
        finally
        {
            LoginBtn.IsEnabled = true;
        }
    }

    private async void ConnectBtn_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrEmpty(_activeRentalId))
        {
            AppendLog("No active rental.");
            return;
        }

        try
        {
            ConnectBtn.IsEnabled = false;
            _connectCts?.Cancel();
            _inputCapture.Detach();
            if (_session is not null) await _session.DisposeAsync();
            _session = null;
            _videoFrameCount = 0;
            _useGpuPresenter = false;
            _video.Clear();
            VideoGpuHost.Clear();
            VideoImage.Visibility = Visibility.Collapsed;
            VideoPlaceholder.Visibility = Visibility.Visible;

            var prep = await _api.PrepareStreamConnectAsync(_activeRentalId);
            var webrtc = prep.Webrtc ?? throw new InvalidOperationException("Missing WebRTC config");
            AppendLog(prep.Message ?? "Preparing stream...");
            AppendLog($"STUN: {string.Join(", ", webrtc.StunServers)}");

            var iceServers = webrtc.IceServers.Count > 0
                ? webrtc.IceServers.Select(s => s.ToIceServer())
                : WebRtcIceServer.FromStunUrls(webrtc.StunServers);
            if (webrtc.TurnEnabled)
                AppendLog("TURN relay enabled for NAT traversal");

            VideoGpuHost.Visibility = Visibility.Visible;
            VideoGpuHost.UpdateLayout();

            _connectCts = new CancellationTokenSource();
            _session = new DirectStreamSession(
                "renter",
                prep.RentalId,
                _api.Token,
                webrtc.SignalUrl,
                iceServers,
                VideoGpuHost.SharedDevice
            );
            _session.OnLog += AppendLog;
            _session.OnConnectionState += OnConnectionState;
            _session.OnVideoGpuTexture += OnVideoGpuTexture;
            _session.OnVideoFrameDecoded += OnVideoFrameDecoded;
            _session.OnVideoFrame += OnVideoFrame;
            await _session.StartAsync(_connectCts.Token);
            AppendLog("Signaling connected. Waiting for host...");
        }
        catch (Exception ex)
        {
            AppendLog($"Connect error: {ex.Message}");
            ConnectBtn.IsEnabled = true;
        }
    }

    private void OnConnectionState(RTCPeerConnectionState state)
    {
        Dispatcher.Invoke(() =>
        {
            AppendLog($"WebRTC: {state}");
            if (state == RTCPeerConnectionState.connected)
            {
                var baseLine = SessionLabel.Text.Split('\n')[0];
                SessionLabel.Text = baseLine + "\nStream connected — click video to control.";
                if (_session?.Input is not null)
                {
                    _inputCapture.Attach(_session.Input);
                    _inputCapture.Focus();
                    AppendLog("Input capture enabled (click video panel for focus)");
                }
            }
            if (state is RTCPeerConnectionState.failed or RTCPeerConnectionState.closed)
            {
                _inputCapture.Detach();
                ConnectBtn.IsEnabled = true;
            }
        });
    }

    private void OnVideoGpuTexture(GpuTextureFrame frame)
    {
        _videoFrameCount++;
        _inputCapture.SetStreamSize((uint)frame.Width, (uint)frame.Height);
        Dispatcher.Invoke(() =>
        {
            VideoPlaceholder.Visibility = Visibility.Collapsed;
            try
            {
                if (VideoGpuHost.PresentGpuTexture(frame))
                {
                    _useGpuPresenter = true;
                    VideoGpuHost.Visibility = Visibility.Visible;
                    VideoImage.Visibility = Visibility.Collapsed;
                }
                else
                {
                    _useGpuPresenter = false;
                }
            }
            catch (Exception ex)
            {
                _useGpuPresenter = false;
                AppendLog($"GPU present error: {ex.Message}");
            }

            if (_videoFrameCount == 1 || _videoFrameCount % 120 == 0)
            {
                var path = _useGpuPresenter ? "D3D11 zero-copy" : "fallback";
                AppendLog($"Video frame {_videoFrameCount}: {frame.Width}x{frame.Height} ({path})");
            }
        }, DispatcherPriority.Render);
    }

    private void OnVideoFrameDecoded(RawImage raw)
    {
        if (_useGpuPresenter) return;
        _videoFrameCount++;
        _inputCapture.SetStreamSize((uint)raw.Width, (uint)raw.Height);
        Dispatcher.Invoke(() =>
        {
            VideoPlaceholder.Visibility = Visibility.Collapsed;
            try
            {
                if (VideoGpuHost.PresentFrame(raw))
                {
                    _useGpuPresenter = true;
                    VideoGpuHost.Visibility = Visibility.Visible;
                    VideoImage.Visibility = Visibility.Collapsed;
                }
                else
                {
                    _useGpuPresenter = false;
                    PresentCpuFrame(raw);
                }
            }
            catch (Exception ex)
            {
                _useGpuPresenter = false;
                AppendLog($"GPU present failed, using CPU fallback: {ex.Message}");
                PresentCpuFrame(raw);
            }

            if (_videoFrameCount == 1 || _videoFrameCount % 120 == 0)
            {
                var path = _useGpuPresenter ? "D3D11" : "CPU";
                AppendLog($"Video frame {_videoFrameCount}: {raw.Width}x{raw.Height} ({raw.PixelFormat}, {path})");
            }
        }, DispatcherPriority.Render);
    }

    private void OnVideoFrame(uint width, uint height, byte[] sample, VideoPixelFormatsEnum format)
    {
        if (_useGpuPresenter || sample.Length == 0) return;

        _videoFrameCount++;
        _inputCapture.SetStreamSize(width, height);
        Dispatcher.Invoke(() =>
        {
            VideoPlaceholder.Visibility = Visibility.Collapsed;
            VideoGpuHost.Visibility = Visibility.Collapsed;
            VideoImage.Visibility = Visibility.Visible;
            _video.Present(width, height, sample, format);
            if (_videoFrameCount == 1 || _videoFrameCount % 120 == 0)
                AppendLog($"Video frame {_videoFrameCount}: {width}x{height} ({format}, CPU)");
        }, DispatcherPriority.Render);
    }

    private void PresentCpuFrame(RawImage raw)
    {
        if (raw.Sample == IntPtr.Zero || raw.Width <= 0 || raw.Height <= 0) return;

        var pixels = raw.Width * raw.Height;
        byte[] sample;
        if (raw.PixelFormat == VideoPixelFormatsEnum.Rgb)
        {
            sample = new byte[pixels * 3];
            var stride = raw.Stride > 0 ? raw.Stride : raw.Width * 3;
            unsafe
            {
                var src = (byte*)raw.Sample;
                for (var y = 0; y < raw.Height; y++)
                    System.Runtime.InteropServices.Marshal.Copy(src + y * stride, sample, y * raw.Width * 3, raw.Width * 3);
            }
        }
        else if (raw.PixelFormat == VideoPixelFormatsEnum.Bgra)
        {
            sample = new byte[pixels * 4];
            var stride = raw.Stride > 0 ? raw.Stride : raw.Width * 4;
            unsafe
            {
                var src = (byte*)raw.Sample;
                for (var y = 0; y < raw.Height; y++)
                    System.Runtime.InteropServices.Marshal.Copy(src + y * stride, sample, y * raw.Width * 4, raw.Width * 4);
            }
            sample = BgraToRgb(sample, raw.Width, raw.Height);
            _video.Present((uint)raw.Width, (uint)raw.Height, sample, VideoPixelFormatsEnum.Rgb);
            VideoImage.Visibility = Visibility.Visible;
            return;
        }
        else
        {
            return;
        }

        VideoImage.Visibility = Visibility.Visible;
        _video.Present((uint)raw.Width, (uint)raw.Height, sample, VideoPixelFormatsEnum.Rgb);
    }

    private static byte[] BgraToRgb(byte[] bgra, int width, int height)
    {
        var rgb = new byte[width * height * 3];
        for (var i = 0; i < width * height; i++)
        {
            rgb[i * 3] = bgra[i * 4 + 2];
            rgb[i * 3 + 1] = bgra[i * 4 + 1];
            rgb[i * 3 + 2] = bgra[i * 4];
        }
        return rgb;
    }

    private void VideoBorder_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        VideoGpuHost.UpdateLetterboxLayout(e.NewSize.Width, e.NewSize.Height);
    }

    private void AppendLog(string line)
    {
        Dispatcher.Invoke(() =>
        {
            LogBox.AppendText($"[{DateTime.Now:HH:mm:ss}] {line}\r\n");
            LogBox.ScrollToEnd();
        }, DispatcherPriority.Background);
    }

    protected override async void OnClosed(EventArgs e)
    {
        _connectCts?.Cancel();
        _inputCapture.Detach();
        if (_session is not null) await _session.DisposeAsync();
        _api.Dispose();
        base.OnClosed(e);
    }
}
