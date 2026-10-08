export const SHOP_QR_TYPE = 'SELF_SMART_CHECKOUT_SHOP';
export const SHOP_QR_VERSION = 1;

export function createShopQrPayload(token: string): string {
  return JSON.stringify({ type: SHOP_QR_TYPE, version: SHOP_QR_VERSION, token });
}
