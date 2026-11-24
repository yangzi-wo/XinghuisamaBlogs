"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import type { AuthUser } from "./AuthWidget";

interface CommentItem {
  id: number;
  page_path: string;
  content: string;
  created_at: string;
  user_id: number;
  username: string;
  avatar_url: string;
  level: number;
  is_admin: number;
}

export default function Comments() {
  const rawPathname = usePathname() || "/";
  const pagePath = rawPathname === "/" ? "/" : rawPathname.replace(/\/+$/, "");

  const [user, setUser] = useState<AuthUser | null>(null);
  const [oauthConfigured, setOauthConfigured] = useState(true);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [apiAvailable, setApiAvailable] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sessRes, commRes] = await Promise.all([
        fetch("/api/session", { credentials: "same-origin" }),
        fetch(`/api/comments?path=${encodeURIComponent(pagePath)}`, { credentials: "same-origin" }),
      ]);

      if (!sessRes.ok || !commRes.ok) {
        setApiAvailable(false);
        return;
      }

      const sessData = await sessRes.json();
      const commData = await commRes.json();

      setOauthConfigured(Boolean(sessData.oauth_configured));
      setUser(sessData.authenticated ? sessData.user : null);
      setComments(Array.isArray(commData.comments) ? commData.comments : []);
      setApiAvailable(true);
    } catch {
      setApiAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [pagePath]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setStatusMsg("");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ path: pagePath, content: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setStatusMsg(data.error || "发送失败，请稍后重试");
        return;
      }
      setComments((prev) => [data.comment, ...prev]);
      setContent("");
      setStatusMsg("评论发布成功！");
    } catch {
      setStatusMsg("网络请求失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/comments?id=${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== id));
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="w-full mt-16 relative">
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-indigo-500/10 dark:bg-indigo-500/20 blur-3xl rounded-full pointer-events-none z-0" />

      <div className="relative z-10 pt-6 border-t border-slate-200/50 dark:border-slate-700/50">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <span>评论与足迹</span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              {comments.length}
            </span>
          </h3>
          {user && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              当前身份：<strong className="text-slate-700 dark:text-slate-200">{user.username}</strong> (Lv.{user.level})
            </span>
          )}
        </div>

        {!apiAvailable ? (
          <div className="rounded-2xl bg-white/30 dark:bg-slate-800/40 backdrop-blur-md border border-white/30 dark:border-white/10 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            本地纯前端预览模式下暂未连接 Cloudflare D1 接口，部署到线上后即可使用评论功能。
          </div>
        ) : (
          <>
            {user ? (
              <form onSubmit={handleSubmit} className="mb-8">
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="留下一段足迹或评论吧（支持纯文本，最多 1000 字）..."
                  className="w-full rounded-2xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-white/40 dark:border-white/10 p-4 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/60 transition-all resize-none"
                />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {statusMsg || `${content.length}/1000`}
                  </span>
                  <button
                    type="submit"
                    disabled={submitting || !content.trim()}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white shadow-md shadow-indigo-500/25 transition-all"
                  >
                    {submitting ? "发送中..." : "发表评论"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mb-8 rounded-2xl bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/40 dark:border-white/10 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  使用 GitHub 登录后即可发表评论，并可每日签到升级徽章。
                </p>
                <a
                  href={oauthConfigured ? `/api/auth/github/start?redirect=${encodeURIComponent(pagePath)}` : "#"}
                  onClick={(e) => {
                    if (!oauthConfigured) {
                      e.preventDefault();
                      alert("GitHub 登录尚未配置 Client ID，请先在 Cloudflare Pages 添加环境变量。");
                    }
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-500 hover:bg-indigo-600 text-white shadow-md shadow-indigo-500/25 transition-all whitespace-nowrap"
                >
                  使用 GitHub 登录
                </a>
              </div>
            )}

            {loading ? (
              <p className="text-center py-8 text-sm text-slate-400">正在加载评论...</p>
            ) : comments.length === 0 ? (
              <p className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                还没有留言，来做第一个留下足迹的人吧！
              </p>
            ) : (
              <div className="space-y-4">
                {comments.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl bg-white/45 dark:bg-slate-800/45 backdrop-blur-md border border-white/40 dark:border-white/10 p-4 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={item.avatar_url || "/avatar.jpg"}
                        alt={item.username}
                        className="w-9 h-9 rounded-full object-cover border border-white/50 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-800 dark:text-white">
                              {item.username}
                            </span>
                            <span className="px-1.5 py-0.5 text-[10px] font-black rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                              Lv.{item.level}
                            </span>
                            {item.is_admin === 1 && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-rose-500/15 text-rose-500">
                                站长
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-slate-400">{item.created_at}</span>
                            {user && (user.is_admin || user.id === item.user_id) && (
                              <button
                                type="button"
                                onClick={() => handleDelete(item.id)}
                                className="text-[11px] text-slate-400 hover:text-rose-500 transition-colors"
                              >
                                删除
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
                          {item.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
