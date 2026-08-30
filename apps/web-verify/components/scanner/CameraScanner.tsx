'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Flashlight, FlashlightOff } from 'lucide-react';
import { extractCodeFromPayload } from '@/lib/scan-payload';
import { t, useLocale } from '@/lib/i18n';

type ScannerState = 'starting' | 'scanning' | 'denied' | 'no-camera' | 'error';

/** Non-standard but widely supported on Android Chrome; not in TS's DOM lib. */
interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}
interface TorchConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean;
}

/**
 * `BarcodeDetector` when available (Android Chrome — the majority device
 * in target markets); `@zxing/browser` fallback otherwise, loaded only
 * when needed. Dynamically imported by the caller (`ssr: false`) — this
 * file touches `navigator.mediaDevices`, `window.BarcodeDetector`, and
 * `requestAnimationFrame`, none of which exist during SSR.
 */
export function CameraScanner({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScannerState>('starting');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let stopZxing: (() => void) | null = null;
    let rafId: number | null = null;

    function navigateToCode(code: string) {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
      stopZxing?.();
      if (rafId !== null) cancelAnimationFrame(rafId);
      router.push(`/v/${encodeURIComponent(code)}?src=camera`);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setState('scanning');

        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        const capabilities = track.getCapabilities() as TorchCapabilities;
        if (capabilities.torch) setTorchSupported(true);

        if (typeof window !== 'undefined' && window.BarcodeDetector) {
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          const poll = async () => {
            if (cancelled || !videoRef.current) return;
            try {
              const results = await detector.detect(videoRef.current);
              const code = results[0]
                ? extractCodeFromPayload(results[0].rawValue)
                : null;
              if (code) {
                navigateToCode(code);
                return;
              }
            } catch {
              // Transient decode errors are expected between frames.
            }
            rafId = requestAnimationFrame(poll);
          };
          rafId = requestAnimationFrame(poll);
        } else {
          const { BrowserQRCodeReader } = await import('@zxing/browser');
          const reader = new BrowserQRCodeReader();
          const controls = await reader.decodeFromVideoElement(
            videoRef.current!,
            (result) => {
              if (!result) return;
              const code = extractCodeFromPayload(result.getText());
              if (code) navigateToCode(code);
            },
          );
          stopZxing = () => controls.stop();
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          setState('denied');
        } else if (
          err instanceof DOMException &&
          err.name === 'NotFoundError'
        ) {
          setState('no-camera');
        } else {
          setState('error');
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
      stopZxing?.();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [router]);

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      const constraint: TorchConstraintSet = { torch: next };
      await track.applyConstraints({ advanced: [constraint] });
      setTorchOn(next);
    } catch {
      // Torch toggle failing is non-fatal — scanning still works.
    }
  }

  return (
    <div className="border-border bg-surface relative w-full max-w-md overflow-hidden rounded-lg border shadow-lg">
      <div className="bg-n1000 relative aspect-square w-full">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
        />
        {state !== 'scanning' && (
          <div className="text-n0 p-s6 absolute inset-0 flex items-center justify-center text-center text-sm">
            {state === 'starting' && t(locale, 'scanner.starting')}
            {state === 'denied' && t(locale, 'scanner.permissionDenied')}
            {state === 'no-camera' && t(locale, 'scanner.noCamera')}
            {state === 'error' && t(locale, 'scanner.error')}
          </div>
        )}
      </div>
      <div className="p-s4 flex items-center justify-between">
        <button
          onClick={onClose}
          className="text-fg-muted hover:text-fg gap-s2 flex items-center text-sm"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          {t(locale, 'scanner.close')}
        </button>
        {torchSupported && (
          <button
            onClick={toggleTorch}
            aria-pressed={torchOn}
            className="text-fg-muted hover:text-fg gap-s2 flex items-center text-sm"
          >
            {torchOn ? (
              <FlashlightOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Flashlight className="h-4 w-4" aria-hidden="true" />
            )}
            {t(locale, torchOn ? 'scanner.torchOff' : 'scanner.torchOn')}
          </button>
        )}
      </div>
    </div>
  );
}
