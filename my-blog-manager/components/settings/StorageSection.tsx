'use client';

import { useEffect, useState } from 'react';
import { HardDrive, RefreshCw, AlertTriangle, CheckCircle2, FileText, FolderOpen } from 'lucide-react';

type StorageReport = {
  checkedAt: string;
  git: { bytes: number; fileCount: number; softLimitBytes: number };
  site: { bytes: number; fileCount: number; cfFileLimit: number; cfMaxFileBytes: number };
  breakdown: {
    publicBytes: number;
    publicCount: number;
    musicBytes: number;
    musicCount: number;
    briefingCoverBytes: number;
    briefingCoverCount: number;
    otherPublicBytes: number;
  };
  largestFiles: { name: string; relPath: string; bytes: number }[];
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function StorageSection() {
  const [data, setData] = useState<StorageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/storage', { cache: 'no-store' });
      if (!res.ok) throw new Error('读取存储空间信息失败');
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const gitPercent = data ? Math.min(100, (data.git.bytes / data.git.softLimitBytes) * 100) : 0;
  const cfFilesPercent = data ? Math.min(100, (data.site.fileCount / data.site.cfFileLimit) * 100) : 0;
  const maxFileBytes = data?.largestFiles[0]?.bytes ?? 0;
  const overCfLimit = data ? maxFileBytes > data.site.cfMaxFileBytes : false;

  return (
    <section aria-label="存储空间监控" className="min-w-0 rounded-3xl border border-slate-200/80 bg-slate-50/95 p-5 text-slate-700 shadow-sm md:p-7 dark:border-white/10 dark:bg-slate-900/95 dark:text-slate-200">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-500">
            <HardDrive size={13} /> Storage & Quota
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-white">存储空间与配额</h2>
          <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            实时统计 GitHub 仓库与 Cloudflare Pages 静态资源的本地占用情况，提前预警单文件超限。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-2.5 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-300"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          重新扫描
        </button>
      </header>

      {error && <p role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-xs text-rose-700">{error}</p>}

      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-white/70 bg-white/60 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/55">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">GitHub 仓库历史（.git）</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <CheckCircle2 size={12} /> {gitPercent.toFixed(1)}%
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-slate-800 dark:text-white">{formatBytes(data.git.bytes)}</p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/60">
                <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.max(2, gitPercent)}%` }} />
              </div>
              <p className="mt-2.5 text-[11px] text-slate-400">GitHub 官方推荐单仓保持在 1.00 GB 以内（单文件硬上限 100 MB）。</p>
            </div>

            <div className="rounded-3xl border border-white/70 bg-white/60 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/55">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Cloudflare Pages 部署文件数</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <CheckCircle2 size={12} /> {cfFilesPercent.toFixed(2)}%
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-slate-800 dark:text-white">
                {data.site.fileCount} <span className="text-sm font-normal text-slate-400">/ {data.site.cfFileLimit.toLocaleString()} 个</span>
              </p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/60">
                <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${Math.max(2, cfFilesPercent)}%` }} />
              </div>
              <p className="mt-2.5 text-[11px] text-slate-400">
                全站代码与静态资源共 {formatBytes(data.site.bytes)}；CF 免费版每月 500 次构建，单文件上限 25 MiB。
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/70 bg-white/55 p-5 dark:border-white/10 dark:bg-slate-800/50">
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400"><FolderOpen size={13} /> 静态资源总计 (public/)</p>
              <p className="mt-2 text-lg font-semibold text-slate-800 dark:text-white">{formatBytes(data.breakdown.publicBytes)}</p>
              <p className="mt-1 text-[11px] text-slate-400">共 {data.breakdown.publicCount} 个文件</p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/55 p-5 dark:border-white/10 dark:bg-slate-800/50">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">🎵 本地音乐与歌词</p>
              <p className="mt-2 text-lg font-semibold text-slate-800 dark:text-white">{formatBytes(data.breakdown.musicBytes)}</p>
              <p className="mt-1 text-[11px] text-slate-400">{data.breakdown.musicCount} 个文件</p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/55 p-5 dark:border-white/10 dark:bg-slate-800/50">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">🖼️ 每日选刊 AI 封面</p>
              <p className="mt-2 text-lg font-semibold text-slate-800 dark:text-white">{formatBytes(data.breakdown.briefingCoverBytes)}</p>
              <p className="mt-1 text-[11px] text-slate-400">{data.breakdown.briefingCoverCount} 张封面</p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-white/60 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/55">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white">
                <FileText size={15} /> 站点大文件 Top 6（Cloudflare 单文件上限 25 MiB）
              </h3>
              {overCfLimit ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-[11px] font-medium text-rose-700">
                  <AlertTriangle size={12} /> 存在超过 25 MiB 的文件，可能影响 CF 部署
                </span>
              ) : (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400">全部文件均符合 25 MiB 限制</span>
              )}
            </div>
            <div className="divide-y divide-slate-200/60 dark:divide-white/10">
              {data.largestFiles.map(file => {
                const tooBig = file.bytes > data.site.cfMaxFileBytes;
                return (
                  <div key={file.relPath} className="flex items-center justify-between gap-4 py-3 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-700 dark:text-slate-200">{file.name}</p>
                      <p className="truncate font-mono text-[11px] text-slate-400">{file.relPath}</p>
                    </div>
                    <span className={`shrink-0 font-mono font-semibold ${tooBig ? 'text-rose-600' : 'text-slate-600 dark:text-slate-300'}`}>
                      {formatBytes(file.bytes)}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-[11px] text-slate-400">
              上次扫描时间：{new Date(data.checkedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
