"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

export interface AuthUser {
  id: number;
  username: string;
  avatar_url: string;
  exp: number;
  level: number;
  level_title?: string;
  checkin_streak?: number;
  next_level_exp: number | null;
  checked_in_today: boolean;
  is_admin: boolean;
}

export const LEVEL_TABLE = [
  { level: 1, title: "敬啟", total: 0, nextNeed: "80" },
  { level: 2, title: "花水電車", total: 80, nextNeed: "320" },
  { level: 3, title: "狼少年", total: 400, nextNeed: "720" },
  { level: 4, title: "花降", total: 1120, nextNeed: "1280" },
  { level: 5, title: "花青綠", total: 2400, nextNeed: "2000" },
  { level: 6, title: "四瓣", total: 4400, nextNeed: "2880" },
  { level: 7, title: "茜雲", total: 7280, nextNeed: "3920" },
  { level: 8, title: "苦夏临风", total: 11200, nextNeed: "5120" },
  { level: 9, title: "繁春倚水", total: 16320, nextNeed: "6480" },
  { level: 10, title: "風華鳥月", total: 22800, nextNeed: "已满级" },
];

export function getLevelTitle(level: number): string {
  return LEVEL_TABLE[Math.max(1, Math.min(10, level)) - 1]?.title || "敬啟";
}

