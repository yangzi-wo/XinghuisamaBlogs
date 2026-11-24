import { Env, calculateLevel, getNextLevelExp, getSessionUser, getUtc8DateString, jsonResponse } from "../_shared/auth";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const oauthConfigured = Boolean(env.GITHUB_CLIENT_ID);
  const user = await getSessionUser(env, request);
  if (!user) {
    return jsonResponse({
      authenticated: false,
      oauth_configured: oauthConfigured,
      user: null,
    });
  }

  const today = getUtc8DateString();
  const actualLevel = calculateLevel(user.exp);
  return jsonResponse({
    authenticated: true,
    oauth_configured: oauthConfigured,
    user: {
      id: user.id,
      username: user.username,
      avatar_url: user.avatar_url,
      exp: user.exp,
      level: actualLevel,
      checkin_streak: user.checkin_streak || 0,
      next_level_exp: getNextLevelExp(actualLevel),
      checked_in_today: user.last_checkin_date === today,
      is_admin: user.is_admin === 1,
    },
  });
};
