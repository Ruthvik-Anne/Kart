'use client';
import { useId, useRef } from 'react';
import { ALLOWED_EXTENSIONS, MAX_FILES, formatSize, type Attachment, type FileLike } from '@/lib/attachments';
import { Button } from '@/components/ui';

/** Picks files but keeps only name and size; contents are never read or stored in this release. */
export function FilePicker({ files, onChange, max = MAX_FILES, label = 'Attach files' }: { files: FileLike[]; onChange: (f: FileLike[]) => void; max?: number; label?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-2">
      <input ref={input} id={id} type="file" multiple={max > 1} className="sr-only" accept={ALLOWED_EXTENSIONS.map(e => `.${e}`).join(',')}
        onChange={e => {
          const picked = [...(e.target.files ?? [])].map(f => ({ name: f.name, size: f.size }));
          onChange([...files, ...picked].slice(0, max));
          e.target.value = '';
        }} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => input.current?.click()} disabled={files.length >= max}>📎 {label}</Button>
        <span className="text-[10px] text-muted">{ALLOWED_EXTENSIONS.join(', ')} · up to {max} · 10 MB each</span>
      </div>
      {files.length > 0 && (
        <ul className="grid gap-1" aria-label="Selected files">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg bg-[#f3f7f1] px-3 py-1.5 text-[11px]">
              <span className="truncate font-bold">{f.name} <span className="font-normal text-muted">{formatSize(f.size)}</span></span>
              <button type="button" aria-label={`Remove ${f.name}`} className="ml-2 font-extrabold text-red-700" onClick={() => onChange(files.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AttachmentList({ files }: { files?: Attachment[] }) {
  if (!files?.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Attachments">
      {files.map(f => (
        <li key={f.id} className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1 text-[10px] font-bold">📎 {f.name} <span className="font-normal text-muted">{formatSize(f.size)}</span></li>
      ))}
    </ul>
  );
}
