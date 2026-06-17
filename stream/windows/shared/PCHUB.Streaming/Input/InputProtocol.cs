namespace PCHUB.Streaming.Input;

public static class InputProtocol
{
    public const byte MouseMove = 1;
    public const byte MouseDown = 2;
    public const byte MouseUp = 3;
    public const byte MouseWheel = 4;
    public const byte KeyDown = 5;
    public const byte KeyUp = 6;
    public const byte MouseRelMove = 7;
    public const byte MouseRelOn = 8;
    public const byte MouseRelOff = 9;

    public static byte[] MouseMove(float nx, float ny)
    {
        var buf = new byte[9];
        buf[0] = MouseMove;
        BitConverter.TryWriteBytes(buf.AsSpan(1, 4), nx);
        BitConverter.TryWriteBytes(buf.AsSpan(5, 4), ny);
        return buf;
    }

    public static byte[] MouseButton(byte button, bool down) =>
        [(down ? MouseDown : MouseUp), button];

    public static byte[] MouseWheel(short delta)
    {
        var buf = new byte[3];
        buf[0] = MouseWheel;
        BitConverter.TryWriteBytes(buf.AsSpan(1, 2), delta);
        return buf;
    }

    public static byte[] MouseRelMode(bool enabled) => [enabled ? MouseRelOn : MouseRelOff];

    public static byte[] MouseRelMove(short dx, short dy)
    {
        var buf = new byte[5];
        buf[0] = MouseRelMove;
        BitConverter.TryWriteBytes(buf.AsSpan(1, 2), dx);
        BitConverter.TryWriteBytes(buf.AsSpan(3, 2), dy);
        return buf;
    }

    public static byte[] Key(ushort scanCode, bool down, bool extended = false)
    {
        var buf = new byte[4];
        buf[0] = down ? KeyDown : KeyUp;
        BitConverter.TryWriteBytes(buf.AsSpan(1, 2), scanCode);
        if (extended) buf[3] = 1;
        return buf;
    }
}
