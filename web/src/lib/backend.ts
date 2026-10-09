export interface LiveSession { id: string; name: string; campus: string; token: string }

export async function backend<T>(path: string, token?: string, input?: unknown): Promise<T> {
  const response = await fetch('/api/backend/' + path.replace(/^\//, ''), {
    method: input === undefined ? 'GET' : 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(input !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: input === undefined ? undefined : JSON.stringify(input),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.detail ?? `Request failed (${response.status})`);
  return result as T;
}
