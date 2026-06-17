using System.Runtime.InteropServices;
using SIPSorceryMedia.Abstractions;
using Vortice.Direct3D;
using Vortice.Direct3D11;
using Vortice.DXGI;
using Vortice.Mathematics;

namespace PCHUB.Renter.Rendering;

/// <summary>
/// Presents decoded RGB/BGRA frames via a DXGI flip swap chain bound to an HWND.
/// </summary>
public sealed class D3D11VideoPresenter : IDisposable
{
    private IDXGIFactory2? _factory;
    private ID3D11Device? _device;
    private ID3D11DeviceContext? _context;
    private IDXGISwapChain1? _swapChain;
    private ID3D11Texture2D? _backBuffer;
    private byte[]? _uploadBuffer;
    private int _width;
    private int _height;
    private bool _disposed;

    public void Initialize(IntPtr hwnd, int width, int height)
    {
        if (hwnd == IntPtr.Zero) throw new ArgumentException("HWND is required.", nameof(hwnd));

        _width = Math.Max(1, width);
        _height = Math.Max(1, height);

        _factory = DXGI.CreateDXGIFactory2<IDXGIFactory2>(CreateFactoryFlags.None);
        _device = D3D11.D3D11CreateDevice(DriverType.Hardware, DeviceCreationFlags.BgraSupport);
        _context = _device.ImmediateContext;

        CreateSwapChain(hwnd, _width, _height);
    }

    public bool NeedsResize(int width, int height) =>
        width > 0 && height > 0 && (width != _width || height != _height);

    public void Resize(int width, int height)
    {
        if (_device is null || _swapChain is null) return;

        _width = Math.Max(1, width);
        _height = Math.Max(1, height);
        _backBuffer?.Dispose();
        _backBuffer = null;
        _uploadBuffer = null;

        _swapChain.ResizeBuffers(0, (uint)_width, (uint)_height, Format.Unknown, SwapChainFlags.None);
        _backBuffer = _swapChain.GetBuffer<ID3D11Texture2D>(0);
    }

    public ID3D11Device? Device => _device;

    public void EnsureInitialized(IntPtr hwnd, int width, int height)
    {
        if (_device is not null) return;
        Initialize(hwnd, width, height);
    }

    public bool PresentGpuTexture(ID3D11DeviceContext context, ID3D11Texture2D src, int width, int height)
    {
        if (_disposed || _context is null || _swapChain is null || _backBuffer is null) return false;
        if (width <= 0 || height <= 0) return false;

        if (NeedsResize(width, height))
            Resize(width, height);

        context.CopyResource(_backBuffer, src);
        _swapChain.Present(0, PresentFlags.None);
        return true;
    }

    public bool Present(RawImage raw)
    {
        if (_disposed || _context is null || _swapChain is null || _backBuffer is null) return false;
        if (raw.Width <= 0 || raw.Height <= 0 || raw.Sample == IntPtr.Zero) return false;

        if (NeedsResize(raw.Width, raw.Height))
            Resize(raw.Width, raw.Height);

        var frameBytes = PackBgra(raw);
        if (frameBytes is null) return false;

        var box = new Box(0, 0, 0, raw.Width, raw.Height, 1);
        fixed (byte* ptr = frameBytes)
        {
            _context.UpdateSubresource(
                _backBuffer,
                0,
                box,
                (IntPtr)ptr,
                (uint)(raw.Width * 4),
                (uint)frameBytes.Length);
        }

        _swapChain.Present(0, PresentFlags.None);
        return true;
    }

    private byte[]? PackBgra(RawImage raw)
    {
        var pixels = raw.Width * raw.Height;
        var needed = pixels * 4;
        if (_uploadBuffer is null || _uploadBuffer.Length < needed)
            _uploadBuffer = new byte[needed];

        if (raw.PixelFormat == VideoPixelFormatsEnum.Bgra)
        {
            var stride = raw.Stride > 0 ? raw.Stride : raw.Width * 4;
            var rowBytes = raw.Width * 4;
            unsafe
            {
                var src = (byte*)raw.Sample;
                for (var y = 0; y < raw.Height; y++)
                    Marshal.Copy(src + y * stride, _uploadBuffer, y * rowBytes, rowBytes);
            }
            return _uploadBuffer;
        }

        if (raw.PixelFormat == VideoPixelFormatsEnum.Bgr)
        {
            var srcStride = raw.Stride > 0 ? raw.Stride : raw.Width * 3;
            unsafe
            {
                var src = (byte*)raw.Sample;
                var dst = 0;
                for (var y = 0; y < raw.Height; y++)
                {
                    var row = src + y * srcStride;
                    for (var x = 0; x < raw.Width; x++)
                    {
                        _uploadBuffer[dst++] = row[x * 3];
                        _uploadBuffer[dst++] = row[x * 3 + 1];
                        _uploadBuffer[dst++] = row[x * 3 + 2];
                        _uploadBuffer[dst++] = 255;
                    }
                }
            }
            return _uploadBuffer;
        }

        if (raw.PixelFormat == VideoPixelFormatsEnum.Rgb)
        {
            var srcStride = raw.Stride > 0 ? raw.Stride : raw.Width * 3;
            unsafe
            {
                var src = (byte*)raw.Sample;
                var dst = 0;
                for (var y = 0; y < raw.Height; y++)
                {
                    var row = src + y * srcStride;
                    for (var x = 0; x < raw.Width; x++)
                    {
                        _uploadBuffer[dst++] = row[x * 3 + 2];
                        _uploadBuffer[dst++] = row[x * 3 + 1];
                        _uploadBuffer[dst++] = row[x * 3];
                        _uploadBuffer[dst++] = 255;
                    }
                }
            }
            return _uploadBuffer;
        }

        return null;
    }

    private void CreateSwapChain(IntPtr hwnd, int width, int height)
    {
        if (_factory is null || _device is null) return;

        _swapChain?.Dispose();
        _backBuffer?.Dispose();

        var desc = new SwapChainDescription1
        {
            Width = (uint)width,
            Height = (uint)height,
            Format = Format.B8G8R8A8_UNorm,
            BufferCount = 2,
            BufferUsage = Usage.RenderTargetOutput,
            SwapEffect = SwapEffect.FlipDiscard,
            SampleDescription = new SampleDescription(1, 0),
            Scaling = Scaling.Stretch,
            Stereo = false,
            AlphaMode = AlphaMode.Ignore,
        };

        _swapChain = _factory.CreateSwapChainForHwnd(_device, hwnd, desc);
        _backBuffer = _swapChain.GetBuffer<ID3D11Texture2D>(0);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        _backBuffer?.Dispose();
        _swapChain?.Dispose();
        _context?.Dispose();
        _device?.Dispose();
        _factory?.Dispose();

        _backBuffer = null;
        _swapChain = null;
        _context = null;
        _device = null;
        _factory = null;
        _uploadBuffer = null;
    }
}
