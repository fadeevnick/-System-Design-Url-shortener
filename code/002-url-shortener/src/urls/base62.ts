const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function encodeBase62(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('base62 value must be a non-negative safe integer');
  }

  if (value === 0) {
    return ALPHABET[0];
  }

  let current = value;
  let result = '';

  while (current > 0) {
    result = ALPHABET[current % 62] + result;
    current = Math.floor(current / 62);
  }

  return result;
}
