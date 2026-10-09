// One function per business event. Each returns a balanced entry input for Ledger.post().
import { ACCOUNTS as A, type Posting } from './ledger';

export interface Fees { taskFeeRate: number; vendorCommissionRate: number }
export const DEFAULT_FEES: Fees = { taskFeeRate: 0.05, vendorCommissionRate: 0.03 };

type EntryInput = { key: string; type: string; memo: string; postings: Posting[] };
const dr = (account: string, amount: number): Posting => ({ account, side: 'debit', amount });
const cr = (account: string, amount: number): Posting => ({ account, side: 'credit', amount });
const nonZero = (...p: Posting[]) => p.filter(x => x.amount > 0);

export const topUp = (userId: string, amount: number, ref: string): EntryInput => ({
  key: `topup:${ref}`, type: 'topup', memo: 'Wallet top-up via PPI partner (mock)',
  postings: [dr(A.ppiFloat, amount), cr(A.wallet(userId), amount)],
});

export function checkout(orderId: string, buyerId: string, vendorId: string, amount: number, fees: Fees): EntryInput {
  const commission = Math.ceil(amount * fees.vendorCommissionRate);
  return {
    key: `order:${orderId}`, type: 'order', memo: `Order ${orderId}`,
    postings: nonZero(dr(A.wallet(buyerId), amount), cr(A.vendorPayable(vendorId), amount - commission), cr(A.vendorCommission, commission)),
  };
}

export function orderRefund(orderId: string, buyerId: string, vendorId: string, amount: number, fees: Fees): EntryInput {
  const commission = Math.ceil(amount * fees.vendorCommissionRate);
  return {
    key: `order-refund:${orderId}`, type: 'refund', memo: `Refund for order ${orderId}`,
    postings: nonZero(dr(A.vendorPayable(vendorId), amount - commission), dr(A.vendorCommission, commission), cr(A.wallet(buyerId), amount)),
  };
}

export const escrowReserve = (taskId: string, posterId: string, amount: number): EntryInput => ({
  key: `escrow-reserve:${taskId}`, type: 'escrow_reserve', memo: `Escrow reserved for ${taskId}`,
  postings: [dr(A.wallet(posterId), amount), cr(A.escrow(taskId), amount)],
});

/** Release one milestone: provider is paid net of the platform fee. */
export function escrowRelease(taskId: string, milestone: number, providerId: string, amount: number, fees: Fees): EntryInput {
  const fee = Math.ceil(amount * fees.taskFeeRate);
  return {
    key: `escrow-release:${taskId}:${milestone}`, type: 'escrow_release', memo: `Milestone ${milestone} released for ${taskId}`,
    postings: nonZero(dr(A.escrow(taskId), amount), cr(A.wallet(providerId), amount - fee), cr(A.platformFees, fee)),
  };
}

export const escrowRefund = (taskId: string, posterId: string, amount: number): EntryInput => ({
  key: `escrow-refund:${taskId}`, type: 'escrow_refund', memo: `Escrow refunded for ${taskId}`,
  postings: [dr(A.escrow(taskId), amount), cr(A.wallet(posterId), amount)],
});

/** Paid event ticket: host is credited net of the marketplace commission. */
export function eventTicket(ticketId: string, buyerId: string, hostId: string, amount: number, fees: Fees): EntryInput {
  const commission = Math.ceil(amount * fees.vendorCommissionRate);
  return {
    key: `ticket:${ticketId}`, type: 'event_ticket', memo: `Event ticket ${ticketId}`,
    postings: nonZero(dr(A.wallet(buyerId), amount), cr(A.wallet(hostId), amount - commission), cr(A.vendorCommission, commission)),
  };
}

export const vendorSettlement = (vendorId: string, amount: number, batch: string): EntryInput => ({
  key: `settle:${batch}:${vendorId}`, type: 'settlement', memo: `Settlement batch ${batch}`,
  postings: [dr(A.vendorPayable(vendorId), amount), cr(A.pendingSettlement, amount)],
});

/** Partner confirms the payout; pending settlement clears against the float. */
export const settlementConfirmed = (amount: number, batch: string): EntryInput => ({
  key: `settle-confirm:${batch}`, type: 'settlement_confirmed', memo: `Partner confirmed batch ${batch}`,
  postings: [dr(A.pendingSettlement, amount), cr(A.ppiFloat, amount)],
});

export const cashOut = (userId: string, amount: number, ref: string): EntryInput => ({
  key: `cashout:${ref}`, type: 'cashout', memo: 'Cash-out request (mock PPI)',
  postings: [dr(A.wallet(userId), amount), cr(A.pendingSettlement, amount)],
});
