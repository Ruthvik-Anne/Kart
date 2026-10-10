'use client';
import { useMemo } from 'react';
import { qrMatrix } from '@/lib/qr';

/** Renders a QR code as crisp SVG modules with the standard four-module quiet zone. */
export function QrCode({ value, size = 168, title }: { value: string; size?: number; title?: string }) {
  const path = useMemo(() => {
    const m = qrMatrix(value);
    const quiet = 4;
    const parts: string[] = [];
    for (let r = 0; r < m.size; r++) {
      for (let c = 0; c < m.size; c++) if (m.dark(r, c)) parts.push(`M${c + quiet} ${r + quiet}h1v1h-1z`);
    }
    return { d: parts.join(''), view: m.size + quiet * 2 };
  }, [value]);

  return (
    <svg role="img" aria-label={title ?? 'QR code'} width={size} height={size} viewBox={`0 0 ${path.view} ${path.view}`}
      shapeRendering="crispEdges" className="rounded-lg bg-white">
      <rect width={path.view} height={path.view} fill="#fff" />
      <path d={path.d} fill="#102c24" />
    </svg>
  );
}
