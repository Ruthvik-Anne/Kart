/** Route-level suspense fallback rendered inside the app shell. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading page" className="animate-pulse">
      <span className="sr-only">Loading…</span>
      <div className="mb-6 h-9 w-56 rounded-xl bg-[#e9efe7]" />
      <div className="mb-5 h-4 w-80 max-w-full rounded-lg bg-[#eef2ec]" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-36 rounded-2xl border border-line bg-white" />
        ))}
      </div>
    </div>
  );
}
