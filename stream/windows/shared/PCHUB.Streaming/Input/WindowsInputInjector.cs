using System.Runtime.InteropServices;

namespace PCHUB.Streaming.Input;

public static class WindowsInputInjector
{
    private const int SmCxScreen = 0;
    private const int SmCyScreen = 1;
    private const int CaptureWidth = 1280;
    private const int CaptureHeight = 720;

    private const uint MouseeventfLeftdown = 0x0002;
    private const uint MouseeventfLeftup = 0x0004;
    private const uint MouseeventfRightdown = 0x0008;
    private const uint MouseeventfRightup = 0x0010;
    private const uint MouseeventfMiddledown = 0x0020;
    private const uint MouseeventfMiddleup = 0x0040;
    private const uint MouseeventfMove = 0x0001;
    private const uint MouseeventfWheel = 0x0800;
    private const uint KeyeventfScancode = 0x0008;
    private const uint KeyeventfKeyup = 0x0002;
    private const uint KeyeventfExtendedkey = 0x0001;

    private static volatile bool _relativeMouse;

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int index);

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    public static void Process(byte[] data)
    {
        if (data.Length < 1) return;
        switch (data[0])
        {
            case InputProtocol.MouseMove when data.Length >= 9:
                if (!_relativeMouse)
                {
                    MoveMouse(
                        BitConverter.ToSingle(data, 1),
                        BitConverter.ToSingle(data, 5));
                }
                break;
            case InputProtocol.MouseRelOn:
                _relativeMouse = true;
                break;
            case InputProtocol.MouseRelOff:
                _relativeMouse = false;
                break;
            case InputProtocol.MouseRelMove when data.Length >= 5:
                if (_relativeMouse)
                {
                    var dx = BitConverter.ToInt16(data, 1);
                    var dy = BitConverter.ToInt16(data, 3);
                    MoveMouseRelative(dx, dy);
                }
                break;
            case InputProtocol.MouseDown when data.Length >= 2:
                ClickMouse(data[1], down: true);
                break;
            case InputProtocol.MouseUp when data.Length >= 2:
                ClickMouse(data[1], down: false);
                break;
            case InputProtocol.MouseWheel when data.Length >= 3:
                WheelMouse(BitConverter.ToInt16(data, 1));
                break;
            case InputProtocol.KeyDown when data.Length >= 3:
                KeyEvent(BitConverter.ToUInt16(data, 1), down: true, extended: data.Length >= 4 && data[3] != 0);
                break;
            case InputProtocol.KeyUp when data.Length >= 3:
                KeyEvent(BitConverter.ToUInt16(data, 1), down: false, extended: data.Length >= 4 && data[3] != 0);
                break;
        }
    }

    private static void MoveMouse(float nx, float ny)
    {
        var screenW = GetSystemMetrics(SmCxScreen);
        var screenH = GetSystemMetrics(SmCyScreen);
        var capW = Math.Min(CaptureWidth, screenW);
        var capH = Math.Min(CaptureHeight, screenH);
        var x = (int)Math.Clamp(nx * (capW - 1), 0, capW - 1);
        var y = (int)Math.Clamp(ny * (capH - 1), 0, capH - 1);
        SetCursorPos(x, y);
    }

    private static void ClickMouse(byte button, bool down)
    {
        var flag = button switch
        {
            0 => down ? MouseeventfLeftdown : MouseeventfLeftup,
            1 => down ? MouseeventfRightdown : MouseeventfRightup,
            2 => down ? MouseeventfMiddledown : MouseeventfMiddleup,
            _ => 0u,
        };
        if (flag == 0) return;
        SendMouse(flag);
    }

    private static void WheelMouse(short delta)
    {
        var input = new INPUT
        {
            type = 0,
            U = new InputUnion
            {
                mi = new MOUSEINPUT { mouseData = (uint)delta, dwFlags = MouseeventfWheel },
            },
        };
        SendInput(1, [input], Marshal.SizeOf<INPUT>());
    }

    private static void MoveMouseRelative(short dx, short dy)
    {
        var input = new INPUT
        {
            type = 0,
            U = new InputUnion { mi = new MOUSEINPUT { dx = dx, dy = dy, dwFlags = MouseeventfMove } },
        };
        SendInput(1, [input], Marshal.SizeOf<INPUT>());
    }

    private static void KeyEvent(ushort scanCode, bool down, bool extended = false)
    {
        var flags = KeyeventfScancode | (down ? 0u : KeyeventfKeyup);
        if (extended) flags |= KeyeventfExtendedkey;

        var input = new INPUT
        {
            type = 1,
            U = new InputUnion
            {
                ki = new KEYBDINPUT
                {
                    wScan = scanCode,
                    dwFlags = flags,
                },
            },
        };
        SendInput(1, [input], Marshal.SizeOf<INPUT>());
    }

    private static void SendMouse(uint flags)
    {
        var input = new INPUT
        {
            type = 0,
            U = new InputUnion { mi = new MOUSEINPUT { dwFlags = flags } },
        };
        SendInput(1, [input], Marshal.SizeOf<INPUT>());
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public InputUnion U;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }
}
