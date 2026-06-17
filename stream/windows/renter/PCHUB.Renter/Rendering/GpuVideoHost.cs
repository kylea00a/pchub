using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using PCHUB.Streaming;
using SIPSorceryMedia.Abstractions;
using Vortice.Direct3D11;

namespace PCHUB.Renter.Rendering;

/// <summary>
/// WPF HWND host that letterboxes a D3D11 swap chain inside the video panel.
/// </summary>
public sealed class GpuVideoHost : HwndHost
{
    private const int WsChild = 0x40000000;
    private const int WsVisible = 0x10000000;

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateWindowEx(
        int dwExStyle,
        string lpClassName,
        string? lpWindowName,
        int dwStyle,
        int x,
        int y,
        int nWidth,
        int nHeight,
        IntPtr hWndParent,
        IntPtr hMenu,
        IntPtr hInstance,
        IntPtr lpParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyWindow(IntPtr hwnd);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetModuleHandle(string? lpModuleName);

    private D3D11VideoPresenter? _presenter;
    private int _streamWidth;
    private int _streamHeight;

    public bool IsReady => _presenter is not null;

    public ID3D11Device? SharedDevice => _presenter?.Device;

    public bool PresentGpuTexture(GpuTextureFrame frame)
    {
        if (_presenter is null) return false;

        _streamWidth = frame.Width;
        _streamHeight = frame.Height;
        UpdateLetterboxLayout();
        return _presenter.PresentGpuTexture(frame.Context, frame.Texture, frame.Width, frame.Height);
    }

    protected override HandleRef BuildWindowCore(HandleRef hwndParent)
    {
        var hwnd = CreateWindowEx(
            0,
            "static",
            null,
            WsChild | WsVisible,
            0,
            0,
            1,
            1,
            hwndParent.Handle,
            IntPtr.Zero,
            GetModuleHandle(null),
            IntPtr.Zero);

        if (hwnd == IntPtr.Zero)
            throw new InvalidOperationException($"CreateWindowEx failed: {Marshal.GetLastWin32Error()}");

        _presenter = new D3D11VideoPresenter();
        _presenter.Initialize(hwnd, 1, 1);
        return new HandleRef(this, hwnd);
    }

    protected override void DestroyWindowCore(HandleRef hwnd)
    {
        _presenter?.Dispose();
        _presenter = null;
        DestroyWindow(hwnd.Handle);
    }

    protected override IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        const int wmEraseBkgnd = 0x0014;
        if (msg == wmEraseBkgnd)
        {
            handled = true;
            return new IntPtr(1);
        }

        return base.WndProc(hwnd, msg, wParam, lParam, ref handled);
    }

    public bool PresentFrame(RawImage raw)
    {
        if (_presenter is null) return false;

        _streamWidth = raw.Width;
        _streamHeight = raw.Height;
        UpdateLetterboxLayout();
        return _presenter.Present(raw);
    }

    public void Clear()
    {
        _streamWidth = 0;
        _streamHeight = 0;
        Visibility = Visibility.Collapsed;
    }

    public void UpdateLetterboxLayout(double? containerW = null, double? containerH = null)
    {
        if (_streamWidth <= 0 || _streamHeight <= 0) return;

        var cw = containerW ?? (Parent as FrameworkElement)?.ActualWidth ?? ActualWidth;
        var ch = containerH ?? (Parent as FrameworkElement)?.ActualHeight ?? ActualHeight;
        if (cw <= 0 || ch <= 0) return;

        var (w, h, x, y) = ComputeLetterbox(cw, ch, _streamWidth, _streamHeight);
        Width = w;
        Height = h;
        Margin = new Thickness(x, y, 0, 0);
        HorizontalAlignment = HorizontalAlignment.Left;
        VerticalAlignment = VerticalAlignment.Top;
        Visibility = Visibility.Visible;
    }

    private static (double w, double h, double x, double y) ComputeLetterbox(
        double containerW,
        double containerH,
        int streamW,
        int streamH)
    {
        var streamAspect = streamW / (double)streamH;
        var containerAspect = containerW / containerH;

        if (streamAspect > containerAspect)
        {
            var w = containerW;
            var h = containerW / streamAspect;
            return (w, h, 0, (containerH - h) / 2);
        }

        var height = containerH;
        var width = containerH * streamAspect;
        return (width, height, (containerW - width) / 2, 0);
    }
}
