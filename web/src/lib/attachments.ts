// Attachment metadata rules. File contents are not stored in this release (no backend storage yet);
// the same checks must run server-side when uploads are real.

export interface Attachment { id: string; name: string; size: number; type: string }

export const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'txt'] as const;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 5;

export interface FileLike { name: string; size: number }

export type CleanResult = { ok: true; files: Omit<Attachment, 'id'>[] } | { ok: false; error: string };

const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

/** Strip path parts and control characters so a name is safe to show and store. */
export function safeName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f]/g, '').split(/[\\/]/).pop()!.trim();
}

export function cleanAttachments(input: FileLike[] | undefined): CleanResult {
  const list = input ?? [];
  if (list.length > MAX_FILES) return { ok: false, error: `Attach at most ${MAX_FILES} files.` };
  const files: Omit<Attachment, 'id'>[] = [];
  for (const f of list) {
    const name = safeName(String(f?.name ?? ''));
    const ext = extOf(name);
    if (!name || name.length > 80) return { ok: false, error: 'File names must be 1 to 80 characters.' };
    if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) return { ok: false, error: `".${ext || '?'}" files are not allowed. Use ${ALLOWED_EXTENSIONS.join(', ')}.` };
    if (!Number.isFinite(f.size) || f.size <= 0) return { ok: false, error: `${name} is empty.` };
    if (f.size > MAX_FILE_BYTES) return { ok: false, error: `${name} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.` };
    files.push({ name, size: Math.floor(f.size), type: ext });
  }
  return { ok: true, files };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
