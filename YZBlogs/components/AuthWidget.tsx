"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";

export interface AuthUser {
  id: number;
  username: string;
  avatar_url: string;
  exp: number;
  level: number;
  checkin_streak?: number;
  next_level_exp: number | null;
  checked_in_today: boolean;
  is_admin: boolean;
}

export default function AuthWidget() {
  const pathname = usePathname() || "/";
  const [user, setUser] = useState<AuthUser | null>(null);
  const [oauthConfigured, setOauthConfigured] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
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

  const progressPct = user.next_level_exp
    ? Math.min(100, Math.round((user.exp / user.next_level_exp) * 100))
    : 100;

  return (
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
          Lv.{user.level}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-64 rounded-2xl bg-white/85 dark:bg-slate-900/90 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-2xl p-4 z-50">
          <div className="flex items-center gap-3 mb-3">
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
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Lv.{user.level} · {user.exp} / {user.next_level_exp ?? "MAX"} EXP
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
  );
}
