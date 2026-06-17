using System.Runtime.InteropServices;
using FFmpeg.AutoGen;
using SIPSorceryMedia.FFmpeg;
using Vortice.Direct3D11;

namespace PCHUB.Streaming;

/// <summary>
/// H.264 hardware decode via D3D11VA — output stays on GPU (NV12 or BGRA D3D11 texture).
/// </summary>
public sealed unsafe class D3d11H264Decoder : IDisposable
{
    private static readonly AVCodecContext_get_format GetHwFormatDelegate = SelectHwFormat;

    private AVCodecContext* _codec;
    private AVBufferRef* _hwDeviceRef;
    private AVBufferRef* _hwBgraFramesRef;
    private AVFrame* _nv12Frame;
    private AVFrame* _bgraFrame;
    private AVPacket* _packet;
    private bool _disposed;

    public bool IsReady => _codec != null;
    public ID3D11Device? Device { get; private set; }

    public bool TryInitialize(ID3D11Device? shareDevice = null)
    {
        if (_disposed) return false;
        if (_codec != null) return true;

        try
        {
            StreamMediaBootstrap.EnsureFfmpeg();

            var decoder = ffmpeg.avcodec_find_decoder(AVCodecID.AV_CODEC_ID_H264);
            if (decoder == null) return false;

            _codec = ffmpeg.avcodec_alloc_context3(decoder);
            if (_codec == null) return false;

            if (shareDevice is not null)
            {
                _hwDeviceRef = ffmpeg.av_hwdevice_ctx_alloc(AVHWDeviceType.AV_HWDEVICE_TYPE_D3D11VA);
                if (_hwDeviceRef == null) return false;

                var hwDev = (AVHWDeviceContext*)_hwDeviceRef->data;
                var d3d11va = (AVD3D11VADeviceContext*)hwDev->hwctx;
                var devPtr = shareDevice.NativePointer;
                Marshal.AddRef(devPtr);
                d3d11va->device = (ID3D11Device*)devPtr;
                using var ctx = shareDevice.ImmediateContext;
                var ctxPtr = ctx.NativePointer;
                Marshal.AddRef(ctxPtr);
                d3d11va->device_context = (ID3D11DeviceContext*)ctxPtr;
                ffmpeg.av_hwdevice_ctx_init(_hwDeviceRef).ThrowExceptionIfError();
            }
            else
            {
                ffmpeg.av_hwdevice_ctx_create(&_hwDeviceRef, AVHWDeviceType.AV_HWDEVICE_TYPE_D3D11VA, null, null, 0)
                    .ThrowExceptionIfError();
            }

            _codec->hw_device_ctx = ffmpeg.av_buffer_ref(_hwDeviceRef);
            _codec->get_format = GetHwFormatDelegate;

            ffmpeg.avcodec_open2(_codec, decoder, null).ThrowExceptionIfError();

            _packet = ffmpeg.av_packet_alloc();
            _nv12Frame = ffmpeg.av_frame_alloc();
            _bgraFrame = ffmpeg.av_frame_alloc();
            if (_packet == null || _nv12Frame == null || _bgraFrame == null) return false;

            var hwDevCtx = (AVHWDeviceContext*)_hwDeviceRef->data;
            var d3d11 = (AVD3D11VADeviceContext*)hwDevCtx->hwctx;
            Device = new ID3D11Device((IntPtr)d3d11->device);

            return true;
        }
        catch
        {
            Cleanup();
            return false;
        }
    }

