'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';

interface Detected { orderId?: string; code?: string }

/**
 * Camera scanner for handover passes. Uses the browser's built-in BarcodeDetector when it is
 * available (Chrome/Edge); everywhere else the caller still has a code field to type into.
 */
export function Scanner({ onDetect, label = 'Scan QR' }: { onDetect: (d: Detected) => void; label?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept in a ref so a parent re-render does not restart the camera loop.
  const detect = useRef(onDetect);
  detect.current = onDetect;

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const Decoder = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    (async () => {
      try {
        if (!Decoder) throw new Error('Camera QR scanning needs a Chromium browser. Type the code instead.');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new Decoder({ formats: ['qr_code'] });
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const hits = await detector.detect(video.current);
            const raw = hits[0]?.rawValue;
            if (raw) {
              const params = raw.includes('?') ? new URLSearchParams(raw.slice(raw.indexOf('?') + 1)) : null;
              detect.current({ orderId: params?.get('o') ?? undefined, code: params?.get('c')?.toUpperCase() ?? undefined });
              setOpen(false);
              return;
            }
          } catch { /* frame not ready yet */ }
          timer = window.setTimeout(tick, 350);
        };
        tick();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Camera unavailable. Type the code instead.');
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return <Button type="button" variant="secondary" size="sm" onClick={() => { setError(null); setOpen(true); }}>📷 {label}</Button>;
  return (
    <div className="grid gap-2 rounded-xl border border-line bg-[#0e1f18] p-3">
      <video ref={video} playsInline muted className="mx-auto max-h-56 w-full rounded-lg bg-black" />
      {error && <p role="alert" className="text-[11px] font-bold text-[#ffd7d7]">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-[#a1bdac]">Point the camera at the customer&apos;s pass.</span>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Stop camera</Button>
      </div>
    </div>
  );
}
