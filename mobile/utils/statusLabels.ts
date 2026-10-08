const STATUS_LABELS: Record<string, string> = {
  SUCCESS: 'PAID',
  PAID: 'PAID',
  FAILED: 'PAYMENT FAILED',
  PAYMENT_FAILED: 'PAYMENT FAILED',
  CANCELLED: 'PAYMENT CANCELLED',
  PAYMENT_CANCELLED: 'PAYMENT CANCELLED',
  PENDING: 'PAYMENT PENDING',
  PENDING_PAYMENT: 'PAYMENT PENDING',
  READY_FOR_EXIT: 'READY FOR EXIT',
  VERIFIED: 'VERIFIED',
  CHECK_REQUIRED: 'CHECK REQUIRED',
  USED: 'USED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return 'NOT AVAILABLE';
  const normalized = status.trim().toUpperCase();
  return STATUS_LABELS[normalized] ?? normalized.replaceAll('_', ' ');
}