    public bool TryDecode(byte[] encoded, out GpuTextureFrame frame)
    {
        frame = default;
        if (_disposed || _codec == null || _packet == null || _nv12Frame == null || _bgraFrame == null)
            return false;
        if (encoded.Length == 0) return false;

        fixed (byte* src = encoded)
        {
            ffmpeg.av_packet_unref(_packet);
            _packet->data = src;
            _packet->size = encoded.Length;
            _packet->pts = ffmpeg.AV_NOPTS_VALUE;

            var send = ffmpeg.avcodec_send_packet(_codec, _packet);
            if (send == ffmpeg.AVERROR(ffmpeg.EAGAIN)) return false;
            send.ThrowExceptionIfError();

            ffmpeg.av_frame_unref(_nv12Frame);
            var recv = ffmpeg.avcodec_receive_frame(_codec, _nv12Frame);
            if (recv == ffmpeg.AVERROR(ffmpeg.EAGAIN) || recv == ffmpeg.AVERROR_EOF) return false;
            recv.ThrowExceptionIfError();
        }

        if (_nv12Frame->format != (int)AVPixelFormat.AV_PIX_FMT_D3D11)
            return false;

        EnsureBgraPool(_nv12Frame->width, _nv12Frame->height);
        ffmpeg.av_frame_unref(_bgraFrame);
        ffmpeg.av_hwframe_get_buffer(_hwBgraFramesRef, _bgraFrame, 0).ThrowExceptionIfError();
        ffmpeg.av_hwframe_transfer_data(_bgraFrame, _nv12Frame, 0).ThrowExceptionIfError();

        using var context = Device!.ImmediateContext;
        var tex = new ID3D11Texture2D((IntPtr)_bgraFrame->data[0]);
        frame = new GpuTextureFrame
        {
            Device = Device,
            Context = context,
            Texture = tex,
            Width = _bgraFrame->width,
            Height = _bgraFrame->height,
        };
        return true;
    }

    private void EnsureBgraPool(int width, int height)
    {
        if (_hwBgraFramesRef != null)
        {
            var frames = (AVHWFramesContext*)_hwBgraFramesRef->data;
            if (frames->width == width && frames->height == height)
                return;
            var r = _hwBgraFramesRef;
            ffmpeg.av_buffer_unref(&r);
            _hwBgraFramesRef = null;
        }

        _hwBgraFramesRef = ffmpeg.av_hwframe_ctx_alloc(_hwDeviceRef);
        var pool = (AVHWFramesContext*)_hwBgraFramesRef->data;
        pool->format = AVPixelFormat.AV_PIX_FMT_D3D11;
        pool->sw_format = AVPixelFormat.AV_PIX_FMT_BGRA;
        pool->width = width;
        pool->height = height;
        pool->initial_pool_size = 3;
        ffmpeg.av_hwframe_ctx_init(_hwBgraFramesRef).ThrowExceptionIfError();
    }

    private static AVPixelFormat SelectHwFormat(AVCodecContext* ctx, AVPixelFormat* pixFmts)
    {
        for (var p = pixFmts; *p != AVPixelFormat.AV_PIX_FMT_NONE; p++)
        {
            if (*p == AVPixelFormat.AV_PIX_FMT_D3D11)
                return *p;
        }
        return AVPixelFormat.AV_PIX_FMT_NONE;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Cleanup();
    }

    private void Cleanup()
    {
        if (_packet != null)
        {
            var p = _packet;
            ffmpeg.av_packet_free(&p);
            _packet = null;
        }

        if (_nv12Frame != null)
        {
            var f = _nv12Frame;
            ffmpeg.av_frame_free(&f);
            _nv12Frame = null;
        }

        if (_bgraFrame != null)
        {
            var f = _bgraFrame;
            ffmpeg.av_frame_free(&f);
            _bgraFrame = null;
        }

        if (_codec != null)
        {
            var c = _codec;
            ffmpeg.avcodec_free_context(&c);
            _codec = null;
        }

        if (_hwBgraFramesRef != null)
        {
            var r = _hwBgraFramesRef;
            ffmpeg.av_buffer_unref(&r);
            _hwBgraFramesRef = null;
        }

        if (_hwDeviceRef != null)
        {
            var r = _hwDeviceRef;
            ffmpeg.av_buffer_unref(&r);
            _hwDeviceRef = null;
        }

        Device = null;
    }
}
