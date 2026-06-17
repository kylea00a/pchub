using D3D11Device = Vortice.Direct3D11.ID3D11Device;
using D3D11Context = Vortice.Direct3D11.ID3D11DeviceContext;
using D3D11Texture2D = Vortice.Direct3D11.ID3D11Texture2D;

namespace PCHUB.Streaming;

/// <summary>
/// BGRA frame that stays on the GPU (no CPU staging readback).
/// The texture is valid only for the duration of the callback.
/// </summary>
public readonly struct GpuTextureFrame
{
    public D3D11Device Device { get; init; }
    public D3D11Context Context { get; init; }
    public D3D11Texture2D Texture { get; init; }
    public int Width { get; init; }
    public int Height { get; init; }
}

public delegate void GpuTextureSampleDelegate(GpuTextureFrame frame);
