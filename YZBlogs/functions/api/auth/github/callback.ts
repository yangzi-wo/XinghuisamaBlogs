import { Env, SESSION_COOKIE_NAME, jsonResponse, randomHex } from "../../../_shared/auth";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return jsonResponse({ error: "GitHub OAuth 密钥未配置完整" }, 503);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return jsonResponse({ error: "缺少 OAuth 回调参数 code 或 state" }, 400);
  }

  const stateRow = await env.DB.prepare(
    "SELECT code_verifier, redirect_to FROM oauth_states WHERE state = ? AND expires_at > datetime('now')"
  )
    .bind(state)
    .first<{ code_verifier: string; redirect_to: string }>();

  if (!stateRow) {
    return jsonResponse({ error: "登录状态已过期或校验失败，请重新尝试登录" }, 400);
  }

  // Single-use state
  await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "yangzi-babel-tower",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/auth/github/callback`,
      code_verifier: stateRow.code_verifier,
    }),
  });

  const tokenData = (await tokenRes.json()) as { access_token?: string; error_description?: string };
  if (!tokenData.access_token) {
    return jsonResponse({ error: tokenData.error_description || "换取 GitHub Token 失败" }, 401);
  }

  const ghUserRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "yangzi-babel-tower",
    },
  });

  if (!ghUserRes.ok) {
    return jsonResponse({ error: "读取 GitHub 用户资料失败" }, 502);
  }

  const ghUser = (await ghUserRes.json()) as { id: number; login: string; avatar_url: string };
  const githubId = String(ghUser.id);
  const isOwner =
    (env.ADMIN_GITHUB_ID && githubId === env.ADMIN_GITHUB_ID) ||
    ghUser.login.toLowerCase() === "yangzi-wo"
      ? 1
      : 0;

  await env.DB.prepare(
    `INSERT INTO users (github_id, username, avatar_url, is_admin)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(github_id) DO UPDATE SET
       username = excluded.username,
       avatar_url = excluded.avatar_url,
       is_admin = CASE WHEN excluded.is_admin = 1 THEN 1 ELSE users.is_admin END,
       updated_at = datetime('now')`
  )
    .bind(githubId, ghUser.login, ghUser.avatar_url || "", isOwner)
    .run();

  const userRow = await env.DB.prepare("SELECT id FROM users WHERE github_id = ?")
    .bind(githubId)
    .first<{ id: number }>();

  if (!userRow) {
    return jsonResponse({ error: "创建用户记录失败" }, 500);
  }

  const sessionId = randomHex(32);
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))"
  )
    .bind(sessionId, userRow.id)
    .run();

  const redirectTarget = stateRow.redirect_to.startsWith("/") ? stateRow.redirect_to : "/";
  const headers = new Headers({ Location: `${url.origin}${redirectTarget}` });
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
  );
  return new Response(null, { status: 302, headers });
};
