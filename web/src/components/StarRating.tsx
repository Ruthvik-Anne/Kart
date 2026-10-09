'use client';

/** Read-only stars when `onChange` is omitted, otherwise a keyboard-accessible 1-5 radio group. */
export function StarRating({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  if (!onChange) {
    return <span role="img" aria-label={`${value} out of 5 stars`} className="whitespace-nowrap text-amber-kart">{'★'.repeat(value)}<span className="text-[#d6ddd4]">{'★'.repeat(5 - value)}</span></span>;
  }
  return (
    <div role="radiogroup" aria-label="Rating" className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)}
          className={`text-2xl leading-none ${n <= value ? 'text-amber-kart' : 'text-[#d6ddd4]'}`}>★</button>
      ))}
    </div>
  );
}
