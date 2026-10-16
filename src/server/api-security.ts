import type { NextRequest } from 'next/server';

/** Reject browser mutations initiated by another origin. Non-browser clients may omit Origin. */
export function hasTrustedMutationOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}
