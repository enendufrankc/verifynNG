import { describe, it, expect, vi } from 'vitest';
import { downscaleImage } from './downscale';

describe('downscaleImage', () => {
  it('returns the original file unchanged if already within bounds', async () => {
    const file = new File([new Uint8Array(10)], 'small.jpg', {
      type: 'image/jpeg',
    });
    (
      globalThis as unknown as { createImageBitmap: unknown }
    ).createImageBitmap = vi.fn(async () => ({ width: 800, height: 600 }));
    const result = await downscaleImage(file, 2000);
    expect(result).toBe(file);
  });

  it('scales down an oversized image and returns a Blob', async () => {
    const file = new File([new Uint8Array(10)], 'big.jpg', {
      type: 'image/jpeg',
    });
    (
      globalThis as unknown as { createImageBitmap: unknown }
    ).createImageBitmap = vi.fn(async () => ({ width: 4000, height: 3000 }));
    const mockBlob = new Blob(['x'], { type: 'image/jpeg' });
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (cb: (b: Blob) => void) => cb(mockBlob),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(
      mockCanvas as unknown as HTMLCanvasElement,
    );
    const result = await downscaleImage(file, 2000);
    expect(result).toBe(mockBlob);
    expect(mockCanvas.width).toBe(2000);
    vi.restoreAllMocks();
  });
});
