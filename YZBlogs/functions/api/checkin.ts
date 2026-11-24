import {
  DAILY_CHECKIN_EXP,
  Env,
  STREAK_7_BONUS_EXP,
  calculateLevel,
  getNextLevelExp,
  getSessionUser,
  getUtc8DateString,
  getUtc8YesterdayString,
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
      checkin_streak: user.checkin_streak || 0,
      next_level_exp: getNextLevelExp(user.level),
    });
  }

  const yesterday = getUtc8YesterdayString();
  const newStreak = user.last_checkin_date === yesterday ? (user.checkin_streak || 0) + 1 : 1;
  const bonusExp = newStreak % 7 === 0 ? STREAK_7_BONUS_EXP : 0;
  const gainedExp = DAILY_CHECKIN_EXP + bonusExp;

  const newExp = user.exp + gainedExp;
  const newLevel = calculateLevel(newExp);

  const result = await env.DB.prepare(
    `UPDATE users
     SET exp = ?, level = ?, checkin_streak = ?, last_checkin_date = ?, updated_at = datetime('now')
     WHERE id = ? AND exp = ? AND (last_checkin_date IS NULL OR last_checkin_date < ?)`
  )
    .bind(newExp, newLevel, newStreak, today, user.id, user.exp, today)
    .run();

  if (!result.meta || result.meta.changes !== 1) {
    return jsonResponse({
      success: false,
      already_checked_in: true,
      message: "今天已经签到过啦~",
    });
  }

  const leveledUp = newLevel > user.level;
  const bonusNote = bonusExp > 0 ? `（含连续第 ${newStreak} 天额外 +${bonusExp} EXP！）` : "";
  const levelNote = leveledUp ? ` 恭喜升到 Lv.${newLevel}！` : "";

  return jsonResponse({
    success: true,
    already_checked_in: true,
    gained_exp: gainedExp,
    bonus_exp: bonusExp,
    checkin_streak: newStreak,
    leveled_up: leveledUp,
    message: `签到成功！+${gainedExp} EXP${bonusNote}${levelNote}`,
    exp: newExp,
    level: newLevel,
    next_level_exp: getNextLevelExp(newLevel),
  });
};
