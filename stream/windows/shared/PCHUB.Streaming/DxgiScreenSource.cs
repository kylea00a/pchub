using System.Diagnostics;
using SharpGen.Runtime;
using SIPSorceryMedia.Abstractions;
using Vortice.Direct3D;
using Vortice.DXGI;
using Vortice.Direct3D11;
using Vortice.Mathematics;

namespace PCHUB.Streaming;

/// <summary>
/// Low-latency primary display capture using DXGI Desktop Duplication.
/// Emits raw BGRA32 frames. The encoder will convert as needed.
/// </summary>
public sealed class DxgiScreenSource : IVideoSource, IDisposable
{
    private readonly MediaFormatManager<VideoFormat> _formatManager;
    private CancellationTokenSource? _cts;
    private Task? _loop;
    private bool _closed;
    private volatile int _minFrameSpacingMs = 15; // ~60fps default.

    public void SetTargetFps(int fps)
    {
        fps = Math.Clamp(fps, 15, 120);
        _minFrameSpacingMs = (int)Math.Round(1000.0 / fps);
    }

    public event EncodedSampleDelegate? OnVideoSourceEncodedSample;
    public event RawVideoSampleDelegate? OnVideoSourceRawSample;
    public event RawVideoSampleFasterDelegate? OnVideoSourceRawSampleFaster;
    public event GpuTextureSampleDelegate? OnVideoSourceGpuTexture;
    public event SourceErrorDelegate? OnVideoSourceError;

    public DxgiScreenSource()
    {
        // Provide H264 + VP8 so we can prefer gaming-grade HW H264 and fall back to VP8.
        // Width/height is set dynamically based on capture output and/or selected format.
        _formatManager = new MediaFormatManager<VideoFormat>(new List<VideoFormat>
        {
            new(VideoCodecsEnum.H264, 1280, 720, 60),
            new(VideoCodecsEnum.H264, 1280, 720, 30),
            new(VideoCodecsEnum.VP8, 1280, 720, 60),
            new(VideoCodecsEnum.VP8, 1280, 720, 30),
        });
    }

    public List<VideoFormat> GetVideoSourceFormats() => _formatManager.GetSourceFormats();

    public void SetVideoSourceFormat(VideoFormat videoFormat) => _formatManager.SetSelectedFormat(videoFormat);

    public void RestrictFormats(Func<VideoFormat, bool> filter) => _formatManager.RestrictFormats(filter);

    public bool HasEncodedVideoSubscribers() => OnVideoSourceEncodedSample != null;

    public void ForceKeyFrame() { }

    public void ExternalVideoSourceRawSample(uint duration, int width, int height, byte[] sample, VideoPixelFormatsEnum pixelFormat) { }

    public void ExternalVideoSourceRawSampleFaster(uint duration, RawImage rawImage) { }

    public bool IsVideoSourcePaused() => false;

    public Task StartVideo() => Start();

    public Task PauseVideo() => Task.CompletedTask;

    public Task ResumeVideo() => Task.CompletedTask;

    public Task CloseVideo() => Close();

    public Task Start()
    {
        if (_loop is not null) return Task.CompletedTask;
        _cts = new CancellationTokenSource();
        _loop = Task.Run(() => CaptureLoop(_cts.Token), _cts.Token);
        return Task.CompletedTask;
    }

    public Task Close()
    {
        _closed = true;
        try { _cts?.Cancel(); } catch { }
        return Task.CompletedTask;
    }

    private void Fail(string err)
    {
        if (_closed) return;
        OnVideoSourceError?.Invoke(err);
    }

