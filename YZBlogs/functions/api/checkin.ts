import {
  DAILY_CHECKIN_EXP,
  Env,
  calculateLevel,
  getNextLevelExp,
  getSessionUser,
  getUtc8DateString,
  isValidSameOrigin,
  jsonResponse,
} from "../_shared/auth";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isValidSameOrigin(request)) {
    return jsonResponse({ error: "非法请求来源" }, 403);
  }

  const user = await getSessionUser(env, request);
  if (!user) {
    return jsonResponse({ error: "请先使用 GitHub 登录后再签到" }, 401);
  }

  const today = getUtc8DateString();
  if (user.last_checkin_date === today) {
    return jsonResponse({
      success: false,
      already_checked_in: true,
      message: "今天已经签到过啦，明天再来领取经验吧~",
      exp: user.exp,
      level: user.level,
      next_level_exp: getNextLevelExp(user.level),
    });
  }

  const newExp = user.exp + DAILY_CHECKIN_EXP;
  const newLevel = calculateLevel(newExp);

  const result = await env.DB.prepare(
    `UPDATE users
     SET exp = ?, level = ?, last_checkin_date = ?, updated_at = datetime('now')
     WHERE id = ? AND exp = ? AND (last_checkin_date IS NULL OR last_checkin_date < ?)`
  )
    .bind(newExp, newLevel, today, user.id, user.exp, today)
    .run();

  if (!result.meta || result.meta.changes !== 1) {
    return jsonResponse({
      success: false,
      already_checked_in: true,
      message: "今天已经签到过啦~",
    });
  }

  const leveledUp = newLevel > user.level;
  return jsonResponse({
    success: true,
    already_checked_in: true,
    gained_exp: DAILY_CHECKIN_EXP,
    leveled_up: leveledUp,
    message: leveledUp ? `签到成功！+${DAILY_CHECKIN_EXP} EXP，恭喜升到 Lv.${newLevel}！` : `签到成功！获得 +${DAILY_CHECKIN_EXP} EXP`,
    exp: newExp,
    level: newLevel,
    next_level_exp: getNextLevelExp(newLevel),
  });
};
