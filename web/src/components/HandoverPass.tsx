'use client';
import { useEffect, useState } from 'react';
import { QrCode } from '@/components/QrCode';
import { downloadQrPng, handoverPayload } from '@/lib/qr';
import { Badge, kc } from '@/components/ui';

export interface PassProps {
  orderId: string;
  code: string;
  status?: string;
  storeName?: string;
  kind?: 'food' | 'shop' | 'print';
  fulfillment?: 'pickup' | 'delivery';
  window?: string;
  deliveryDetails?: string;
  amount?: number;
}

/** The booking pass: scannable QR plus the printed code the shop or runner asks for. */
export function HandoverPass({ orderId, code, status, storeName, kind, fulfillment, window: slot, deliveryDetails, amount }: PassProps) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  // The pass is built after mount so server-rendered HTML and the first client render match.
  useEffect(() => { setOrigin(window.location.origin.replace(/\/$/, '')); }, []);

  const payload = handoverPayload(origin || 'https://kart.campus', orderId, code);
  const isDelivery = fulfillment === 'delivery';

  function saveQr() {
    if (saved === 'saving') return;
    setSaved('saving');
    void downloadQrPng(payload, `KART-${orderId}`, [orderId, code])
      .then(() => { setSaved('done'); setTimeout(() => setSaved('idle'), 2000); })
      .catch(() => { setSaved('error'); setTimeout(() => setSaved('idle'), 2500); });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="mx-auto rounded-2xl border border-line bg-white p-3 shadow-sm sm:mx-0" data-handover-qr={orderId}>
        {origin
          ? <QrCode value={payload} size={168} title={`Handover pass for ${orderId}`} />
          : <div aria-hidden className="h-[168px] w-[168px] animate-pulse rounded-lg bg-[#eef2ec]" />}
        <p className="mt-2 text-center font-mono text-[9px] font-bold uppercase tracking-widest text-muted">{orderId}</p>
        <button type="button" onClick={saveQr} disabled={saved === 'saving'}
          className="mt-2 w-full rounded-lg border border-[#bcd9c2] bg-white px-2 py-1.5 text-[10px] font-extrabold text-forest-800 hover:bg-forest-100 disabled:opacity-60"
          data-save-qr={orderId}>
          {saved === 'saving' ? 'Saving…' : saved === 'done' ? 'Saved ✓' : saved === 'error' ? 'Could not save' : '⬇ Save QR image'}
        </button>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#5d8369]">
            {isDelivery ? 'Delivery pass' : 'Pickup pass'} · {storeName ?? orderId}
          </span>
          {status && <Badge tone={status === 'Cancelled' ? 'red' : status === 'Ready' || status === 'Out for delivery' ? 'amber' : 'green'}>{status}</Badge>}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {kind === 'print' ? 'Show this at the print shop when you collect your documents.' : 'Show this QR code or read out the code below when you collect.'}
          {' '}Share it only with the person handing over your order.
        </p>
        <div className="mt-3 rounded-xl border border-[#cfe6d2] bg-forest-100 px-4 py-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#3e7c45]">{isDelivery ? 'Give this code to the delivery person at your door' : 'Handover code'}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <code className="font-mono text-2xl font-extrabold tracking-[0.25em] text-forest-950" data-handover-code>{code}</code>
            <button type="button" className="rounded-lg border border-[#bcd9c2] bg-white px-2 py-1 text-[10px] font-extrabold text-forest-800 hover:bg-forest-100"
              onClick={() => { void navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }); }}>
              {copied ? 'Copied' : 'Copy code'}
            </button>
          </div>
        </div>
        <dl className="mt-3 grid gap-1 text-[11px] text-muted">
          {slot && <div><dt className="inline font-bold text-[#3f5c4b]">Time window: </dt><dd className="inline">{slot}</dd></div>}
          {amount !== undefined && <div><dt className="inline font-bold text-[#3f5c4b]">Paid from wallet: </dt><dd className="inline font-extrabold text-forest-950">{kc(amount)}</dd></div>}
          {isDelivery && deliveryDetails && <div><dt className="inline font-bold text-[#3f5c4b]">Deliver to: </dt><dd className="inline">{deliveryDetails}</dd></div>}
        </dl>
      </div>
    </div>
  );
}
