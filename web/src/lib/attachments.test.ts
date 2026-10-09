import { describe, expect, it } from 'vitest';
import { cleanAttachments, formatSize, safeName, MAX_FILE_BYTES } from './attachments';

describe('cleanAttachments', () => {
  it('accepts allowed types and normalises the extension', () => {
    const r = cleanAttachments([{ name: 'Report.PDF', size: 2048 }, { name: 'slides.pptx', size: 5 }]);
    expect(r).toEqual({ ok: true, files: [{ name: 'Report.PDF', size: 2048, type: 'pdf' }, { name: 'slides.pptx', size: 5, type: 'pptx' }] });
  });
  it('rejects executables, double extensions and extension-less names', () => {
    expect(cleanAttachments([{ name: 'setup.exe', size: 10 }]).ok).toBe(false);
    expect(cleanAttachments([{ name: 'photo.png.exe', size: 10 }]).ok).toBe(false);
    expect(cleanAttachments([{ name: 'README', size: 10 }]).ok).toBe(false);
    expect(cleanAttachments([{ name: 'page.html', size: 10 }]).ok).toBe(false);
  });
  it('enforces size and count limits', () => {
    expect(cleanAttachments([{ name: 'a.pdf', size: MAX_FILE_BYTES + 1 }]).ok).toBe(false);
    expect(cleanAttachments([{ name: 'a.pdf', size: 0 }]).ok).toBe(false);
    expect(cleanAttachments(Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.pdf`, size: 1 }))).ok).toBe(false);
    expect(cleanAttachments(Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.pdf`, size: 1 }))).ok).toBe(true);
  });
  it('treats missing input as no files', () => {
    expect(cleanAttachments(undefined)).toEqual({ ok: true, files: [] });
  });
  it('strips paths and control characters from names', () => {
    expect(safeName('C:\\Users\\me\\notes.pdf')).toBe('notes.pdf');
    expect(safeName('../../etc/passwd.txt')).toBe('passwd.txt');
    expect(safeName('bad\u0000name.pdf')).toBe('badname.pdf');
    const r = cleanAttachments([{ name: '../../secret.pdf', size: 3 }]);
    expect(r.ok && r.files[0].name).toBe('secret.pdf');
  });
  it('rejects over-long names', () => {
    expect(cleanAttachments([{ name: `${'a'.repeat(80)}.pdf`, size: 1 }]).ok).toBe(false);
  });
});

describe('formatSize', () => {
  it('uses readable units', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
