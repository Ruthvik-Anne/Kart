// Campus branding: the signed-in college's identity, resolved from the college directory when it
// can be reached and falling back to the installed campus.
import { useEffect, useState } from 'react';

export const COLLEGE_NAME = 'Velagapudi Ramakrishna Siddhartha Engineering College';
export const COLLEGE_LOGO = '/college/logo.jpg';
export const COLLEGE_IMAGE = '/college/campus.png';

export interface College { id: string; name: string }

let directory: College[] | null = null;

export async function loadColleges(signal?: AbortSignal): Promise<College[]> {
  if (directory) return directory;
  const res = await fetch('/api/colleges', { cache: 'no-store', signal });
  if (!res.ok) throw new Error('The college directory is unavailable.');
  const data = await res.json() as { colleges: College[] };
  directory = data.colleges;
  return directory;
}

/** Name of the campus the user signed in to. */
export function useCampusName(campusId?: string): string {
  const [name, setName] = useState(COLLEGE_NAME);
  useEffect(() => {
    if (!campusId) return;
    const controller = new AbortController();
    loadColleges(controller.signal)
      .then(list => setName(list.find(c => c.id === campusId)?.name ?? COLLEGE_NAME))
      .catch(() => setName(COLLEGE_NAME));
    return () => controller.abort();
  }, [campusId]);
  return name;
}
