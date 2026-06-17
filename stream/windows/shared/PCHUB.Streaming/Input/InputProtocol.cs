namespace PCHUB.Streaming.Input;

public static class InputProtocol
{
    public const byte OpMouseMove = 1;
    public const byte OpMouseDown = 2;
    public const byte OpMouseUp = 3;
    public const byte OpMouseWheel = 4;
    public const byte OpKeyDown = 5;
    public const byte OpKeyUp = 6;
    public const byte OpMouseRelMove = 7;
    public const byte OpMouseRelOn = 8;
    public const byte OpMouseRelOff = 9;

    public static byte[] MouseMove(float nx, float ny)
    {
        var buf = new byte[9];
        buf[0] = OpMouseMove;
        BitConverter.TryWriteBytes(buf.AsSpan(1, 4), nx);
        BitConverter.TryWriteBytes(buf.AsSpan(5, 4), ny);
        return buf;
    }

    public static byte[] MouseButton(byte button, bool down) =>
        [(down ? OpMouseDown : OpMouseUp), button];

    public static byte[] MouseWheel(short delta)
    {
        var buf = new byte[3];
        buf[0] = OpMouseWheel;
        BitConverter.TryWriteBytes(buf.AsSpan(1, 2), delta);
        return buf;
    }

    public static byte[] MouseRelMode(bool enabled) => [enabled ? OpMouseRelOn : OpMouseRelOff];

    public static byte[] MouseRelMove(short dx, short dy)
    {
        var buf = new byte[5];
        buf[0] = OpMouseRelMove;
        BitConverter.TryWriteBytes(buf.AsSpan(1, 2), dx);
        BitConverter.TryWriteBytes(buf.AsSpan(3, 2), dy);
        return buf;
    }

    public static byte[] Key(ushort scanCode, bool down, bool extended = false)
    {
        var buf = new byte[4];
        buf[0] = down ? OpKeyDown : OpKeyUp;
        BitConverter.TryWriteBytes(buf.AsSpan(1, 2), scanCode);
        if (extended) buf[3] = 1;
        return buf;
    }
}
