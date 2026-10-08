const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isValidPublicId(value: unknown, maxLength = 100): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && PUBLIC_ID_PATTERN.test(value);
}
