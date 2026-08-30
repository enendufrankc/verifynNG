/**
 * Ambient types for the native BarcodeDetector API — not yet in
 * TypeScript's lib.dom.d.ts. Support-checked at runtime via
 * `'BarcodeDetector' in window` before ever touching this type.
 */
interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorOptions {
  formats?: string[];
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  detect(image: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
