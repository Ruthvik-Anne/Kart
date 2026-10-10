'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto grid min-h-screen max-w-md place-items-center px-6 text-center">
      <div>
        <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">The page hit an unexpected problem. Your data is safe. Try again, and if it keeps happening, reset the demo data from the banner.</p>
        <button onClick={reset} className="mt-5 rounded-xl bg-brand-900 px-4 py-2.5 text-xs font-extrabold text-white">Try again</button>
      </div>
    </main>
  );
}
