'use client';

import Link from 'next/link';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const dev = process.env.NODE_ENV !== 'production';
  return (
    <main className="mx-auto grid min-h-screen max-w-md place-items-center px-6 text-center">
      <div>
        <div className="mb-4 text-4xl" aria-hidden>⚠️</div>
        <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          The page hit an unexpected problem. Try again, and contact the campus team if it keeps happening.
        </p>
        {dev && error?.message && (
          <p className="mt-4 break-all rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-left font-mono text-[11px] text-red-800">
            {error.message}
          </p>
        )}
        {error?.digest && <p className="mt-2 text-[11px] text-muted">Reference: {error.digest}</p>}
        <div className="mt-5 flex items-center justify-center gap-3">
          <button onClick={reset} className="rounded-xl bg-forest-800 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-forest-950">Try again</button>
          <Link href="/" className="rounded-xl border border-[#dce7dc] bg-white px-4 py-2.5 text-xs font-extrabold text-forest-800 hover:bg-forest-100">Back to KART</Link>
        </div>
      </div>
    </main>
  );
}
