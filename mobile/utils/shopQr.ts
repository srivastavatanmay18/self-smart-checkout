export const SHOP_QR_TYPE = 'SELF_SMART_CHECKOUT_SHOP';
export const SHOP_QR_VERSION = 1;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;

export function parseShopQrData(data: string): string | null {
  try {
    const value: unknown = JSON.parse(data);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const payload = value as Record<string, unknown>;
    const keys = Object.keys(payload).sort();
    if (keys.join(',') !== 'token,type,version') return null;
    if (payload.type !== SHOP_QR_TYPE || payload.version !== SHOP_QR_VERSION) return null;
    return typeof payload.token === 'string' && TOKEN_PATTERN.test(payload.token) ? payload.token : null;
  } catch {
    return null;
  }
}
