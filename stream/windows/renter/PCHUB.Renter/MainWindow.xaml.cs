using System.Windows;
using System.Windows.Threading;
using PCHUB.Renter.Services;

namespace PCHUB.Renter;

public partial class MainWindow : Window
{
    private readonly PchubApiClient _api = new();
    private SignalingClient? _signal;
    private string? _activeRentalId;
    private CancellationTokenSource? _connectCts;

    public MainWindow()
    {
        InitializeComponent();
        AppendLog("PCHUB Renter 0.1.0 — direct streaming (Connect required)");
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
            if (_signal is not null) await _signal.DisposeAsync();
            _signal = null;

            var prep = await _api.PrepareStreamConnectAsync(_activeRentalId);
            var webrtc = prep.Webrtc ?? throw new InvalidOperationException("Missing WebRTC config");
            AppendLog(prep.Message ?? "Preparing stream...");
            AppendLog($"STUN: {string.Join(", ", webrtc.StunServers)}");

            _connectCts = new CancellationTokenSource();
            _signal = new SignalingClient();
            _signal.OnLog += AppendLog;
            _signal.OnMessage += OnSignalMessage;
            await _signal.ConnectAndJoinAsync(
                webrtc.SignalUrl,
                prep.RentalId,
                _api.Token,
                _connectCts.Token
            );
            AppendLog("Signaling connected. WebRTC media layer coming next.");
        }
        catch (Exception ex)
        {
            AppendLog($"Connect error: {ex.Message}");
            ConnectBtn.IsEnabled = true;
        }
    }

    private void OnSignalMessage(string json)
    {
        Dispatcher.Invoke(() =>
        {
            if (json.Contains("\"type\":\"peer\"") && json.Contains("\"joined\""))
                AppendLog("Host joined signaling room.");
        });
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
        if (_signal is not null) await _signal.DisposeAsync();
        _api.Dispose();
        base.OnClosed(e);
    }
}