    private unsafe void CaptureLoop(CancellationToken ct)
    {
        try
        {
            using var dxgiFactory = DXGI.CreateDXGIFactory1<IDXGIFactory1>();
            using var adapter = dxgiFactory.EnumAdapters1(0);
            using var output = adapter.EnumOutputs(0);
            using var output1 = output.QueryInterface<IDXGIOutput1>();

            FeatureLevel[] featureLevels = [FeatureLevel.Level_11_0];
            D3D11.D3D11CreateDevice(
                adapter,
                DriverType.Unknown,
                DeviceCreationFlags.BgraSupport,
                featureLevels,
                out ID3D11Device device,
                out _,
                out ID3D11DeviceContext context).CheckError();

            using var dupl = output1.DuplicateOutput(device);

            var selected = _formatManager.SelectedFormat;
            var targetW = selected.Width > 0 ? selected.Width : 1280;
            var targetH = selected.Height > 0 ? selected.Height : 720;

            // We'll capture at duplication's native resolution, then crop to target size top-left.
            ID3D11Texture2D? gpuFrame = null;
            ID3D11Texture2D? staging = null;

            var sw = Stopwatch.StartNew();
            long lastTick = 0;
            while (!ct.IsCancellationRequested && !_closed)
            {
                // Throttle to ~60fps max.
                var now = sw.ElapsedMilliseconds;
                if (now - lastTick < _minFrameSpacingMs)
                {
                    Thread.Sleep(1);
                    continue;
                }
                lastTick = now;

                IDXGIResource? desktopResource = null;
                OutputDuplicateFrameInformation frameInfo;
                try
                {
                    // Non-blocking-ish: short timeout.
                    dupl.AcquireNextFrame(5, out frameInfo, out desktopResource);
                }
                catch
                {
                    // Nothing ready.
                    continue;
                }

                try
                {
                    using var tex = desktopResource.QueryInterface<ID3D11Texture2D>();
                    var desc = tex.Description;

                    var width = Math.Min(desc.Width, targetW);
                    var height = Math.Min(desc.Height, targetH);

                    if (OnVideoSourceGpuTexture != null)
                    {
                        if (gpuFrame is null ||
                            gpuFrame.Description.Width != (uint)targetW ||
                            gpuFrame.Description.Height != (uint)targetH)
                        {
                            gpuFrame?.Dispose();
                            gpuFrame = device.CreateTexture2D(new Texture2DDescription
                            {
                                Width = (uint)targetW,
                                Height = (uint)targetH,
                                MipLevels = 1,
                                ArraySize = 1,
                                Format = Format.B8G8R8A8_UNorm,
                                SampleDescription = new SampleDescription(1, 0),
                                Usage = ResourceUsage.Default,
                                BindFlags = BindFlags.None,
                                CPUAccessFlags = CpuAccessFlags.None,
                            });
                        }

                        var srcBox = new Box(0, 0, 0, width, height, 1);
                        context.CopySubresourceRegion(gpuFrame, 0, 0, 0, 0, tex, 0, srcBox);

                        OnVideoSourceGpuTexture.Invoke(new GpuTextureFrame
                        {
                            Device = device,
                            Context = context,
                            Texture = gpuFrame,
                            Width = targetW,
                            Height = targetH,
                        });
                    }
                    else
                    {
                    // Create/resize staging texture (CPU readable).
                    if (staging is null || staging.Description.Width != desc.Width || staging.Description.Height != desc.Height)
                    {
                        staging?.Dispose();
                        var stagingDesc = desc;
                        stagingDesc.Usage = ResourceUsage.Staging;
                        stagingDesc.BindFlags = BindFlags.None;
                        stagingDesc.CPUAccessFlags = CpuAccessFlags.Read;
                        stagingDesc.MiscFlags = ResourceOptionFlags.None;
                        staging = device.CreateTexture2D(stagingDesc);
                    }

                    context.CopyResource(staging!, tex);

                    var dataBox = context.Map(staging!, 0, MapMode.Read, MapFlags.None);
                    try
                    {
                        // Fast path: hand a pointer directly to the consumer (valid until Unmap).
                        // We crop top-left by setting Width/Height but keeping the original stride.
                        if (OnVideoSourceRawSampleFaster != null)
                        {
                            var raw = new RawImage
                            {
                                Width = width,
                                Height = height,
                                Stride = dataBox.RowPitch,
                                Sample = dataBox.DataPointer,
                                PixelFormat = VideoPixelFormatsEnum.Bgra,
                            };
                            OnVideoSourceRawSampleFaster.Invoke(16, raw);
                        }
                        else if (OnVideoSourceRawSample != null)
                        {
                            // Fallback: copy into a tightly packed BGRA buffer.
                            var stride = dataBox.RowPitch;
                            var outStride = width * 4;
                            var buf = new byte[height * outStride];

                            fixed (byte* dst0 = buf)
                            {
                                var src0 = (byte*)dataBox.DataPointer;
                                for (var y = 0; y < height; y++)
                                {
                                    Buffer.MemoryCopy(src0 + y * stride, dst0 + y * outStride, outStride, outStride);
                                }
                            }

                            OnVideoSourceRawSample.Invoke(16, width, height, buf, VideoPixelFormatsEnum.Bgra);
                        }
                    }
                    finally
                    {
                        context.Unmap(staging!, 0);
                    }
                    }
                }
                finally
                {
                    desktopResource?.Dispose();
                    dupl.ReleaseFrame();
                }
            }

            gpuFrame?.Dispose();
            staging?.Dispose();
            device.Dispose();
            context.Dispose();
        }
        catch (Exception ex)
        {
            Fail($"DXGI capture error: {ex.Message}");
        }
    }

    public void Dispose()
    {
        _closed = true;
        try { _cts?.Cancel(); } catch { }
        _cts?.Dispose();
    }
}

