'use client';

import { useEffect, useState, type ReactNode } from 'react';
import BriefingContentManager from './BriefingContentManager';
import type { BriefingIssue } from './briefingApi';
import { ArrowDown, ArrowUp, ArrowUpRight, BookOpen, Check, CircleHelp, Cpu, Eye, Layers3, Loader2, Plus, RefreshCw, Save, Settings2, Sparkles, Trash2 } from 'lucide-react';

type AiProviderConfig = { provider: 'gemini' | 'openai'; baseUrl: string; model: string; secretName: string };
type ScheduleConfig = { enabled: boolean; preferredTime: string };
type ImageGenConfig = { enabled: boolean; provider: 'openai-images' | 'pollinations'; baseUrl: string; model: string; secretName: string; baseTags: string; negativeTags?: string; size: string };
const defaultAiProvider: AiProviderConfig = {
  provider: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com',
  model: 'gemini-3.8-flash',
  secretName: 'GEMINI_API_KEY',
};
const defaultSchedule: ScheduleConfig = {
  enabled: true,
  preferredTime: '08:00',
};
const defaultImageGen: ImageGenConfig = {
  enabled: false,
  provider: 'openai-images',
  baseUrl: 'https://api.siliconflow.cn/v1',
  model: 'Kwai-Kolors/Kolors',
  secretName: 'IMAGE_API_KEY',
  baseTags: 'anime illustration, clean composition, atmospheric lighting, digital art, high detail',
  negativeTags: 'lowres, bad anatomy, bad hands, text, watermark, signature, blurry',
  size: '1280x720',
};
const scheduleHours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
const aiPresets: { id: 'gemini' | 'deepseek' | 'custom-openai'; label: string; badge: string; desc: string; config: Partial<AiProviderConfig> }[] = [
  { id: 'gemini', label: 'Google AI Studio', badge: 'Gemini', desc: '免费层（海外直连稳定）', config: { provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-3.8-flash', secretName: 'GEMINI_API_KEY' } },
  { id: 'deepseek', label: 'DeepSeek 官方', badge: 'OpenAI 兼容', desc: '高性价比按量计费', config: { provider: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', secretName: 'OPENAI_API_KEY' } },
  { id: 'custom-openai', label: '自定义 OpenAI 兼容', badge: '自定义', desc: '填写任意 OpenAI 格式接口（如硅基流动、智谱、中转站等）', config: { provider: 'openai', secretName: 'OPENAI_API_KEY' } },
];

type Config = {
  version: number; revision: number;
  display: { enabled: boolean; title: string; subtitle: string; archiveDays: number; carouselDays: number; autoPlay: boolean; intervalSeconds: number; showCovers: boolean; dailyCoverCarousel?: boolean; showTerraNotes: boolean };
  selection: { topics: string[]; excludedKeywords: string[]; preferredSources: string[]; language: string; minItems?: number; maxItems: number };
  channels: { id: string; name: string; enabled: boolean }[];
  agent: { enabled: boolean; publishMode: string; preferredTime: string };
  aiProvider?: AiProviderConfig;
  schedule?: ScheduleConfig;
  imageGen?: ImageGenConfig;
};
type Issue = BriefingIssue;
type Status = { latestDate: string; issueCount: number; sitePreview: string };
type Tab = 'overview' | 'display' | 'selection' | 'issues' | 'api';
const tabs = [
  { id: 'overview' as Tab, label: '选刊总览', icon: Layers3 },
  { id: 'display' as Tab, label: '首页展示', icon: Eye },
  { id: 'selection' as Tab, label: '选题与栏目', icon: Settings2 },
  { id: 'issues' as Tab, label: '内容与审核', icon: BookOpen },
  { id: 'api' as Tab, label: '模型与 API', icon: Cpu },
];
const fieldClass = 'w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100/60 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200 dark:focus:ring-indigo-950';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-xs font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-300';
const splitTerms = (text: string) => [...new Set(text.split(/[\n,，]/).map(value => value.trim()).filter(Boolean))];

async function api<T>(name: string, options?: RequestInit): Promise<T> {
  const response = await fetch('/api/briefing/' + name, { cache: 'no-store', ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : '读取失败，请稍后再试');
  return body;
}

export default function BriefingSection() {
  const [tab, setTab] = useState<Tab>('overview');
  const [config, setConfig] = useState<Config | null>(null);
  const [baseline, setBaseline] = useState('');
  const [terms, setTerms] = useState({ topics: '', excludedKeywords: '', preferredSources: '' });
  const [issues, setIssues] = useState<Issue[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function apply(value: Config) {
    const normalized: Config = {
      ...value,
      display: { dailyCoverCarousel: true, ...value.display },
      selection: { minItems: 4, ...value.selection },
      aiProvider: { ...defaultAiProvider, ...(value.aiProvider || {}) },
      schedule: { ...defaultSchedule, ...(value.schedule || {}) },
      imageGen: { ...defaultImageGen, ...(value.imageGen || {}) },
    };
    setConfig(normalized);
    setTerms({ topics: normalized.selection.topics.join('\n'), excludedKeywords: normalized.selection.excludedKeywords.join('\n'), preferredSources: normalized.selection.preferredSources.join('\n') });
    setBaseline(JSON.stringify(normalized));
  }
  async function load() {
    setBusy(true); setError('');
    try {
      const [settings, archive, runtime] = await Promise.all([
        api<{ config: Config }>('settings'), api<{ issues: Issue[] }>('issues'), api<Status>('status'),
      ]);
      apply(settings.config); setIssues(archive.issues); setStatus(runtime);
    } catch (exception) { setError(exception instanceof Error ? exception.message : '读取失败'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []); // The console reads the local snapshot once on opening.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  const draft = config ? { ...config, selection: { ...config.selection, topics: splitTerms(terms.topics), excludedKeywords: splitTerms(terms.excludedKeywords), preferredSources: splitTerms(terms.preferredSources) } } : null;
  const dirty = draft !== null && JSON.stringify(draft) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function save() {
    if (!draft) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<{ config: Config }>('settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      apply(result.config); setMessage('已保存到本地预览。线上网站和现有每日任务未变更。');
    } catch (exception) { setError(exception instanceof Error ? exception.message : '保存失败'); }
    finally { setBusy(false); }
  }
  async function refreshPublished() {
    try {
      const [archive, runtime] = await Promise.all([api<{ issues: Issue[] }>('issues'), api<Status>('status')]);
      setIssues(archive.issues); setStatus(runtime);
    } catch (exception) { setError(exception instanceof Error ? exception.message : '列表刷新失败'); }
  }
  function display<K extends keyof Config['display']>(key: K, value: Config['display'][K]) {
    setConfig(previous => previous ? { ...previous, display: { ...previous.display, [key]: value } } : previous);
  }
  function selection<K extends keyof Config['selection']>(key: K, value: Config['selection'][K]) {
    setConfig(previous => previous ? { ...previous, selection: { ...previous.selection, [key]: value } } : previous);
  }
  function updateAiProvider(patch: Partial<AiProviderConfig>) {
    setConfig(previous => previous ? { ...previous, aiProvider: { ...defaultAiProvider, ...(previous.aiProvider || {}), ...patch } } : previous);
  }
  function updateSchedule(patch: Partial<ScheduleConfig>) {
    setConfig(previous => previous ? { ...previous, schedule: { ...defaultSchedule, ...(previous.schedule || {}), ...patch } } : previous);
  }
  function updateImageGen(patch: Partial<ImageGenConfig>) {
    setConfig(previous => previous ? { ...previous, imageGen: { ...defaultImageGen, ...(previous.imageGen || {}), ...patch } } : previous);
  }

  return <section aria-label="每日选刊管理" className="min-w-0 rounded-3xl border border-slate-200/80 bg-slate-50/95 p-4 text-slate-700 shadow-sm md:p-6 dark:border-white/10 dark:bg-slate-900/95 dark:text-slate-200">
    <div>

      <header className="mb-8 flex flex-col justify-between gap-5 2xl:flex-row 2xl:items-end">
        <div><p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-indigo-500"><Sparkles size={13} /> A little reading, every day</p><h2 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-white">每日选刊</h2><p className="mt-3 max-w-xl text-xs leading-6 text-slate-500 dark:text-slate-400">决定它是否出现，也决定它关注什么。你的兴趣，由你定义。</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={buttonClass} disabled={busy} onClick={() => { if (!dirty || window.confirm('重新读取会放弃尚未保存的修改，继续吗？')) void load(); }}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />重新读取</button>
          {status?.sitePreview && <a className={buttonClass} href={status.sitePreview} target="_blank" rel="noreferrer"><Eye size={14} />查看首页预览<ArrowUpRight size={12} /></a>}
          <button disabled={!dirty || busy} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-medium text-white shadow-lg shadow-indigo-500/15 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}保存本地设置</button>
        </div>
      </header>
      <div aria-live="polite" className="mb-4 space-y-2">{error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50/90 px-5 py-3 text-xs leading-6 text-rose-700">{error}</p>}{message && <p role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-5 py-3 text-xs leading-6 text-emerald-700"><Check size={15} />{message}</p>}</div>
      <div id="briefing-workspace" className="scroll-mt-24 space-y-5">
        <nav aria-label="选刊管理" className="flex flex-wrap gap-2 rounded-2xl border border-white/60 bg-white/40 p-2 dark:border-white/10 dark:bg-slate-900/40">{tabs.map(item => <button key={item.id} type="button" aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs transition ${tab === item.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/10'}`}><item.icon size={14} />{item.label}</button>)}</nav>
        <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">{dirty ? '有尚未保存的选刊修改。切换左侧栏目会保留，请在离开网页前保存。' : '选刊与左侧其他设置在同一控制台管理。当前改动仅保存到本地网站目录。'}</p>
        <div className="min-w-0">
          {!config ? <Panel title={busy ? '正在读取选刊配置…' : '尚未连接本机服务'} description="启动本地预览服务后，可以在这里管理展示和选题。"><button onClick={() => void load()} className={buttonClass} disabled={busy}>重新连接</button></Panel> : <>
            {tab === 'overview' && <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3"><Metric label="首页展示" value={config.display.enabled ? '已开启' : '已隐藏'} note="关闭不删除历史内容" /><Metric label="已保存选刊" value={`${status?.issueCount ?? 0} 期`} note={`最近一期 ${status?.latestDate ?? '暂无'}`} /><Metric label="云端自动更新" value={config.schedule?.enabled ? `每天 ${config.schedule?.preferredTime || '08:00'}` : '已关闭'} note="可在「模型与 API」调整" /></div>
              <Panel title="给首页留一块自己的阅读角" description="可以是技术、文学、设计、体育，也可以只是你今天感兴趣的事。">
                <Toggle title="在首页显示选刊板块" description="隐藏后仍保留全部选刊，不影响云端自动生成。" checked={config.display.enabled} onChange={value => display('enabled', value)} />
                <div className="mt-6 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-800 p-7 text-white"><div className="flex justify-between gap-4"><span className="text-[9px] tracking-[0.24em] text-indigo-200">DAILY SIGNAL</span><span className="text-[11px] text-white/50">{status?.latestDate ?? '等待第一期'}</span></div><p className="mt-7 text-[11px] tracking-widest text-indigo-200">{config.display.title}</p><h2 className="mt-2 text-2xl font-medium tracking-wide">{config.display.subtitle}</h2><p className="mt-4 truncate text-xs text-white/60">{issues[0]?.items[0]?.title ?? '从你关注的方向，开始第一期选刊。'}</p><div className="mt-6 flex flex-wrap gap-2">{config.channels.filter(channel => channel.enabled).map(channel => <span key={channel.id} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-white/70">{channel.name}</span>)}</div></div>
                <p className="mt-3 text-[11px] leading-6 text-slate-400">上方为文字样式示意；保存后，点击“查看首页预览”检查实际效果。</p>
              </Panel>
            </div>}
            {tab === 'display' && <div className="space-y-5">
              <Panel title="首页展示" description="把选刊作为一个可选板块，而不是每个网站必须拥有的部分。"><Toggle title="显示选刊板块" description="仅隐藏首页入口，已有内容和阅读记录保留。" checked={config.display.enabled} onChange={value => display('enabled', value)} /><div className="mt-6 grid gap-5 sm:grid-cols-2"><Field label="板块名称"><input className={fieldClass} value={config.display.title} maxLength={40} onChange={e => display('title', e.target.value)} /></Field><Field label="板块简介"><input className={fieldClass} value={config.display.subtitle} maxLength={100} onChange={e => display('subtitle', e.target.value)} /></Field></div></Panel>
              <Panel title="阅读与轮播" description="保留按日归档、暂停轮播和读者自己的收藏。"><div className="grid gap-5 sm:grid-cols-3"><Field label="往期展示范围" hint="以最近一次打开网站的日期计算，不生成空白期刊。"><select className={fieldClass} value={config.display.archiveDays} onChange={e => display('archiveDays', Number(e.target.value))}>{[7, 14, 30, 60, 90].map(value => <option key={value} value={value}>最近 {value} 天</option>)}</select></Field><Field label="卡片轮播范围"><input className={fieldClass} type="number" min={1} max={Math.min(14, config.display.archiveDays)} value={config.display.carouselDays} onChange={e => display('carouselDays', Number(e.target.value))} /></Field><Field label="每张停留时间（秒）"><input className={fieldClass} type="number" min={5} max={60} value={config.display.intervalSeconds} onChange={e => display('intervalSeconds', Number(e.target.value))} /></Field></div><div className="mt-7 space-y-5"><Toggle title="自动轮播" description="阅读、悬停、切到后台或启用减少动态效果时，会自动暂停。" checked={config.display.autoPlay} onChange={value => display('autoPlay', value)} /><Toggle title="显示期刊封面" description="关闭后显示简洁的渐变背景，封面文件仍然保留。" checked={config.display.showCovers} onChange={value => display('showCovers', value)} /><Toggle title="当日封面自动轮换" description="开启后，顶部卡片会在本期所有简报的 AI 封面图之间按设定停留秒数自动轮换。" checked={config.display.dailyCoverCarousel ?? true} onChange={value => display('dailyCoverCarousel', value)} /><Toggle title="开放附加阅读" description="这是你的个人阅读扩展，其他使用者可以关闭。" checked={config.display.showTerraNotes} onChange={value => display('showTerraNotes', value)} /></div></Panel>
            </div>}
            {tab === 'selection' && <div className="space-y-5">
              <Panel title="你希望读到什么" description="以下是你的个人偏好。新安装不预设任何专业方向，也不要求填写特定领域。"><div className="grid gap-6 sm:grid-cols-2"><Field label="关注主题" hint="每行一个，也可以用逗号分隔。留空时不按主题筛选历史内容。"><textarea className={fieldClass} rows={5} value={terms.topics} onChange={e => setTerms({ ...terms, topics: e.target.value })} placeholder={'例如：摄影\n城市生活\n开源软件'} /></Field><Field label="排除关键词" hint="用于后续 Agent 选题，不会删除已有内容。"><textarea className={fieldClass} rows={5} value={terms.excludedKeywords} onChange={e => setTerms({ ...terms, excludedKeywords: e.target.value })} placeholder="不想收录的主题，可留空" /></Field></div><div className="mt-6"><Field label="偏好来源" hint="填写媒体、期刊、机构名称或网址；只是选题偏好，不是抓取白名单。"><textarea className={fieldClass} rows={3} value={terms.preferredSources} onChange={e => setTerms({ ...terms, preferredSources: e.target.value })} placeholder="每行一个来源，可留空" /></Field></div><div className="mt-6 grid gap-5 sm:grid-cols-3"><Field label="摘要语言"><select className={fieldClass} value={config.selection.language} onChange={e => selection('language', e.target.value)}><option value="zh-CN">中文</option><option value="en-US">English</option><option value="ja-JP">日本語</option></select></Field><Field label="每期最少条目" hint="云端生成时要求至少输出的数量。"><input className={fieldClass} type="number" min={1} max={config.selection.maxItems} value={config.selection.minItems ?? 4} onChange={e => { const val = Math.max(1, Math.min(20, Number(e.target.value) || 1)); selection('minItems', Math.min(val, config.selection.maxItems)); }} /></Field><Field label="每期最多条目" hint="新选刊的生成上限（1–20）。"><input className={fieldClass} type="number" min={1} max={20} value={config.selection.maxItems} onChange={e => { const val = Math.max(1, Math.min(20, Number(e.target.value) || 1)); setConfig(previous => previous ? { ...previous, selection: { ...previous.selection, maxItems: val, minItems: Math.min(previous.selection.minItems ?? 4, val) } } : previous); }} /></Field></div></Panel>
              <Panel title="栏目设置" description="可自由编辑栏目名称、归属编号（小写字母/数字/短横线）、显示顺序，或删除不需要的栏目（至少保留并启用 1 个）。">
                <div className="space-y-4">
                  {config.channels.map((channel, index) => (
                    <div key={index} className="flex flex-col gap-4 rounded-2xl border border-slate-200/60 bg-white/30 p-4 sm:flex-row sm:items-end dark:border-white/10">
                      <div className="min-w-36 flex-1">
                        <label className="mb-1.5 block text-[11px] font-medium text-slate-500 dark:text-slate-400" htmlFor={`channel-name-${index}`}>栏目名称</label>
                        <input
                          id={`channel-name-${index}`}
                          className={fieldClass}
                          value={channel.name}
                          maxLength={24}
                          onChange={e => setConfig({ ...config, channels: config.channels.map((entry, i) => i === index ? { ...entry, name: e.target.value } : entry) })}
                          placeholder="例如：动态精选"
                        />
                      </div>
                      <div className="min-w-36 flex-1">
                        <label className="mb-1.5 block text-[11px] font-medium text-slate-500 dark:text-slate-400" htmlFor={`channel-id-${index}`}>归属编号（英文 ID）</label>
                        <input
                          id={`channel-id-${index}`}
                          className={fieldClass + ' font-mono'}
                          value={channel.id}
                          maxLength={32}
                          onChange={e => {
                            const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                            setConfig({ ...config, channels: config.channels.map((entry, i) => i === index ? { ...entry, id: cleaned } : entry) });
                          }}
                          placeholder="例如：news"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pb-1">
                        <Toggle
                          title={channel.enabled ? '显示' : '隐藏'}
                          checked={channel.enabled}
                          onChange={value => setConfig({ ...config, channels: config.channels.map((entry, i) => i === index ? { ...entry, enabled: value } : entry) })}
                          compact
                        />
                        <button
                          type="button"
                          title="上移"
                          disabled={index === 0}
                          className={buttonClass + ' px-2.5 py-2'}
                          onClick={() => {
                            const next = [...config.channels];
                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                            setConfig({ ...config, channels: next });
                          }}
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          title="下移"
                          disabled={index === config.channels.length - 1}
                          className={buttonClass + ' px-2.5 py-2'}
                          onClick={() => {
                            const next = [...config.channels];
                            [next[index], next[index + 1]] = [next[index + 1], next[index]];
                            setConfig({ ...config, channels: next });
                          }}
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          type="button"
                          title="删除栏目"
                          disabled={config.channels.length <= 1}
                          className={buttonClass + ' px-2.5 py-2 text-rose-500 hover:border-rose-300 hover:text-rose-600'}
                          onClick={() => {
                            if (config.channels.length <= 1) return;
                            const next = config.channels.filter((_, i) => i !== index);
                            if (!next.some(c => c.enabled)) next[0] = { ...next[0], enabled: true };
                            setConfig({ ...config, channels: next });
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  disabled={config.channels.length >= 6}
                  className={buttonClass + ' mt-5'}
                  onClick={() => {
                    let index = config.channels.length + 1;
                    while (config.channels.some(channel => channel.id === `section-${index}`)) index++;
                    setConfig({ ...config, channels: [...config.channels, { id: `section-${index}`, name: '新栏目', enabled: true }] });
                  }}
                >
                  <Plus size={14} />新增栏目
                </button>
              </Panel>
            </div>}
            <div hidden={tab !== 'issues'}><BriefingContentManager issues={issues} channels={config.channels} maxItems={config.selection.maxItems} onPublished={() => void refreshPublished()} /></div>
            {tab === 'api' && (() => {
              const ai = { ...defaultAiProvider, ...(config.aiProvider || {}) };
              const sched = { ...defaultSchedule, ...(config.schedule || {}) };
              const img = { ...defaultImageGen, ...(config.imageGen || {}) };
              const debugCmd = `$env:${ai.secretName}="你的API_KEY"; python scripts/generate_daily_briefing.py --force`;
              return <div className="space-y-5">
                <Panel title="模型提供商与快速预设" description="选择每日选刊自动生成时调用的大模型接口。点击下方预设可一键填入常用免费或低成本平台参数。">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {aiPresets.map(preset => {
                      const active =
                        preset.id === 'gemini'
                          ? ai.provider === 'gemini'
                          : preset.id === 'deepseek'
                            ? ai.provider === 'openai' && ai.baseUrl.includes('api.deepseek.com')
                            : ai.provider === 'openai' && !ai.baseUrl.includes('api.deepseek.com');
                      const handleSelect = () => {
                        if (preset.id === 'custom-openai') {
                          const isKnownPreset = ai.baseUrl.includes('generativelanguage.googleapis.com') || ai.baseUrl.includes('api.deepseek.com');
                          updateAiProvider({
                            provider: 'openai',
                            baseUrl: isKnownPreset ? 'https://api.openai.com/v1' : ai.baseUrl,
                            model: isKnownPreset ? 'gpt-4o-mini' : ai.model,
                            secretName: ai.secretName === 'GEMINI_API_KEY' ? 'OPENAI_API_KEY' : ai.secretName,
                          });
                        } else {
                          updateAiProvider(preset.config);
                        }
                      };
                      return <button key={preset.id} type="button" onClick={handleSelect} className={`rounded-2xl border p-4 text-left transition ${active ? 'border-indigo-500 bg-indigo-50/80 shadow-sm dark:border-indigo-400 dark:bg-indigo-950/40' : 'border-slate-200/80 bg-white/50 hover:border-indigo-300 dark:border-white/10 dark:bg-slate-900/30'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800 dark:text-white">{preset.label}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">{preset.badge}</span>
                        </div>
                        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{preset.desc}</p>
                      </button>;
                    })}
                  </div>
                </Panel>
                <Panel title="接口连接参数" description="保存后会同步写入 briefingConfig.json；API 密钥（Key）不在此处保存，请放在 GitHub Actions Secrets 中以防泄露。">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="接口协议类型">
                      <select className={fieldClass} value={ai.provider} onChange={e => updateAiProvider({ provider: e.target.value as 'gemini' | 'openai' })}>
                        <option value="gemini">Google AI Studio (Gemini 原生接口)</option>
                        <option value="openai">OpenAI 兼容接口（智谱 / 硅基流动 / 百炼 / DeepSeek）</option>
                      </select>
                    </Field>
                    <Field label="GitHub Secret 环境变量名" hint="在 GitHub 仓库 Settings → Secrets → Actions 中配置对应名称的密钥。">
                      <input className={fieldClass} value={ai.secretName} maxLength={64} onChange={e => updateAiProvider({ secretName: e.target.value.toUpperCase() })} placeholder="例如 GEMINI_API_KEY 或 OPENAI_API_KEY" />
                    </Field>
                  </div>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <Field label="API Base URL" hint="OpenAI 兼容平台通常以 /v1 或 /v4 结尾。">
                      <input className={fieldClass} value={ai.baseUrl} maxLength={200} onChange={e => updateAiProvider({ baseUrl: e.target.value })} placeholder="https://api.siliconflow.cn/v1" />
                    </Field>
                    <Field label="模型名称（Model ID）" hint="不同平台对模型 ID 大小写敏感，请以平台控制台为准。">
                      <input className={fieldClass} value={ai.model} maxLength={100} onChange={e => updateAiProvider({ model: e.target.value })} placeholder="gemini-3.8-flash" />
                    </Field>
                  </div>
                  <div className="mt-6 rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4 text-xs leading-6 text-amber-800 dark:border-amber-400/20 dark:bg-amber-950/30 dark:text-amber-200">
                    安全提示：当前切换的是接口地址与模型名称，不会将任何密钥写入仓库。切换后请点击右上角 <strong>保存本地设置</strong> 并推送至 GitHub，下一次定时或手动运行选刊任务时即自动生效。
                  </div>
                </Panel>
                <Panel title="定时更新与调试" description="直接控制 GitHub Actions 的每日自动更新时间（北京时间），并提供本地命令行调试入口。">
                  <Toggle
                    title="启用云端每日自动更新"
                    description="开启后，GitHub Actions 会在每天设定时段自动抓取资讯并更新选刊；关闭则仅保留手动触发。"
                    checked={sched.enabled}
                    onChange={value => updateSchedule({ enabled: value })}
                  />
                  <div className="mt-6 grid gap-5 sm:grid-cols-2">
                    <Field label="期望更新时间（北京时间）" hint="云端每小时整点检查一次，到达或超过该整点且今日尚未生成时自动执行（每日仅生成 1 期）。">
                      <select
                        className={fieldClass}
                        value={scheduleHours.includes(sched.preferredTime) ? sched.preferredTime : `${sched.preferredTime.slice(0, 2)}:00`}
                        onChange={e => updateSchedule({ preferredTime: e.target.value })}
                      >
                        {scheduleHours.map(t => <option key={t} value={t}>每天 {t}（UTC+8）</option>)}
                      </select>
                    </Field>
                    <Field label="最近一期与调试入口" hint="修改时间或模型后请先保存并推送；云端可随时手动点 Run workflow 立即测试。">
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <a
                          href="https://github.com/yangzi-wo/XinghuisamaBlogs/actions/workflows/daily-briefing.yml"
                          target="_blank"
                          rel="noreferrer"
                          className={buttonClass}
                        >
                          打开 GitHub Actions 手动运行 <ArrowUpRight size={13} />
                        </a>
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() => {
                            navigator.clipboard?.writeText(debugCmd);
                            setMessage('已复制 PowerShell 本地调试命令，替换 API_KEY 后在仓库根目录运行即可。');
                          }}
                        >
                          复制本地调试命令
                        </button>
                      </div>
                    </Field>
                  </div>
                  <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-100/70 px-4 py-3 font-mono text-[11px] text-slate-600 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300">
                    {debugCmd}
                  </div>
                </Panel>
                <Panel title="AI 自动封面配图与基本 Tag" description="Gemini 总结完当日选刊后，会自动提取画面元素并与下方基本画风 Tag 组合成 Prompt 生成封面图（失败时自动回退默认封面，不影响选刊发布）。">
                  <Toggle
                    title="启用每日选刊 AI 自动生图"
                    description="开启后，每次自动生成选刊时会同步生成封面并写入 dailyBriefingCovers.json。"
                    checked={img.enabled}
                    onChange={value => updateImageGen({ enabled: value })}
                  />
                  {(() => {
                    const isSilicon = img.provider === 'openai-images' && img.baseUrl.includes('siliconflow.cn');
                    const isPollinations = img.provider === 'pollinations';
                    const isCustom = !isSilicon && !isPollinations;
                    const activeBtn = 'inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-500 bg-indigo-50/90 px-4 py-2.5 text-xs font-semibold text-indigo-700 shadow-sm transition dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-200';
                    return <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={isSilicon ? activeBtn : buttonClass}
                        onClick={() => updateImageGen({ provider: 'openai-images', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Kwai-Kolors/Kolors', secretName: 'IMAGE_API_KEY', size: '1280x720' })}
                      >
                        预设：硅基流动 Kolors / FLUX
                      </button>
                      <button
                        type="button"
                        className={isPollinations ? activeBtn : buttonClass}
                        onClick={() => updateImageGen({ provider: 'pollinations', baseUrl: 'https://gen.pollinations.ai', model: 'flux', secretName: '', size: '1280x720' })}
                      >
                        预设：Pollinations 免费生图
                      </button>
                      <button
                        type="button"
                        className={isCustom ? activeBtn : buttonClass}
                        onClick={() => {
                          const fromKnown = img.baseUrl.includes('siliconflow.cn') || img.baseUrl.includes('pollinations.ai');
                          updateImageGen({
                            provider: 'openai-images',
                            baseUrl: fromKnown ? 'https://api.openai.com/v1' : img.baseUrl,
                            model: fromKnown ? 'dall-e-3' : img.model,
                            secretName: img.secretName || 'IMAGE_API_KEY',
                          });
                        }}
                      >
                        预设：自定义 OpenAI 生图
                      </button>
                    </div>;
                  })()}
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <Field label="生图接口协议">
                      <select className={fieldClass} value={img.provider} onChange={e => updateImageGen({ provider: e.target.value as ImageGenConfig['provider'] })}>
                        <option value="openai-images">OpenAI 兼容 Images API (/images/generations)</option>
                        <option value="pollinations">Pollinations 接口 (gen.pollinations.ai)</option>
                      </select>
                    </Field>
                    <Field label="GitHub Secret 环境变量名" hint="免 Key 接口（如 Pollinations 匿名模式）可留空；需要密钥则填 IMAGE_API_KEY。">
                      <input className={fieldClass} value={img.secretName} maxLength={64} onChange={e => updateImageGen({ secretName: e.target.value.toUpperCase() })} placeholder="IMAGE_API_KEY" />
                    </Field>
                  </div>
                  <div className="mt-5 grid gap-5 sm:grid-cols-3">
                    <Field label="生图 API Base URL">
                      <input className={fieldClass} value={img.baseUrl} maxLength={200} onChange={e => updateImageGen({ baseUrl: e.target.value })} placeholder="https://api.siliconflow.cn/v1" />
                    </Field>
                    <Field label="生图模型名称">
                      <input className={fieldClass} value={img.model} maxLength={120} onChange={e => updateImageGen({ model: e.target.value })} placeholder="Kwai-Kolors/Kolors" />
                    </Field>
                    <Field label="图片尺寸（宽x高）">
                      <select className={fieldClass} value={img.size} onChange={e => updateImageGen({ size: e.target.value })}>
                        <option value="1280x720">1280x720（16:9 横幅）</option>
                        <option value="1024x576">1024x576（16:9 轻量）</option>
                        <option value="1024x1024">1024x1024（1:1 通用）</option>
                      </select>
                    </Field>
                  </div>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <Field label="正面画风 Tag（Positive Tags）" hint="希望画面包含的风格（英文逗号分隔），每次会自动与 Gemini 提取的今日画面 Tag 拼接。">
                      <textarea className={fieldClass} rows={3} value={img.baseTags} onChange={e => updateImageGen({ baseTags: e.target.value })} placeholder="anime illustration, clean composition, atmospheric lighting, digital art, high detail" />
                    </Field>
                    <Field label="负面排除 Tag（Negative Tags）" hint="不希望画面出现的元素（如文字、水印、模糊等），兼容接口会自动传给 negative_prompt。">
                      <textarea className={fieldClass} rows={3} value={img.negativeTags ?? ''} onChange={e => updateImageGen({ negativeTags: e.target.value })} placeholder="lowres, bad anatomy, bad hands, text, watermark, signature, blurry" />
                    </Field>
                  </div>
                </Panel>
              </div>;
            })()}
          </>}
        </div>
      </div>
      <footer className="mt-10 flex items-start gap-2 text-[11px] leading-6 text-slate-400"><CircleHelp size={13} className="mt-1 shrink-0" /><p>当前为网站控制台的本地网站目录。设置保存在副本中，线上网站和现有每日任务保持原样。</p></footer>
    </div>
  </section>;
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="rounded-[28px] border border-white/70 bg-white/55 p-6 shadow-sm backdrop-blur-2xl sm:p-8 dark:border-white/10 dark:bg-slate-800/55"><h2 className="text-base font-semibold text-slate-800 dark:text-white">{title}</h2><p className="mb-6 mt-2 text-[11px] leading-6 text-slate-500 dark:text-slate-400">{description}</p>{children}</section>;
}
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>{children}{hint && <span className="mt-2 block text-[11px] leading-5 text-slate-400">{hint}</span>}</label>;
}
function Toggle({ title, description, checked, onChange, disabled, compact }: { title: string; description?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; compact?: boolean }) {
  return <div className={'flex items-center justify-between gap-4 ' + (compact ? 'flex-row-reverse' : '')}><div><p className="text-xs font-medium text-slate-700 dark:text-slate-200">{title}</p>{description && <p className="mt-1 text-[11px] leading-6 text-slate-500 dark:text-slate-400">{description}</p>}</div><button type="button" role="switch" aria-label={title} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}><span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : ''}`} /></button></div>;
}
function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-3xl border border-white/70 bg-white/50 p-6 backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/50"><p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p><p className="mt-3 text-xl font-semibold tracking-tight text-slate-800 dark:text-white">{value}</p><p className="mt-2 text-[11px] text-slate-400">{note}</p></div>;
}
