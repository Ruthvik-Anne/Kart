// Boundary to the existing PPI partner (to be plugged in later). KC stays simulated until then.

export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected';
export type IntentStatus = 'created' | 'succeeded' | 'failed';
export type PayoutStatus = 'requested' | 'processing' | 'paid' | 'failed';

export interface PpiAdapter {
  createTopUpIntent(userId: string, amount: number): Promise<{ intentId: string; status: IntentStatus }>;
  confirmTopUp(intentId: string): Promise<{ intentId: string; status: IntentStatus; amount: number }>;
  requestPayout(userId: string, amount: number): Promise<{ payoutId: string; status: PayoutStatus }>;
  getPayoutStatus(payoutId: string): Promise<PayoutStatus>;
  kycStatus(userId: string): Promise<KycStatus>;
}

/** In-memory stand-in: every top-up succeeds, payouts are paid on the next status check. */
export class MockPpiAdapter implements PpiAdapter {
  private intents = new Map<string, { userId: string; amount: number; status: IntentStatus }>();
  private payouts = new Map<string, PayoutStatus>();
  private n = 0;

  async createTopUpIntent(userId: string, amount: number) {
    const intentId = `mock-intent-${++this.n}`;
    this.intents.set(intentId, { userId, amount, status: 'created' });
    return { intentId, status: 'created' as const };
  }

  async confirmTopUp(intentId: string) {
    const intent = this.intents.get(intentId);
    if (!intent) return { intentId, status: 'failed' as const, amount: 0 };
    intent.status = 'succeeded';
    return { intentId, status: intent.status, amount: intent.amount };
  }

  async requestPayout(_userId: string, _amount: number) {
    const payoutId = `mock-payout-${++this.n}`;
    this.payouts.set(payoutId, 'requested');
    return { payoutId, status: 'requested' as const };
  }

  async getPayoutStatus(payoutId: string) {
    const current = this.payouts.get(payoutId) ?? 'failed';
    if (current === 'requested') this.payouts.set(payoutId, 'paid');
    return this.payouts.get(payoutId) ?? 'failed';
  }

  async kycStatus(_userId: string) {
    return 'verified' as const;
  }
}
