import { body, guard, json } from '@/server/http';
import { pgStore } from '@/server/pgStore';
import { runAction, viewFor } from '@/server/service';

export const dynamic = 'force-dynamic';

/** Runs one permission-checked Kart action as the signed-in user and returns their refreshed snapshot. */
export async function POST(req: Request) {
  const g = await guard(req);
  if ('response' in g) return g.response;
  const { method, args } = await body(req);
  if (typeof method !== 'string') return json({ ok: false, error: 'Invalid request.' }, 400);
  const campus = g.user.campusId || 'main';
  const result = await runAction(pgStore, campus, g.user.id, method, args ?? []);
  const db = await pgStore.transaction(campus, tx => tx.load());
  return json({ result, db: viewFor(db, g.user) });
}
