using Vortice.Direct3D11;

namespace PCHUB.Streaming;

/// <summary>
/// BGRA frame that stays on the GPU (no CPU staging readback).
/// The texture is valid only for the duration of the callback.
/// </summary>
public readonly struct GpuTextureFrame
{
    public required ID3D11Device Device { get; init; }
    public required ID3D11DeviceContext Context { get; init; }
    public required ID3D11Texture2D Texture { get; init; }
    public required int Width { get; init; }
    public required int Height { get; init; }
}

public delegate void GpuTextureSampleDelegate(GpuTextureFrame frame);
