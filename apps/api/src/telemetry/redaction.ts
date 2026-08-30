import { createHash } from 'crypto';

export function redactCode(code: string): string {
  if (!code) return code;
  const parts = code.split('.');
  if (parts.length < 4) return '[REDACTED_CODE]';
  const randomPart = parts[parts.length - 1];
  if (randomPart.length <= 4) return parts.slice(0, -1).join('.') + '.****';
  const redactedRandom = `${randomPart.slice(0, 2)}...${randomPart.slice(-2)}`;
  return `${parts.slice(0, -1).join('.')}.${redactedRandom}`;
}

const REDACTED_VALUE = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'accesstoken',
  'refreshtoken',
]);

export function hashSensitiveValue(val: string): string {
  if (!val) return val;
  return createHash('sha256').update(val).digest('hex').substring(0, 16);
}

export function redactLogObject(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return obj;

  const result: Record<string, unknown> = Array.isArray(obj) ? {} : {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_KEYS.has(lowerKey)) {
      result[key] = REDACTED_VALUE;
      continue;
    }

    if (lowerKey === 'code' && typeof value === 'string') {
      result[key] = redactCode(value);
      continue;
    }

    if (
      (lowerKey === 'email' || lowerKey === 'useremail') &&
      typeof value === 'string'
    ) {
      result[key] = hashSensitiveValue(value);
      continue;
    }

    if (
      (lowerKey === 'ip' ||
        lowerKey === 'clientip' ||
        lowerKey === 'remoteip') &&
      typeof value === 'string'
    ) {
      result[key] = hashSensitiveValue(value);
      continue;
    }

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      result[key] = redactLogObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item && typeof item === 'object'
          ? redactLogObject(item as Record<string, unknown>)
          : item,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}
