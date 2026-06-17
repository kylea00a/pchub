using System.Drawing;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging.Abstractions;
using SIPSorceryMedia.Abstractions;
using SIPSorceryMedia.FFmpeg;

namespace PCHUB.Streaming;

public static class StreamMediaBootstrap
{
    private static bool _initialised;

    public static void EnsureFfmpeg(string? ffmpegLibPath = null)
    {
        if (_initialised) return;
        FFmpegInit.Initialise(FfmpegLogLevelEnum.AV_LOG_WARNING, ffmpegLibPath, NullLogger.Instance);
        _initialised = true;
    }
}

public static class HostScreenCapture
{
    private const int SmCxScreen = 0;
    private const int SmCyScreen = 1;

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int index);

    public static DxgiScreenSource CreatePrimaryDxgi(int targetWidth = 1280, int targetHeight = 720, int frameRate = 60)
    {
        var src = new DxgiScreenSource();
        src.RestrictFormats(f =>
            (f.Codec == VideoCodecsEnum.H264 || f.Codec == VideoCodecsEnum.VP8) &&
            f.Width == targetWidth &&
            f.Height == targetHeight);
        return src;
    }

    public static FFmpegScreenSource CreatePrimary(int targetWidth = 1280, int targetHeight = 720, int frameRate = 60)
    {
        StreamMediaBootstrap.EnsureFfmpeg();
        var screenW = GetSystemMetrics(SmCxScreen);
        var screenH = GetSystemMetrics(SmCyScreen);
        var width = Math.Min(targetWidth, screenW);
        var height = Math.Min(targetHeight, screenH);
        var rect = new Rectangle(0, 0, width, height);
        var source = new FFmpegScreenSource("", rect, frameRate);
        source.RestrictFormats(f => f.Codec == VideoCodecsEnum.VP8);
        return source;
    }
}
