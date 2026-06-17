using SIPSorcery.Net;

namespace PCHUB.Streaming;

/// <summary>
/// Simple RTCP-driven bitrate controller tuned for gaming:
/// - cut fast on loss/jitter spikes
/// - ramp up slowly when clean
/// - request keyframes after loss spikes
/// </summary>
public sealed class AdaptiveBitrateController : IDisposable
{
    private readonly object _gate = new();
    private readonly RTCPeerConnection _pc;
    private readonly Action<long> _setVideoBitrateBps;
    private readonly Action _forceKeyFrame;
    private readonly Action<string> _log;
    private readonly Action<int>? _setTargetFps;

    private long _bitrateBps;
    private readonly long _minBps;
    private readonly long _maxBps;
    private DateTime _lastUpdate = DateTime.MinValue;
    private DateTime _lastKeyframeRequest = DateTime.MinValue;
    private double _encodeMsEwma = 0;
    private int _targetFps = 60;

    // SenderReport tracking (for RTT estimate).
    private uint? _lastLsr;
    private DateTime _lastSrSentAt = DateTime.MinValue;

    public AdaptiveBitrateController(
        RTCPeerConnection pc,
        long initialBps,
        long minBps,
        long maxBps,
        Action<long> setVideoBitrateBps,
        Action forceKeyFrame,
        Action<string> log,
        Action<int>? setTargetFps = null)
    {
        _pc = pc;
        _bitrateBps = initialBps;
        _minBps = minBps;
        _maxBps = maxBps;
        _setVideoBitrateBps = setVideoBitrateBps;
        _forceKeyFrame = forceKeyFrame;
        _log = log;
        _setTargetFps = setTargetFps;

        _pc.OnReceiveReport += OnReceiveReport;
        _pc.OnSendReport += OnSendReport;
        _setVideoBitrateBps(_bitrateBps);
        _setTargetFps?.Invoke(_targetFps);
    }

    public void ReportEncodeTimeMs(double ms)
    {
        // EWMA ~ 10% weight new sample.
        _encodeMsEwma = _encodeMsEwma <= 0 ? ms : (_encodeMsEwma * 0.9 + ms * 0.1);
    }

    private void OnSendReport(SDPMediaTypesEnum media, RTCPCompoundPacket report)
    {
        if (media != SDPMediaTypesEnum.video) return;
        var sr = report?.SenderReport;
        if (sr == null) return;
        // LSR is middle 32 bits of NTP timestamp.
        _lastLsr = (uint)((sr.NtpTimestamp >> 16) & 0xFFFFFFFF);
        _lastSrSentAt = DateTime.UtcNow;
    }

