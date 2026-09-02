import { describe, expect, it } from 'vitest';
import { isAllowedOrigin, parseAllowedOrigins } from '../server/translation-origin';

function request(origin?: string, host = 'switchdexapi.jdmarquez.dev') {
  return { headers: { origin, host } };
}

describe('translation API origin validation', () => {
  it('allows requests without an Origin header', () => {
    expect(isAllowedOrigin(request(), parseAllowedOrigins('https://switchdex.jdmarquez.dev'))).toBe(true);
  });

  it('allows an exact match from a comma-separated allowlist', () => {
    const allowed = parseAllowedOrigins('https://example.com, https://switchdex.jdmarquez.dev');
    expect(isAllowedOrigin(request('https://switchdex.jdmarquez.dev'), allowed)).toBe(true);
  });

  it('rejects origins that do not match the allowlist exactly', () => {
    const allowed = parseAllowedOrigins('https://switchdex.jdmarquez.dev');
    expect(isAllowedOrigin(request('http://switchdex.jdmarquez.dev'), allowed)).toBe(false);
    expect(isAllowedOrigin(request('https://switchdex.jdmarquez.dev.evil.example'), allowed)).toBe(false);
  });

  it('falls back to the API Host header when the allowlist is not configured', () => {
    expect(isAllowedOrigin(request('https://switchdexapi.jdmarquez.dev'), undefined)).toBe(true);
    expect(isAllowedOrigin(request('https://switchdex.jdmarquez.dev'), undefined)).toBe(false);
  });
});
