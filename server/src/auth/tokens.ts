import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.AUTH_SECRET ?? 'dev-insecure-secret-change-me';
if (!process.env.AUTH_SECRET) {
  console.warn('[auth] AUTH_SECRET not set — using an insecure dev secret.');
}
const TTL_SECONDS = Number(process.env.AUTH_TTL_SECONDS ?? 60 * 60 * 24 * 30); // 30 days

export interface TokenPayload {
  uid: number;
  username: string;
  exp: number; // unix seconds
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function sign(data: string): string {
  return b64url(createHmac('sha256', SECRET).update(data).digest());
}

export function signToken(payload: Omit<TokenPayload, 'exp'>): string {
  const full: TokenPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS };
  const body = b64url(Buffer.from(JSON.stringify(full)));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string | undefined): TokenPayload | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString()) as TokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