    private void OnReceiveReport(System.Net.IPEndPoint ep, SDPMediaTypesEnum media, RTCPCompoundPacket report)
    {
        if (media != SDPMediaTypesEnum.video) return;
        var rr = report?.ReceiverReport;
        if (rr?.ReceptionReports == null || rr.ReceptionReports.Count == 0) return;

        // Choose max fraction lost across blocks (0..255 => 0..1).
        var maxFracLost = 0.0;
        uint maxJitter = 0;
        double? rttMs = null;
        foreach (var block in rr.ReceptionReports)
        {
            // ReceptionReportSample has FractionLost as byte in most builds; use reflection-safe pattern.
            try
            {
                var fracLostProp = block.GetType().GetProperty("FractionLost");
                if (fracLostProp?.GetValue(block) is byte b)
                    maxFracLost = Math.Max(maxFracLost, b / 256.0);
            }
            catch { }
            try
            {
                var jitterProp = block.GetType().GetProperty("Jitter");
                if (jitterProp?.GetValue(block) is uint j)
                    maxJitter = Math.Max(maxJitter, j);
            }
            catch { }

            // RTT estimate from LSR/DLSR if we can line up with our last SR.
            try
            {
                var lsrProp = block.GetType().GetProperty("LastSenderReportTimestamp");
                var dlsrProp = block.GetType().GetProperty("DelaySinceLastSenderReport");
                if (lsrProp?.GetValue(block) is uint lsr && dlsrProp?.GetValue(block) is uint dlsr && _lastLsr.HasValue)
                {
                    if (lsr != 0 && lsr == _lastLsr.Value && _lastSrSentAt != DateTime.MinValue)
                    {
                        // dlsr is in 1/65536 seconds.
                        var dlsrMs = (dlsr / 65536.0) * 1000.0;
                        var elapsedMs = (DateTime.UtcNow - _lastSrSentAt).TotalMilliseconds;
                        var est = elapsedMs - dlsrMs;
                        if (est >= 0 && est < 5000) rttMs = est;
                    }
                }
            }
            catch { }
        }

        lock (_gate)
        {
            // Rate limit controller changes (avoid oscillation).
            var now = DateTime.UtcNow;
            if ((now - _lastUpdate).TotalMilliseconds < 500) return;
            _lastUpdate = now;

            // Auto-tune policy (no user input):
            // 1) If encoder can't meet frame budget, drop FPS (60 -> 30) and cut bitrate.
            // 2) If network loss/jitter/RTT bad, cut bitrate fast + keyframe.
            // 3) If clean, ramp bitrate slowly and restore FPS when encoder recovers.
            var encodeBudgetMs = _targetFps >= 60 ? 16.7 : 33.4;
            var encodeOverBudget = _encodeMsEwma > (encodeBudgetMs * 0.85);
            if (encodeOverBudget && _targetFps == 60)
            {
                _targetFps = 30;
                _setTargetFps?.Invoke(_targetFps);
                RequestKeyframeIfNeeded(now, "fps downshift");
                _log($"AutoTune: encoder { _encodeMsEwma:0.0}ms -> FPS {_targetFps}");
            }
            else if (!encodeOverBudget && _targetFps == 30 && _encodeMsEwma > 0 && _encodeMsEwma < 10.0)
            {
                _targetFps = 60;
                _setTargetFps?.Invoke(_targetFps);
                RequestKeyframeIfNeeded(now, "fps restore");
                _log($"AutoTune: encoder { _encodeMsEwma:0.0}ms -> FPS {_targetFps}");
            }

            var badNetwork = maxFracLost >= 0.02 || (rttMs.HasValue && rttMs.Value > 90) || maxJitter > 25_000;
            long newBps = _bitrateBps;
            if (badNetwork || maxFracLost >= 0.04)
            {
                newBps = (long)Math.Max(_minBps, _bitrateBps * 0.70);
                RequestKeyframeIfNeeded(now, badNetwork ? "network degrade" : "loss spike");
            }
            else if (maxFracLost >= 0.008)
            {
                newBps = (long)Math.Max(_minBps, _bitrateBps * 0.88);
            }
            else
            {
                newBps = (long)Math.Min(_maxBps, _bitrateBps + 400_000);
            }

            if (newBps != _bitrateBps)
            {
                _bitrateBps = newBps;
                _setVideoBitrateBps(_bitrateBps);
                var rttStr = rttMs.HasValue ? $"{rttMs.Value:0}ms" : "n/a";
                _log($"AutoTune: loss={(maxFracLost * 100):0.0}% jitter={maxJitter} rtt={rttStr} enc={_encodeMsEwma:0.0}ms fps={_targetFps} -> {(_bitrateBps / 1000)}kbps");
            }
        }
    }

    private void RequestKeyframeIfNeeded(DateTime now, string reason)
    {
        if ((now - _lastKeyframeRequest).TotalMilliseconds < 1500) return;
        _lastKeyframeRequest = now;
        _forceKeyFrame();
        _log($"Keyframe requested ({reason})");
    }

    public void Dispose()
    {
        _pc.OnReceiveReport -= OnReceiveReport;
        _pc.OnSendReport -= OnSendReport;
    }
}

