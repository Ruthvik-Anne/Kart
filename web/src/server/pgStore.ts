import 'server-only';
import type { StateStore } from './service';
import { lockedState, saveState, transaction } from './database';

/** Postgres-backed StateStore: one row per campus, locked with SELECT ... FOR UPDATE for the length of an action. */
export const pgStore: StateStore = {
  transaction: (campusId, fn) => transaction(client => fn({
    load: () => lockedState(client, campusId),
    save: db => saveState(client, campusId, db),
  })),
};
