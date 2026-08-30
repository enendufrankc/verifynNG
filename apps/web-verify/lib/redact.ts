import { redactCode as coreRedactCode } from '@verifynng/core';

/**
 * Redact a code for anything that reaches the client: the URL after
 * hydration, OG metadata, page titles. Never pass a full code past this
 * function boundary — see T7 in docs/epics/E09-verify-web.md.
 */
export function redactCode(code: string): string {
  return coreRedactCode(code);
}

/** True once a string has already been through {@link redactCode}. */
export function isRedacted(code: string): boolean {
  return code.endsWith('…') || code === '***';
}
