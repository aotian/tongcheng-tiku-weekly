/**
 * Session persistence.
 *
 * The Supabase access and refresh tokens are secrets, so they live in a
 * credential record — never in plugin configuration, the working draft,
 * a log line, or an HTTP response body.
 */

import { passwordSignIn, refreshSignIn, DEFAULT_HOSTS } from './http.js';

/** Stable key for this plugin's credential record. */
export const CREDENTIAL_KEY = 'tiku-weekly/session';

/** Refresh a little before the backend considers the token dead. */
const EXPIRY_SKEW_SECONDS = 60;

function isExpired(session) {
  if (!session?.expiresAt) return false;
  const seconds = Number(session.expiresAt);
  return Number.isFinite(seconds) && seconds * 1000 - EXPIRY_SKEW_SECONDS * 1000 <= Date.now();
}

/** Read the stored session, or `undefined` when nothing usable is stored. */
export async function readSession(credentials) {
  const record = await credentials.readRecord(CREDENTIAL_KEY);
  if (!record || record.kind !== 'grant') return undefined;
  const payload = record.payload;
  if (!payload || typeof payload !== 'object' || !payload.accessToken) return undefined;
  return payload;
}

/** Persist a session through the serialized read-modify-write path. */
export async function writeSession(credentials, session, profile = {}) {
  await credentials.modifyRecord(CREDENTIAL_KEY, async () => ({
    kind: 'grant',
    payload: {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken ?? null,
      expiresAt: session.expiresAt ?? null,
      email: session.email ?? null,
      userId: session.userId ?? null,
      host: session.host ?? DEFAULT_HOSTS.teach,
      role: profile.role ?? null,
      fullName: profile.fullName ?? null,
      username: profile.username ?? null,
      savedAt: new Date().toISOString(),
    },
  }));
}

/** Drop the stored session. */
export async function clearSession(credentials) {
  await credentials.deleteRecord(CREDENTIAL_KEY);
}

/**
 * Return a usable session, refreshing a nearly-expired one once.
 *
 * Refreshing writes the rotated tokens back, so two Hosts never race on stale
 * refresh tokens: the second caller reads what the first wrote.
 */
export async function ensureSession(credentials) {
  let session = await readSession(credentials);
  if (!session) return undefined;
  if (!isExpired(session)) return session;

  const host = session.host ?? DEFAULT_HOSTS.teach;
  if (!session.refreshToken) {
    await clearSession(credentials);
    return undefined;
  }
  try {
    const refreshed = await refreshSignIn(host, session.refreshToken);
    session = { ...session, ...refreshed, host };
    await writeSession(credentials, session, session);
    return session;
  } catch {
    await clearSession(credentials);
    return undefined;
  }
}

/** Sign in, resolve the profile, and persist everything. */
export async function signIn(credentials, host, account, password) {
  const session = await passwordSignIn(host, account, password);
  const stored = { ...session, host };
  await writeSession(credentials, stored);
  return stored;
}

/** What may be shown to a human: never tokens. */
export function publicSession(session) {
  if (!session) return null;
  return {
    email: session.email ?? null,
    userId: session.userId ?? null,
    role: session.role ?? null,
    fullName: session.fullName ?? null,
    username: session.username ?? null,
    host: session.host ?? null,
    expiresAt: session.expiresAt ?? null,
    savedAt: session.savedAt ?? null,
  };
}
