using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;
using SIPSorcery.Media;
using SIPSorceryMedia.Abstractions;

namespace PCHUB.Streaming;

/// <summary>
/// Captures system/desktop audio via WASAPI loopback (what the host PC is playing).
/// Encodes to the negotiated WebRTC audio codec (Opus preferred).
/// </summary>
public sealed class HostLoopbackAudioSource : IDisposable
{
    private const int FrameMs = 20;

    private readonly AudioEncoder _encoder;
    private readonly MediaFormatManager<AudioFormat> _formatManager;
    private readonly List<short> _pcmQueue = new();
    private WasapiLoopbackCapture? _capture;
    private bool _started;

    public event EncodedSampleDelegate? OnAudioSourceEncodedSample;
    public event SourceErrorDelegate? OnAudioSourceError;

    public HostLoopbackAudioSource(AudioEncoder encoder)
    {
        _encoder = encoder;
        _formatManager = new MediaFormatManager<AudioFormat>(encoder.SupportedFormats);
        // Gaming: prefer wideband Opus; allow G.722 fallback if peer rejects Opus.
        _formatManager.RestrictFormats(f =>
            f.Codec == AudioCodecsEnum.OPUS ||
            f.Codec == AudioCodecsEnum.G722 ||
            f.Codec == AudioCodecsEnum.PCMU);
    }

    public List<AudioFormat> GetAudioSourceFormats() => _formatManager.GetSourceFormats();

    public void SetAudioSourceFormat(AudioFormat format) => _formatManager.SetSelectedFormat(format);

    public Task Start()
    {
        if (_started) return Task.CompletedTask;
        try
        {
            _capture = new WasapiLoopbackCapture();
            _capture.DataAvailable += OnDataAvailable;
            _capture.RecordingStopped += (_, e) =>
            {
                if (e.Exception is not null)
                    OnAudioSourceError?.Invoke($"Loopback stopped: {e.Exception.Message}");
            };
            _capture.StartRecording();
            _started = true;
        }
        catch (Exception ex)
        {
            OnAudioSourceError?.Invoke($"Loopback init failed: {ex.Message}");
        }
        return Task.CompletedTask;
    }

    public Task Close()
    {
        _started = false;
        _pcmQueue.Clear();
        if (_capture is null) return Task.CompletedTask;
        try
        {
            _capture.DataAvailable -= OnDataAvailable;
            _capture.StopRecording();
            _capture.Dispose();
        }
        catch { }
        _capture = null;
        return Task.CompletedTask;
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        if (!_started || _capture is null || e.BytesRecorded <= 0) return;
        var format = _formatManager.SelectedFormat;
        if (format.IsEmpty()) return;

        try
        {
            using var ms = new MemoryStream(e.Buffer, 0, e.BytesRecorded, writable: false);
            using var raw = new RawSourceWaveStream(ms, _capture.WaveFormat);
            ISampleProvider samples = new WaveToSampleProvider(raw);
            if (samples.WaveFormat.Channels > 1)
            {
                samples = new StereoToMonoSampleProvider(samples)
                {
                    LeftVolume = 0.5f,
                    RightVolume = 0.5f,
                };
            }
            if (samples.WaveFormat.SampleRate != format.ClockRate)
                samples = new WdlResamplingSampleProvider(samples, format.ClockRate);

            var pcm16 = new SampleToWaveProvider16(samples);
            var chunk = new byte[format.ClockRate * 2 / 25]; // ~40ms mono 16-bit chunks
            int read;
            while ((read = pcm16.Read(chunk, 0, chunk.Length)) > 0)
            {
                var sampleCount = read / 2;
                var prev = _pcmQueue.Count;
                _pcmQueue.Capacity = Math.Max(_pcmQueue.Capacity, prev + sampleCount);
                for (var i = 0; i < sampleCount; i++)
                {
                    _pcmQueue.Add(BitConverter.ToInt16(chunk, i * 2));
                }
            }

            EmitCompleteFrames(format);
        }
        catch (Exception ex)
        {
            OnAudioSourceError?.Invoke(ex.Message);
        }
    }

    private void EmitCompleteFrames(AudioFormat format)
    {
        var frameSamples = format.ClockRate * format.ChannelCount * FrameMs / 1000;
        if (frameSamples <= 0) return;

        while (_pcmQueue.Count >= frameSamples)
        {
            var frame = _pcmQueue.GetRange(0, frameSamples).ToArray();
            _pcmQueue.RemoveRange(0, frameSamples);
            var encoded = _encoder.EncodeAudio(frame, format);
            if (encoded is { Length: > 0 })
                OnAudioSourceEncodedSample?.Invoke((uint)FrameMs, encoded);
        }
    }

    public void Dispose() => _ = Close();
}
