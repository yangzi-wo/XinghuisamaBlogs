export interface Env {
  DB: D1Database;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  ADMIN_GITHUB_ID?: string;
}

export interface SessionUser {
  id: number;
  github_id: string;
  username: string;
  avatar_url: string;
  exp: number;
  level: number;
  last_checkin_date: string | null;
  is_admin: number;
}

export const SESSION_COOKIE_NAME = "babel_session";
export const DAILY_CHECKIN_EXP = 10;
export const LEVEL_THRESHOLDS = [0, 10, 30, 60, 100, 150, 220, 300, 400, 520];

export function calculateLevel(exp: number): number {
  let lvl = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (exp >= LEVEL_THRESHOLDS[i]) {
      lvl = i + 1;
    }
  }
  return Math.min(lvl, 10);
}

export function getNextLevelExp(level: number): number | null {
  if (level >= 10) return null;
  return LEVEL_THRESHOLDS[level] ?? null;
}

export function getUtc8DateString(date = new Date()): string {
  const utc8 = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return utc8.toISOString().slice(0, 10);
}

export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      ...headers,
    },
  });
}

export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("Cookie") || "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

export function isValidSameOrigin(request: Request): boolean {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin) {
    return origin === url.origin;
  }
  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      return new URL(referer).origin === url.origin;
    } catch {
      return false;
    }
  }
  return false;
}

export function randomHex(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function getSessionUser(env: Env, request: Request): Promise<SessionUser | null> {
  const cookies = parseCookies(request);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId || !env.DB) return null;

  const row = await env.DB.prepare(
    `SELECT u.id, u.github_id, u.username, u.avatar_url, u.exp, u.level, u.last_checkin_date, u.is_admin
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > datetime('now')`
  )
    .bind(sessionId)
    .first<SessionUser>();

  return row ?? null;
}
