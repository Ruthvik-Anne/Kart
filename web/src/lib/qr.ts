// Scannable handover passes. The QR carries a link back to the app so a shop or a delivery
// runner can open the order on their own device and confirm it with the customer's code.
import qrcode from 'qrcode-generator';

export interface QrMatrix {
  size: number;
  dark: (row: number, col: number) => boolean;
}

/** Payload written into the QR code of an order pass. */
export function handoverPayload(origin: string, orderId: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/scan?o=${encodeURIComponent(orderId)}&c=${encodeURIComponent(code)}`;
}

export function qrMatrix(value: string, correction: 'L' | 'M' | 'Q' | 'H' = 'M'): QrMatrix {
  const qr = qrcode(0, correction);
  qr.addData(value);
  qr.make();
  const size = qr.getModuleCount();
  return { size, dark: (row, col) => qr.isDark(row, col) };
}

/** Read `o` and `c` back out of a scanned pass URL (or a bare "ORDER CODE" string). */
export function parseHandover(input: string): { orderId?: string; code?: string } {
  const text = input.trim();
  const params = text.includes('?') ? new URLSearchParams(text.slice(text.indexOf('?') + 1)) : null;
  const orderId = params?.get('o') ?? (/([A-Za-z]{2,4}-\d+)/.exec(text)?.[1] ?? undefined);
  const code = params?.get('c') ?? (/([A-Z0-9]{8})\s*$/i.exec(text)?.[1] ?? undefined);
  return { orderId, code: code?.toUpperCase() };
}

/** Rasterise the QR onto a canvas with an optional caption and return it as a PNG blob. */
export async function qrPngBlob(value: string, opts: { scale?: number; caption?: string[] } = {}): Promise<Blob> {
  const scale = Math.max(4, opts.scale ?? 10);
  const m = qrMatrix(value);
  const quiet = 4;
  const width = (m.size + quiet * 2) * scale;
  const caption = opts.caption ?? [];
  const captionH = caption.length ? scale * 2 + caption.length * Math.round(scale * 1.9) : 0;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = width + captionH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#102c24';
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) if (m.dark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
  }
  if (caption.length) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    caption.forEach((line, i) => {
      ctx.font = `${i === 0 ? 'bold ' : ''}${Math.round(scale * (i === 0 ? 1.7 : 1.4))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.fillText(line, width / 2, width + scale * 1.6 + i * Math.round(scale * 1.9));
    });
  }
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not render the QR image.'))), 'image/png');
  });
}

/** Download the QR as a PNG file, e.g. KART-KRT-1042.png. */
export async function downloadQrPng(value: string, filename: string, caption?: string[]): Promise<void> {
  const blob = await qrPngBlob(value, { caption });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
