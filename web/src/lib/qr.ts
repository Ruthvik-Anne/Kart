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
