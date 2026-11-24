import { Env, SESSION_COOKIE_NAME, isValidSameOrigin, jsonResponse, parseCookies } from "../../_shared/auth";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isValidSameOrigin(request)) {
    return jsonResponse({ error: "非法请求来源" }, 403);
  }

  const cookies = parseCookies(request);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (sessionId && env.DB) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  }

  return jsonResponse(
    { success: true },
    200,
    {
      "Set-Cookie": `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    }
  );
};
