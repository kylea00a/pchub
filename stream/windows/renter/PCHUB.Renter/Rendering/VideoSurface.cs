using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using SIPSorceryMedia.Abstractions;

namespace PCHUB.Renter.Rendering;

public sealed class VideoSurface
{
    private WriteableBitmap? _bitmap;
    private readonly Image _target;

    public VideoSurface(Image target) => _target = target;

    public void Present(uint width, uint height, byte[] sample, VideoPixelFormatsEnum format)
    {
        if (width == 0 || height == 0 || sample.Length == 0) return;

        var w = (int)width;
        var h = (int)height;
        byte[] bgr;

        if (format == VideoPixelFormatsEnum.Rgb)
        {
            bgr = RgbToBgr(sample, w, h);
        }
        else
        {
            bgr = Yuv420pToBgr24(sample, w, h);
        }

        if (_bitmap is null || _bitmap.PixelWidth != w || _bitmap.PixelHeight != h)
        {
            _bitmap = new WriteableBitmap(w, h, 96, 96, PixelFormats.Bgr24, null);
            _target.Source = _bitmap;
        }

        _bitmap.WritePixels(new Int32Rect(0, 0, w, h), bgr, w * 3, 0);
    }

    public void Clear()
    {
        _bitmap = null;
        _target.Source = null;
    }

    private static byte[] RgbToBgr(byte[] rgb, int width, int height)
    {
        var bgr = new byte[width * height * 3];
        for (var i = 0; i < width * height; i++)
        {
            bgr[i * 3] = rgb[i * 3 + 2];
            bgr[i * 3 + 1] = rgb[i * 3 + 1];
            bgr[i * 3 + 2] = rgb[i * 3];
        }
        return bgr;
    }

    private static byte[] Yuv420pToBgr24(byte[] i420, int width, int height)
    {
        var bgr = new byte[width * height * 3];
        var ySize = width * height;
        var uSize = ySize / 4;

        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                var yVal = i420[y * width + x];
                var uVal = i420[ySize + (y / 2) * (width / 2) + (x / 2)] - 128;
                var vVal = i420[ySize + uSize + (y / 2) * (width / 2) + (x / 2)] - 128;

                var r = ClampByte(yVal + (1.402 * vVal));
                var g = ClampByte(yVal - (0.344 * uVal) - (0.714 * vVal));
                var b = ClampByte(yVal + (1.772 * uVal));

                var i = (y * width + x) * 3;
                bgr[i] = b;
                bgr[i + 1] = g;
                bgr[i + 2] = r;
            }
        }

        return bgr;
    }

    private static byte ClampByte(double v) => (byte)Math.Clamp((int)Math.Round(v), 0, 255);
}
