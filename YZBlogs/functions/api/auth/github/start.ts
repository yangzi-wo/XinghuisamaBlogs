import { Env, jsonResponse, randomHex, sha256Base64Url } from "../../../_shared/auth";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GITHUB_CLIENT_ID) {
    return jsonResponse(
      { error: "尚未配置 GITHUB_CLIENT_ID，请先在 Cloudflare Pages 环境变量中添加 GitHub OAuth 凭证。" },
      503
    );
  }

  const url = new URL(request.url);
  let redirectTo = url.searchParams.get("redirect") || "/";
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    redirectTo = "/";
  }

  const state = randomHex(24);
  const codeVerifier = randomHex(32);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  // Clean up expired states opportunistically and store new state (10 min expiry)
  await env.DB.prepare("DELETE FROM oauth_states WHERE expires_at <= datetime('now')").run();
  await env.DB.prepare(
    "INSERT INTO oauth_states (state, code_verifier, redirect_to, expires_at) VALUES (?, ?, ?, datetime('now', '+10 minutes'))"
  )
    .bind(state, codeVerifier, redirectTo)
    .run();

  const callbackUrl = `${url.origin}/api/auth/github/callback`;
  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("scope", "read:user");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return Response.redirect(authUrl.toString(), 302);
};
