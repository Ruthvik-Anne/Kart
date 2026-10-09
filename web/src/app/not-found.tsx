import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-screen max-w-md place-items-center px-6 text-center">
      <div>
        <div className="font-display text-5xl font-extrabold">404</div>
        <p className="mt-2 text-sm text-muted">We couldn&apos;t find that page.</p>
        <Link href="/" className="mt-5 inline-block rounded-xl bg-forest-800 px-4 py-2.5 text-xs font-extrabold text-white">Back to KART</Link>
      </div>
    </main>
  );
}
