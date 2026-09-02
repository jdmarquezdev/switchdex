import type { IncomingMessage } from 'node:http';

export function parseAllowedOrigins(value: string | undefined): ReadonlySet<string> | undefined {
  if (value === undefined) return undefined;
  return new Set(value.split(',').map((origin) => origin.trim()).filter(Boolean));
}

export function isAllowedOrigin(
  request: Pick<IncomingMessage, 'headers'>,
  allowedOrigins: ReadonlySet<string> | undefined
): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (allowedOrigins !== undefined) return allowedOrigins.has(origin);

  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}
