using System.Runtime.InteropServices;
using SIPSorcery.Net;

namespace PCHUB.Streaming.Input;

public sealed class InputDataChannel
{
    public const string ChannelLabel = "pchub-input";

    private readonly RTCPeerConnection _pc;
    private readonly bool _isClient;
    private readonly Action<byte[]>? _onInput;
    private RTCDataChannel? _channel;
    private bool _open;

    public event Action<string>? OnLog;

    private InputDataChannel(RTCPeerConnection pc, bool isClient, Action<byte[]>? onInput)
    {
        _pc = pc;
        _isClient = isClient;
        _onInput = onInput;
        if (!isClient)
            _pc.ondatachannel += OnRemoteDataChannel;
    }

    public static InputDataChannel CreateClient(RTCPeerConnection pc) => new(pc, true, null);

    public static InputDataChannel CreateHost(RTCPeerConnection pc, Action<byte[]> onInput) =>
        new(pc, false, onInput);

    public bool IsOpen => _open;

    public async Task EnsureClientChannelAsync()
    {
        if (!_isClient || _channel is not null) return;
        _channel = await _pc.createDataChannel(ChannelLabel);
        WireChannel(_channel);
        Log("Input channel created");
    }

    private void OnRemoteDataChannel(RTCDataChannel dc)
    {
        if (!string.Equals(dc.label, ChannelLabel, StringComparison.Ordinal)) return;
        _channel = dc;
        WireChannel(dc);
        Log("Input channel received from renter");
    }

    private void WireChannel(RTCDataChannel dc)
    {
        dc.onopen += () =>
        {
            _open = true;
            Log("Input channel open");
        };
        dc.onclose += () =>
        {
            _open = false;
            Log("Input channel closed");
        };
        dc.onmessage += (_, _, data) =>
        {
            if (_onInput is not null && data.Length > 0)
                _onInput(data);
        };
    }

    public void Send(byte[] data)
    {
        if (!_open || _channel is null) return;
        try { _channel.send(data); } catch { }
    }

    private void Log(string msg) => OnLog?.Invoke(msg);
}
