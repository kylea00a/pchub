using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using PCHUB.Streaming.Input;

namespace PCHUB.Renter.Input;

public sealed class RenterInputCapture
{
    private const uint MapvkVkToVsc = 0;
    private readonly FrameworkElement _surface;
    private InputDataChannel? _channel;
    private uint _streamWidth;
    private uint _streamHeight;
    private bool _enabled;
    private bool _relativeMouse;
    private Point _lastPos;

    public RenterInputCapture(FrameworkElement surface) => _surface = surface;

    public void Attach(InputDataChannel channel)
    {
        Detach();
        _channel = channel;
        _surface.MouseMove += OnMouseMove;
        _surface.MouseDown += OnMouseDown;
        _surface.MouseUp += OnMouseUp;
        _surface.MouseWheel += OnMouseWheel;
        _surface.KeyDown += OnKeyDown;
        _surface.KeyUp += OnKeyUp;
        _surface.Focusable = true;
        _enabled = true;
    }

    public void Detach()
    {
        _enabled = false;
        _relativeMouse = false;
        _surface.MouseMove -= OnMouseMove;
        _surface.MouseDown -= OnMouseDown;
        _surface.MouseUp -= OnMouseUp;
        _surface.MouseWheel -= OnMouseWheel;
        _surface.KeyDown -= OnKeyDown;
        _surface.KeyUp -= OnKeyUp;
        _channel = null;
    }

    public void SetStreamSize(uint width, uint height)
    {
        _streamWidth = width;
        _streamHeight = height;
    }

    public void Focus() => _surface.Focus();

    private void OnMouseMove(object sender, MouseEventArgs e)
    {
        if (!_enabled || _channel is null) return;

        var pos = e.GetPosition(_surface);
        if (_relativeMouse)
        {
            var dx = (short)Math.Clamp(pos.X - _lastPos.X, short.MinValue, short.MaxValue);
            var dy = (short)Math.Clamp(pos.Y - _lastPos.Y, short.MinValue, short.MaxValue);
            _lastPos = pos;
            // In relative mode, send deltas only.
            if (dx != 0 || dy != 0)
                _channel.Send(InputProtocol.MouseRelMove(dx, dy));
            return;
        }

        if (!TryMap(pos, out var nx, out var ny)) return;
        _channel.Send(InputProtocol.MouseMove(nx, ny));
    }

    private void OnMouseDown(object sender, MouseButtonEventArgs e)
    {
        if (!_enabled || _channel is null) return;
        _surface.Focus();
        _lastPos = e.GetPosition(_surface);

        // Hold Right Mouse Button to enable relative mouse mode (better FPS aiming).
        if (e.ChangedButton == MouseButton.Right && !_relativeMouse)
        {
            _relativeMouse = true;
            _channel.Send(InputProtocol.MouseRelMode(true));
        }
        if (TryMap(e.GetPosition(_surface), out var nx, out var ny))
            _channel.Send(InputProtocol.MouseMove(nx, ny));
        _channel.Send(InputProtocol.MouseButton(ButtonIndex(e.ChangedButton), down: true));
        e.Handled = true;
    }

    private void OnMouseUp(object sender, MouseButtonEventArgs e)
    {
        if (!_enabled || _channel is null) return;
        _channel.Send(InputProtocol.MouseButton(ButtonIndex(e.ChangedButton), down: false));
        if (e.ChangedButton == MouseButton.Right && _relativeMouse)
        {
            _relativeMouse = false;
            _channel.Send(InputProtocol.MouseRelMode(false));
        }
        e.Handled = true;
    }

    private void OnMouseWheel(object sender, MouseWheelEventArgs e)
    {
        if (!_enabled || _channel is null) return;
        _channel.Send(InputProtocol.MouseWheel((short)e.Delta));
        e.Handled = true;
    }

    private void OnKeyDown(object sender, KeyEventArgs e)
    {
        if (!_enabled || _channel is null) return;
        if (!TryGetScanCode(e.Key, out var scan, out var extended)) return;
        _channel.Send(InputProtocol.Key(scan, down: true, extended));
        e.Handled = true;
    }

    private void OnKeyUp(object sender, KeyEventArgs e)
    {
        if (!_enabled || _channel is null) return;
        if (!TryGetScanCode(e.Key, out var scan, out var extended)) return;
        _channel.Send(InputProtocol.Key(scan, down: false, extended));
        e.Handled = true;
    }

    [DllImport("user32.dll")]
    private static extern uint MapVirtualKey(uint uCode, uint uMapType);

    private static bool TryGetScanCode(Key key, out ushort scanCode, out bool extended)
    {
        scanCode = 0;
        extended = key is Key.RightAlt or Key.RightCtrl or Key.Insert or Key.Delete or Key.Home or Key.End
            or Key.PageDown or Key.PageUp or Key.Left or Key.Right or Key.Up or Key.Down or Key.NumPadEnter
            or Key.Divide;
        var vk = KeyInterop.VirtualKeyFromKey(key);
        if (vk == 0) return false;
        scanCode = (ushort)MapVirtualKey((uint)vk, MapvkVkToVsc);
        return scanCode != 0;
    }

    private bool TryMap(Point pos, out float nx, out float ny)
    {
        nx = ny = 0;
        if (_streamWidth == 0 || _streamHeight == 0) return false;

        var elemW = _surface.ActualWidth;
        var elemH = _surface.ActualHeight;
        if (elemW <= 0 || elemH <= 0) return false;

        var streamAspect = _streamWidth / (double)_streamHeight;
        var elemAspect = elemW / elemH;

        double renderW, renderH, offsetX, offsetY;
        if (streamAspect > elemAspect)
        {
            renderW = elemW;
            renderH = elemW / streamAspect;
            offsetX = 0;
            offsetY = (elemH - renderH) / 2;
        }
        else
        {
            renderH = elemH;
            renderW = elemH * streamAspect;
            offsetX = (elemW - renderW) / 2;
            offsetY = 0;
        }

        var x = pos.X - offsetX;
        var y = pos.Y - offsetY;
        if (x < 0 || y < 0 || x > renderW || y > renderH) return false;

        nx = (float)(x / renderW);
        ny = (float)(y / renderH);
        return true;
    }

    private static byte ButtonIndex(MouseButton button) => button switch
    {
        MouseButton.Left => 0,
        MouseButton.Right => 1,
        MouseButton.Middle => 2,
        _ => 0,
    };
}
