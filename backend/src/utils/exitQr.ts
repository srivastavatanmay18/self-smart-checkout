import { isValidExitToken } from '../services/exitPassTokens.js';

export function createExitQrPayload(token: string): string {
  if (!isValidExitToken(token)) throw new Error('Exit QR payload must be a 256-bit opaque token.');
  return token;
}
