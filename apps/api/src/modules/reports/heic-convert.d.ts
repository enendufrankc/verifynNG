declare module 'heic-convert' {
  interface HeicConvertOptions {
    buffer: Buffer | ArrayBuffer | Uint8Array;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }
  export default function convert(
    opts: HeicConvertOptions,
  ): Promise<ArrayBuffer>;
}