export default function AuthWidget() {
  const pathname = usePathname() || "/";
  const [user, setUser] = useState<AuthUser | null>(null);
  const [oauthConfigured, setOauthConfigured] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [checkinMsg, setCheckinMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadSession = async () => {
    try {
      const res = await fetch("/api/session", { credentials: "same-origin" });
      if (!res.ok) {
        setLoaded(true);
        return;
      }
      const data = await res.json();
      setOauthConfigured(Boolean(data.oauth_configured));
      setUser(data.authenticated ? data.user : null);
    } catch {
      // Static local dev without Pages Functions
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    loadSession();
  }, [pathname]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleCheckin = async () => {
    if (busy) return;
    setBusy(true);
    setCheckinMsg("");
    try {
      const res = await fetch("/api/checkin", { method: "POST", credentials: "same-origin" });
      const data = await res.json();
      setCheckinMsg(data.message || (data.success ? "签到成功！" : "签到失败"));
      if (typeof data.exp === "number" && typeof data.level === "number") {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                exp: data.exp,
                level: data.level,
                level_title: data.level_title ?? getLevelTitle(data.level),
                checkin_streak: data.checkin_streak ?? prev.checkin_streak,
                next_level_exp: data.next_level_exp ?? null,
                checked_in_today: true,
              }
            : null
        );
      }
    } catch {
      setCheckinMsg("网络请求失败");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      setUser(null);
      setOpen(false);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return <div className="w-20 h-8 rounded-full bg-white/20 dark:bg-slate-800/40 animate-pulse" />;
  }

  if (!user) {
    const loginHref = `/api/auth/github/start?redirect=${encodeURIComponent(pathname)}`;
    return (
      <a
        href={oauthConfigured ? loginHref : "#"}
        onClick={(e) => {
          if (!oauthConfigured) {
            e.preventDefault();
            alert("GitHub 登录尚未配置 Client ID，请先在 Cloudflare Pages 添加环境变量。");
          }
        }}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-indigo-500/90 hover:bg-indigo-600 text-white shadow-md shadow-indigo-500/20 transition-all"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z"
          />
        </svg>
        登录
      </a>
    );
  }

  const levelTitle = user.level_title || getLevelTitle(user.level);
  const progressPct = user.next_level_exp
    ? Math.min(100, Math.round((user.exp / user.next_level_exp) * 100))
    : 100;

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full bg-white/50 dark:bg-slate-800/60 border border-white/40 dark:border-white/10 hover:border-indigo-400/60 transition-all shadow-sm"
        >
          <img
            src={user.avatar_url || "/avatar.jpg"}
            alt={user.username}
            className="w-6 h-6 rounded-full object-cover"
          />
          <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400">
            Lv.{user.level} · {levelTitle}
          </span>
        </button>

        {open && (
          <div className="absolute right-0 mt-3 w-72 rounded-2xl bg-white/85 dark:bg-slate-900/90 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-2xl p-4 z-50">
            <button
              type="button"
              title="查看签到规则与等级区间"
              aria-label="查看签到规则与等级区间"
              onClick={() => {
                setShowRules(true);
                setOpen(false);
              }}
              className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-slate-500 dark:text-slate-400 bg-white/60 dark:bg-slate-800/70 border border-white/50 dark:border-white/10 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-400/60 transition-all"
            >
              ?
            </button>

            <div className="flex items-center gap-3 mb-3 pr-6">
              <img
                src={user.avatar_url || "/avatar.jpg"}
                alt={user.username}
                className="w-10 h-10 rounded-full object-cover border border-indigo-400/50"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-slate-800 dark:text-white truncate">
                    {user.username}
                  </span>
                  {user.is_admin && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-rose-500/20 text-rose-500">
                      站长
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    Lv.{user.level} {levelTitle}
                  </span>
                  <span>· {user.exp} / {user.next_level_exp ?? "MAX"} EXP</span>
                </div>
                <div className="text-[10px] text-indigo-500 dark:text-indigo-400 mt-0.5">
                  已连续签到 {user.checkin_streak ?? 0} 天（满7天额外+60）
                </div>
              </div>
            </div>

            <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-3">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-rose-500 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <button
              type="button"
              disabled={busy || user.checked_in_today}
              onClick={handleCheckin}
              className={`w-full py-2 rounded-xl text-xs font-bold transition-all mb-2 ${
                user.checked_in_today
                  ? "bg-slate-200/70 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                  : "bg-indigo-500 hover:bg-indigo-600 text-white shadow-md shadow-indigo-500/25"
              }`}
            >
              {user.checked_in_today ? "今日已签到 ✓" : busy ? "签到中..." : "每日签到领经验 (+30 EXP)"}
            </button>

            {checkinMsg && (
              <p className="text-[11px] text-center text-indigo-600 dark:text-indigo-400 mb-2">
                {checkinMsg}
              </p>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={handleLogout}
              className="w-full py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
            >
              退出登录
            </button>
          </div>
        )}
      </div>

      {showRules && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 pt-20 bg-slate-900/50 backdrop-blur-md"
          onClick={() => setShowRules(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-3xl bg-white/85 dark:bg-slate-900/90 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-2xl p-6 text-slate-800 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black tracking-wide flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-gradient-to-r from-indigo-500 to-rose-500 text-white text-xs flex items-center justify-center">
                  ?
                </span>
                签到规则与等级称号
              </h3>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/15 border border-indigo-400/20 p-3.5 mb-4 text-xs space-y-1.5 leading-relaxed">
              <p>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">• 每日基础签到：</span>
                每次签到固定获得 <strong>+30 EXP</strong>（按东八区自然日计算）。
              </p>
              <p>
                <span className="font-bold text-rose-500">• 连续签到奖励：</span>
                连续签到第 7 天（每满 7 天）当天额外再加 <strong>+60 EXP</strong>；断签则连续天数重置，重新从 1 开始计数。
              </p>
            </div>

            <div className="overflow-y-auto pr-1 space-y-1.5">
              <div className="grid grid-cols-12 text-[11px] font-bold text-slate-400 px-3 pb-1">
                <span className="col-span-5">等级与称号</span>
                <span className="col-span-4">累计经验</span>
                <span className="col-span-3 text-right">升级还需</span>
              </div>
              {LEVEL_TABLE.map((row) => {
                const isCurrent = user.level === row.level;
                return (
                  <div
                    key={row.level}
                    className={`grid grid-cols-12 items-center px-3 py-2 rounded-xl text-xs transition-colors ${
                      isCurrent
                        ? "bg-gradient-to-r from-indigo-500/20 to-rose-500/20 border border-indigo-400/40 font-bold"
                        : "bg-white/50 dark:bg-slate-800/40 border border-white/30 dark:border-white/5"
                    }`}
                  >
                    <span className="col-span-5 flex items-center gap-1.5 min-w-0">
                      <span className="text-indigo-600 dark:text-indigo-400 font-black">
                        Lv.{row.level}
                      </span>
                      <span className="truncate text-slate-700 dark:text-slate-200">
                        {row.title}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500 text-white flex-shrink-0">
                          当前
                        </span>
                      )}
                    </span>
                    <span className="col-span-4 font-mono text-slate-600 dark:text-slate-300">
                      {row.total} EXP
                    </span>
                    <span className="col-span-3 text-right text-slate-500 dark:text-slate-400">
                      {row.nextNeed === "已满级" ? "满级" : `+${row.nextNeed}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
