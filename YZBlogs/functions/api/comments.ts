import { Env, getSessionUser, isValidSameOrigin, jsonResponse } from "../_shared/auth";

function normalizePagePath(raw: string | null): string {
  const trimmed = (raw || "/").trim();
  if (!trimmed.startsWith("/") || trimmed.length > 120) return "/";
  return trimmed === "/" ? "/" : trimmed.replace(/\/+$/, "");
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const pagePath = normalizePagePath(url.searchParams.get("path"));

  const rows = await env.DB.prepare(
    `SELECT c.id, c.page_path, c.content, c.created_at,
            u.id AS user_id, u.username, u.avatar_url, u.level, u.is_admin
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.page_path = ? AND c.is_hidden = 0
     ORDER BY c.created_at DESC
     LIMIT 100`
  )
    .bind(pagePath)
    .all();

  return jsonResponse({ comments: rows.results || [] });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isValidSameOrigin(request)) {
    return jsonResponse({ error: "非法请求来源" }, 403);
  }

  const user = await getSessionUser(env, request);
  if (!user) {
    return jsonResponse({ error: "请先使用 GitHub 登录后再发表评论" }, 401);
  }

  let body: { path?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "请求格式错误" }, 400);
  }

  const pagePath = normalizePagePath(body.path || "/");
  const content = (body.content || "").trim();
  if (!content) {
    return jsonResponse({ error: "评论内容不能为空" }, 400);
  }
  if (content.length > 1000) {
    return jsonResponse({ error: "评论内容不能超过 1000 字" }, 400);
  }

  const insertRes = await env.DB.prepare(
    "INSERT INTO comments (page_path, user_id, content) VALUES (?, ?, ?)"
  )
    .bind(pagePath, user.id, content)
    .run();

  return jsonResponse({
    success: true,
    comment: {
      id: insertRes.meta?.last_row_id,
      page_path: pagePath,
      content,
      created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
      user_id: user.id,
      username: user.username,
      avatar_url: user.avatar_url,
      level: user.level,
      is_admin: user.is_admin,
    },
  }, 201);
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!isValidSameOrigin(request)) {
    return jsonResponse({ error: "非法请求来源" }, 403);
  }

  const user = await getSessionUser(env, request);
  if (!user) {
    return jsonResponse({ error: "未登录" }, 401);
  }

  const url = new URL(request.url);
  const commentId = Number(url.searchParams.get("id"));
  if (!Number.isInteger(commentId) || commentId <= 0) {
    return jsonResponse({ error: "无效的评论 ID" }, 400);
  }

  if (user.is_admin === 1) {
    await env.DB.prepare("UPDATE comments SET is_hidden = 1 WHERE id = ?").bind(commentId).run();
  } else {
    const res = await env.DB.prepare("UPDATE comments SET is_hidden = 1 WHERE id = ? AND user_id = ?")
      .bind(commentId, user.id)
      .run();
    if (!res.meta || res.meta.changes !== 1) {
      return jsonResponse({ error: "无权删除此评论" }, 403);
    }
  }

  return jsonResponse({ success: true });
};
