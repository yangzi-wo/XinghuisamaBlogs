"use client";

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';

export default function MusicSection({ formData, handleUpdate, pushToQueue, showToast }: any) {
  const tracks = Array.isArray(formData.localTracks) ? formData.localTracks : [];
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [lrcFile, setLrcFile] = useState<File | null>(null);
  const [lrcInspect, setLrcInspect] = useState<{ total: number; translated: number; hasMojibake: boolean } | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const inspectLrcFile = async (file: File | null) => {
    setLrcFile(file);
    if (!file) {
      setLrcInspect(null);
      return;
    }
    try {
      const text = await file.text();
      const hasMojibake = text.includes('\uFFFD');
      const entries: { time: number; hasInlineTrans: boolean }[] = [];
      for (const line of text.split(/\r?\n/)) {
        const matches = [...line.matchAll(/\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?\]/g)];
        const body = line.replace(/\[\d{2,}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();
        if (matches.length > 0 && body) {
          const inlineTrans = /^(.*?)\s*【([^】]+)】\s*$/.test(body) || /^(.*?)\s*\/\/\s*(.+?)\s*$/.test(body);
          for (const m of matches) {
            const time = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) / (m[3].length === 3 ? 1000 : 100) : 0);
            entries.push({ time, hasInlineTrans: inlineTrans });
          }
        }
      }
      entries.sort((a, b) => a.time - b.time);
      let total = 0;
      let translated = 0;
      let prevTime = -1;
      for (const entry of entries) {
        if (prevTime >= 0 && Math.abs(entry.time - prevTime) < 0.05) {
          translated += 1;
          prevTime = -1;
        } else {
          total += 1;
          if (entry.hasInlineTrans) translated += 1;
          prevTime = entry.hasInlineTrans ? -1 : entry.time;
        }
      }
      setLrcInspect({ total, translated, hasMojibake });
      if (hasMojibake) {
        showToast?.("检测到歌词文件可能非 UTF-8 编码（含乱码），建议先转为 UTF-8", "warning");
      } else if (total === 0) {
        showToast?.("未检测到标准 [mm:ss] 时间轴歌词", "warning");
      } else if (translated > 0) {
        showToast?.(`已识别双语歌词：共 ${total} 句，其中 ${translated} 句含翻译`, "success");
      } else {
        showToast?.(`已识别纯单语歌词：共 ${total} 句（未检测到翻译）`, "info");
      }
    } catch {
      setLrcInspect(null);
    }
  };

  const audioInputRef = useRef<HTMLInputElement>(null);
  const lrcInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleUploadTrack = async () => {
    if (!audioFile) {
      showToast?.("请先选择音频文件（支持 MP3 / M4A / FLAC / OGG / WAV）", "warning");
      return;
    }

    setIsUploading(true);
    showToast?.("正在保存本地音乐与歌词...", "info");

    try {
      const configRes = await fetch(`/backend_config.json?t=${Date.now()}`);
      const configData = await configRes.json();

      const fd = new FormData();
      fd.append('audio', audioFile);
      if (lrcFile) fd.append('lrc', lrcFile);
      if (coverFile) fd.append('cover', coverFile);
      fd.append('title', title.trim());
      fd.append('artist', artist.trim());

      const res = await fetch(`http://127.0.0.1:${configData.api_port}/api/music/upload-local`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();

      if (data.success && data.track) {
        const nextTracks = [...tracks, data.track];
        handleUpdate('localTracks', nextTracks);
        setTitle('');
        setArtist('');
        setAudioFile(null);
        setLrcFile(null);
        setLrcInspect(null);
        setCoverFile(null);
        if (audioInputRef.current) audioInputRef.current.value = '';
        if (lrcInputRef.current) lrcInputRef.current.value = '';
        if (coverInputRef.current) coverInputRef.current.value = '';
        showToast?.("✅ 已加入本地歌单，别忘了点击下方「暂存音乐修改」", "success");
      } else {
        showToast?.(`上传失败: ${data.message || (typeof data.detail === 'string' ? data.detail : `HTTP ${res.status}（请重启管理后台后再试）`)}`, "error");
      }
    } catch (error: any) {
      showToast?.(`连接异常: ${error.message}`, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const removeTrack = (index: number) => {
    const nextTracks = tracks.filter((_: any, i: number) => i !== index);
    handleUpdate('localTracks', nextTracks);
  };

  return (
    <motion.section
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 rounded-[40px] p-8 shadow-2xl"
    >
      <h2 className="text-xl font-black text-slate-800 dark:text-white mb-8">🎵 本地音乐与歌词管理</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* 左侧：当前本地歌单 */}
        <div className="space-y-3">
          <p className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-4">
            当前本地歌单 ({tracks.length})
          </p>
          <div className="max-h-[420px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
            {tracks.length === 0 ? (
              <div className="p-8 rounded-3xl border border-dashed border-slate-300/60 dark:border-slate-700/60 text-center text-xs text-slate-400">
                暂无本地歌曲，请在右侧上传 MP3 与 LRC 歌词~
              </div>
            ) : (
              tracks.map((track: any, index: number) => (
                <div
                  key={track.id || index}
                  className="flex justify-between items-center p-3 bg-white/40 dark:bg-slate-800/40 rounded-2xl border border-white/20 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={track.cover || '/avatar.jpg'}
                      alt={track.title}
                      className="w-10 h-10 rounded-lg object-cover shadow-sm flex-shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold text-slate-800 dark:text-white truncate">
                        {track.title}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                        <span className="truncate">{track.artist || '未知歌手'}</span>
                        {track.lrcUrl && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-500 font-bold flex-shrink-0">
                            LRC歌词
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeTrack(index)}
                    className="w-8 h-8 shrink-0 rounded-lg bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white flex items-center justify-center"
                    title="移除歌曲"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右侧：上传本地音频与 LRC 歌词 */}
        <div className="bg-slate-100/50 dark:bg-slate-800/50 rounded-3xl p-6 space-y-4">
          <p className="text-[10px] font-black text-slate-400 uppercase">上传本地音乐与歌词</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="歌曲名称（留空则用文件名）"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border-none rounded-2xl px-4 py-3 text-xs outline-none shadow-sm"
            />
            <input
              type="text"
              placeholder="歌手（选填）"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border-none rounded-2xl px-4 py-3 text-xs outline-none shadow-sm"
            />
          </div>

          <div className="space-y-2.5 text-xs">
            <label className="block p-3 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-dashed border-indigo-300 dark:border-indigo-700 cursor-pointer hover:border-indigo-500 transition-colors">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-1">
                1. 选择音频文件（必填，≤ 20MB）
              </span>
              <span className="text-slate-500 text-[11px] truncate block">
                {audioFile ? `已选：${audioFile.name}` : "支持 .mp3 / .m4a / .flac / .ogg / .wav"}
              </span>
              <input
                ref={audioInputRef}
                type="file"
                accept=".mp3,.m4a,.ogg,.wav,.flac,.aac,audio/*"
                className="hidden"
                onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              />
            </label>

            <label className="block p-3 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-dashed border-slate-300 dark:border-slate-700 cursor-pointer hover:border-indigo-400 transition-colors">
              <span className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                2. 选择歌词文件（可选，.lrc）
              </span>
              <span className="text-slate-500 text-[11px] truncate block">
                {lrcFile ? `已选：${lrcFile.name}` : "支持标准 LRC 时间轴歌词文件"}
              </span>
              {lrcInspect && (
                <span className={`mt-1 block text-[11px] font-medium ${lrcInspect.hasMojibake || lrcInspect.total === 0 ? 'text-amber-500' : lrcInspect.translated > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-500'}`}>
                  {lrcInspect.hasMojibake
                    ? '⚠️ 编码可能异常（建议转为 UTF-8）'
                    : lrcInspect.total === 0
                      ? '⚠️ 未检测到 [mm:ss] 时间轴'
                      : lrcInspect.translated > 0
                        ? `✅ 已识别双语歌词（${lrcInspect.total} 句，含 ${lrcInspect.translated} 句翻译）`
                        : `ℹ️ 纯单语歌词（${lrcInspect.total} 句，无翻译）`}
                </span>
              )}
              <input
                ref={lrcInputRef}
                type="file"
                accept=".lrc,.txt"
                className="hidden"
                onChange={(e) => void inspectLrcFile(e.target.files?.[0] || null)}
              />
            </label>

            <label className="block p-3 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-dashed border-slate-300 dark:border-slate-700 cursor-pointer hover:border-indigo-400 transition-colors">
              <span className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                3. 选择专辑封面（可选）
              </span>
              <span className="text-slate-500 text-[11px] truncate block">
                {coverFile ? `已选：${coverFile.name}` : "留空则默认使用站长头像"}
              </span>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleUploadTrack}
            disabled={isUploading}
            className="w-full py-3 bg-pink-500 hover:bg-pink-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-pink-500/20 disabled:opacity-50 transition-all"
          >
            {isUploading ? "正在上传保存..." : "上传并加入歌单"}
          </button>

          <button
            type="button"
            onClick={() => pushToQueue('本地歌单', 'localTracks', tracks)}
            className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl text-sm font-black shadow-xl active:scale-95 transition-all"
          >
            暂存音乐修改
          </button>
        </div>
      </div>
    </motion.section>
  );
}
