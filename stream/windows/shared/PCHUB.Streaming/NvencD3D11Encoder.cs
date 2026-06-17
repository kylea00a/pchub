using System.Runtime.InteropServices;
using FFmpeg.AutoGen;
using SIPSorceryMedia.FFmpeg;
using Vortice.Direct3D11;

namespace PCHUB.Streaming;

/// <summary>
/// H.264 NVENC via FFmpeg, feeding frames as D3D11 textures (no CPU readback).
/// </summary>
public sealed unsafe class NvencD3D11Encoder : IDisposable
{
    private AVCodecContext* _codec;
    private AVBufferRef* _hwDeviceRef;
    private AVBufferRef* _hwFramesRef;
    private AVFrame* _frame;
    private long _pts;
    private bool _forceKeyFrame;
    private bool _disposed;

    public bool IsReady => _codec != null;

    public bool TryInitialize(ID3D11Device device, int width, int height)
    {
        if (_disposed) return false;
        if (_codec != null) return true;

        try
        {
            StreamMediaBootstrap.EnsureFfmpeg();

            var codec = ffmpeg.avcodec_find_encoder_by_name("h264_nvenc");
            if (codec == null) return false;

            _hwDeviceRef = ffmpeg.av_hwdevice_ctx_alloc(AVHWDeviceType.AV_HWDEVICE_TYPE_D3D11VA);
            if (_hwDeviceRef == null) return false;

            var hwDev = (AVHWDeviceContext*)_hwDeviceRef->data;
            var d3d11va = (AVD3D11VADeviceContext*)hwDev->hwctx;
            var devPtr = device.NativePointer;
            Marshal.AddRef(devPtr);
            d3d11va->device = (ID3D11Device*)devPtr;
            using var ctx = device.ImmediateContext;
            var ctxPtr = ctx.NativePointer;
            Marshal.AddRef(ctxPtr);
            d3d11va->device_context = (ID3D11DeviceContext*)ctxPtr;

            ffmpeg.av_hwdevice_ctx_init(_hwDeviceRef).ThrowExceptionIfError();

            _hwFramesRef = ffmpeg.av_hwframe_ctx_alloc(_hwDeviceRef);
            if (_hwFramesRef == null) return false;

            var frames = (AVHWFramesContext*)_hwFramesRef->data;
            frames->format = AVPixelFormat.AV_PIX_FMT_D3D11;
            frames->sw_format = AVPixelFormat.AV_PIX_FMT_BGRA;
            frames->width = width;
            frames->height = height;
            frames->initial_pool_size = 3;
            ffmpeg.av_hwframe_ctx_init(_hwFramesRef).ThrowExceptionIfError();

            _codec = ffmpeg.avcodec_alloc_context3(codec);
            if (_codec == null) return false;

            _codec->width = width;
            _codec->height = height;
            _codec->time_base = new AVRational { num = 1, den = 60 };
            _codec->framerate = new AVRational { num = 60, den = 1 };
            _codec->pix_fmt = AVPixelFormat.AV_PIX_FMT_D3D11;
            _codec->bit_rate = 8_000_000;
            _codec->gop_size = 60;
            _codec->max_b_frames = 0;
            _codec->hw_frames_ctx = ffmpeg.av_buffer_ref(_hwFramesRef);

            AVDictionary* opts = null;
            ffmpeg.av_dict_set(&opts, "preset", "p1", 0);
            ffmpeg.av_dict_set(&opts, "tune", "ull", 0);
            ffmpeg.av_dict_set(&opts, "rc", "cbr", 0);
            ffmpeg.av_dict_set(&opts, "bf", "0", 0);
            ffmpeg.av_dict_set(&opts, "refs", "1", 0);
            ffmpeg.av_dict_set(&opts, "g", "60", 0);

            var openRet = ffmpeg.avcodec_open2(_codec, codec, &opts);
            ffmpeg.av_dict_free(&opts);
            openRet.ThrowExceptionIfError();

            _frame = ffmpeg.av_frame_alloc();
            if (_frame == null) return false;

            _frame->format = (int)AVPixelFormat.AV_PIX_FMT_D3D11;
            _frame->width = width;
            _frame->height = height;
            ffmpeg.av_hwframe_get_buffer(_hwFramesRef, _frame, 0).ThrowExceptionIfError();

            return true;
        }
        catch
        {
            Cleanup();
            return false;
        }
    }

    public byte[]? Encode(ID3D11DeviceContext context, ID3D11Texture2D src)
    {
        if (_disposed || _codec == null || _frame == null) return null;

        var dst = new ID3D11Texture2D((IntPtr)_frame->data[0]);
        context.CopyResource(dst, src);

        _frame->pts = _pts++;

        if (_forceKeyFrame)
        {
            _frame->pict_type = AVPictureType.AV_PICTURE_TYPE_I;
            _frame->flags |= ffmpeg.AV_FRAME_FLAG_KEY;
            _forceKeyFrame = false;
        }
        else
        {
            _frame->pict_type = AVPictureType.AV_PICTURE_TYPE_NONE;
            _frame->flags &= ~ffmpeg.AV_FRAME_FLAG_KEY;
        }

        ffmpeg.avcodec_send_frame(_codec, _frame).ThrowExceptionIfError();

        AVPacket* pkt = ffmpeg.av_packet_alloc();
        if (pkt == null) return null;

        try
        {
            var ret = ffmpeg.avcodec_receive_packet(_codec, pkt);
            if (ret == ffmpeg.AVERROR(ffmpeg.EAGAIN) || ret == ffmpeg.AVERROR_EOF)
                return null;
            ret.ThrowExceptionIfError();

            var encoded = new byte[pkt->size];
            Marshal.Copy((IntPtr)pkt->data, encoded, 0, pkt->size);
            return encoded;
        }
        finally
        {
            ffmpeg.av_packet_free(&pkt);
        }
    }

    public void SetBitrate(int bps)
    {
        if (_codec != null)
            _codec->bit_rate = bps;
    }

    public void ForceKeyFrame() => _forceKeyFrame = true;

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Cleanup();
    }

    private void Cleanup()
    {
        if (_frame != null)
        {
            var f = _frame;
            ffmpeg.av_frame_free(&f);
            _frame = null;
        }

        if (_codec != null)
        {
            var c = _codec;
            ffmpeg.avcodec_free_context(&c);
            _codec = null;
        }

        if (_hwFramesRef != null)
        {
            var r = _hwFramesRef;
            ffmpeg.av_buffer_unref(&r);
            _hwFramesRef = null;
        }

        if (_hwDeviceRef != null)
        {
            var r = _hwDeviceRef;
            ffmpeg.av_buffer_unref(&r);
            _hwDeviceRef = null;
        }
    }
}
