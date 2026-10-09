// Append-only double-entry journal. Balances are always derived from postings.

export type AccountType = 'asset' | 'liability' | 'revenue' | 'expense';

export const ACCOUNTS = {
  ppiFloat: 'PPI_PARTNER_FLOAT',
  pendingSettlement: 'PENDING_SETTLEMENT',
  platformFees: 'PLATFORM_FEES',
  vendorCommission: 'VENDOR_COMMISSION',
  refunds: 'REFUNDS',
  promo: 'PROMO_CREDITS',
  wallet: (userId: string) => `USER_WALLET:${userId}`,
  vendorPayable: (vendorId: string) => `VENDOR_PAYABLE:${vendorId}`,
  escrow: (taskId: string) => `TASK_ESCROW:${taskId}`,
} as const;

export function accountType(account: string): AccountType {
  if (account === ACCOUNTS.ppiFloat) return 'asset';
  if (account === ACCOUNTS.platformFees || account === ACCOUNTS.vendorCommission) return 'revenue';
  if (account === ACCOUNTS.refunds || account === ACCOUNTS.promo) return 'expense';
  return 'liability';
}

/** Accounts that must never go below zero. */
const nonNegative = (account: string) =>
  account.startsWith('USER_WALLET:') || account.startsWith('TASK_ESCROW:') || account.startsWith('VENDOR_PAYABLE:');

export interface Posting { account: string; side: 'debit' | 'credit'; amount: number }

export interface JournalEntry {
  id: string;
  key: string;          // idempotency key
  type: string;
  memo: string;
  ts: number;
  postings: Posting[];
}

export class LedgerError extends Error {}

export class Ledger {
  readonly entries: JournalEntry[] = [];
  private keys = new Set<string>();

  /** Signed balance in the account's natural direction (assets/expenses: debit-positive; others: credit-positive). */
  balance(account: string): number {
    const debitNormal = accountType(account) === 'asset' || accountType(account) === 'expense';
    let sum = 0;
    for (const e of this.entries) {
      for (const p of e.postings) {
        if (p.account !== account) continue;
        const sign = (p.side === 'debit') === debitNormal ? 1 : -1;
        sum += sign * p.amount;
      }
    }
    return sum;
  }

  accounts(): string[] {
    return [...new Set(this.entries.flatMap(e => e.postings.map(p => p.account)))].sort();
  }

  /** Post a balanced entry. Re-posting an existing idempotency key returns the original entry. */
  post(input: { key: string; type: string; memo: string; postings: Posting[]; ts?: number }): JournalEntry {
    const existing = this.entries.find(e => e.key === input.key);
    if (existing) return existing;

    const { postings } = input;
    if (postings.length < 2) throw new LedgerError('An entry needs at least two postings.');
    if (postings.some(p => !Number.isInteger(p.amount) || p.amount <= 0)) {
      throw new LedgerError('Posting amounts must be positive integers.');
    }
    const debits = postings.filter(p => p.side === 'debit').reduce((a, p) => a + p.amount, 0);
    const credits = postings.filter(p => p.side === 'credit').reduce((a, p) => a + p.amount, 0);
    if (debits !== credits) throw new LedgerError(`Unbalanced entry: debits ${debits} != credits ${credits}.`);

    const entry: JournalEntry = {
      id: `JE-${String(this.entries.length + 1).padStart(5, '0')}`,
      key: input.key, type: input.type, memo: input.memo, ts: input.ts ?? Date.now(),
      postings: postings.map(p => ({ ...p })),
    };
    this.entries.push(entry);
    for (const account of new Set(postings.map(p => p.account))) {
      if (nonNegative(account) && this.balance(account) < 0) {
        this.entries.pop();
        throw new LedgerError(`Insufficient balance in ${account}.`);
      }
    }
    this.keys.add(input.key);
    return entry;
  }

  /** Total debits and credits across the whole journal; must always be equal. */
  trialBalance(): { debits: number; credits: number; balanced: boolean } {
    let debits = 0, credits = 0;
    for (const e of this.entries) for (const p of e.postings) (p.side === 'debit' ? (debits += p.amount) : (credits += p.amount));
    return { debits, credits, balanced: debits === credits };
  }

  /** Reverse an entry by posting the opposite sides; corrections are never edits. */
  reverse(entryId: string, reason: string): JournalEntry {
    const original = this.entries.find(e => e.id === entryId);
    if (!original) throw new LedgerError(`Unknown entry ${entryId}.`);
    return this.post({
      key: `reverse:${entryId}`, type: 'reversal', memo: `Reversal of ${entryId}: ${reason}`,
      postings: original.postings.map(p => ({ ...p, side: p.side === 'debit' ? 'credit' : 'debit' })),
    });
  }
}
