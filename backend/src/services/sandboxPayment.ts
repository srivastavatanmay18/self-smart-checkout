import type { PaymentStatus } from '../models/Order.js';

export type SandboxPaymentOutcome = Extract<PaymentStatus, 'SUCCESS' | 'FAILED' | 'CANCELLED'>;

export function isSandboxPaymentEnabled(): boolean {
  return (process.env.PAYMENT_MODE ?? 'sandbox').trim().toLowerCase() === 'sandbox';
}

export function simulateSandboxPayment(outcome: SandboxPaymentOutcome): SandboxPaymentOutcome {
  return outcome;
}
