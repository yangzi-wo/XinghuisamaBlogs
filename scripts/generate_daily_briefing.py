#!/usr/bin/env python3
"""每日选刊自动抓取与生成脚本（纯标准库实现，兼容 Gemini 与 OpenAI 兼容接口）。"""

from __future__ import annotations

import base64
import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE_DATA = ROOT / "YZBlogs" / "data"
CONFIG_PATH = SITE_DATA / "briefingConfig.json"
LATEST_PATH = SITE_DATA / "dailyBriefing.json"
ARCHIVE_PATH = SITE_DATA / "dailyBriefingArchive.json"
COVERS_PATH = SITE_DATA / "dailyBriefingCovers.json"
COVERS_DIR = ROOT / "YZBlogs" / "public" / "images" / "briefing"

USER_AGENT = "XinghuisamaBlogs-BriefingBot/1.0 (+https://github.com/yangzi-wo/XinghuisamaBlogs)"
WEEKDAYS_ZH = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]


def beijing_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))


def http_get(url: str, timeout: int = 15, headers: dict[str, str] | None = None) -> bytes:
    req_headers = {"User-Agent": USER_AGENT, **(headers or {})}
    req = urllib.request.Request(url, headers=req_headers, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def http_post_json(url: str, payload: dict, headers: dict[str, str] | None = None, timeout: int = 60, retries: int = 3) -> dict:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req_headers = {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        **(headers or {}),
    }
    last_exc: Exception | None = None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers=req_headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            last_exc = RuntimeError(f"HTTP {exc.code} 调用模型失败: {detail[:400]}")
            if exc.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                wait_sec = 3 * (attempt + 1)
                print(f"[warn] 接口返回 HTTP {exc.code}，{wait_sec}s 后重试 ({attempt + 1}/{retries})...", file=sys.stderr)
                time.sleep(wait_sec)
                continue
            raise last_exc from exc
        except urllib.error.URLError as exc:
            last_exc = RuntimeError(f"网络请求失败: {exc}")
            if attempt < retries - 1:
                wait_sec = 3 * (attempt + 1)
                print(f"[warn] 网络异常，{wait_sec}s 后重试 ({attempt + 1}/{retries})...", file=sys.stderr)
                time.sleep(wait_sec)
                continue
            raise last_exc from exc
    raise last_exc or RuntimeError("未知请求错误")


def strip_html(text: str) -> str:
    cleaned = re.sub(r"<[^>]+>", " ", text or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:260]


def normalize_dot_date(raw: str | None, fallback: str) -> str:
    text = (raw or "").strip()[:10].replace("-", ".").replace("/", ".")
    if re.fullmatch(r"\d{4}\.\d{2}\.\d{2}", text):
        try:
            dt.datetime.strptime(text, "%Y.%m.%d")
            return text if text <= fallback else fallback
        except ValueError:
            pass
    return fallback


def parse_rss_or_atom(raw: bytes, source_name: str, topic_hint: str, limit: int = 6) -> list[dict]:
    items: list[dict] = []
    root = ET.fromstring(raw)
    ns = {"atom": "http://www.w3.org/2005/Atom"}

    # RSS 2.0
    channel_items = root.findall("./channel/item")
    if channel_items:
        for entry in channel_items[:limit]:
            title = (entry.findtext("title") or "").strip()
            link = (entry.findtext("link") or "").strip()
            desc = strip_html(entry.findtext("description") or "")
            pub = (entry.findtext("pubDate") or "").strip()
            if title and link:
                items.append({
                    "title": title,
                    "url": link,
                    "summary": desc,
                    "source": source_name,
                    "topic": topic_hint,
                    "date": pub[:16],
                })
        return items

    # Atom
    atom_entries = root.findall("atom:entry", ns) or root.findall("entry")
    for entry in atom_entries[:limit]:
        title = (entry.findtext("atom:title", default="", namespaces=ns) or entry.findtext("title") or "").strip()
        link_el = entry.find("atom:link", ns) or entry.find("link")
        link = (link_el.attrib.get("href", "") if link_el is not None else "").strip()
        desc = strip_html(
            entry.findtext("atom:summary", default="", namespaces=ns)
            or entry.findtext("atom:content", default="", namespaces=ns)
            or entry.findtext("summary")
            or ""
        )
        pub = (entry.findtext("atom:updated", default="", namespaces=ns) or entry.findtext("updated") or "").strip()
        if title and link:
            items.append({
                "title": title,
                "url": link,
                "summary": desc,
                "source": source_name,
                "topic": topic_hint,
                "date": pub[:10],
            })
    return items


def _norm_item_url(url: str) -> str:
    clean = (url or "").strip()
    if not clean:
        return ""
    return clean.split("#", 1)[0].rstrip("/").lower()


def load_recent_published_urls(today_dot: str, lookback_issues: int = 14) -> set[str]:
    """收集最近若干期已发布过的原文链接，避免次日重复抓取同一热点。"""
    urls: set[str] = set()
    issues: list[dict] = []
    if LATEST_PATH.is_file():
        try:
            issues.append(json.loads(LATEST_PATH.read_text(encoding="utf-8")))
        except Exception:
            pass
    if ARCHIVE_PATH.is_file():
        try:
            arch = json.loads(ARCHIVE_PATH.read_text(encoding="utf-8"))
            issues.extend((arch.get("issues") or [])[:lookback_issues])
        except Exception:
            pass
    for iss in issues:
        if iss.get("edition", {}).get("date") == today_dot:
            continue
        for item in iss.get("items") or []:
            norm = _norm_item_url(item.get("url") or "")
            if norm:
                urls.add(norm)
    return urls


def fetch_candidates(
    now: dt.datetime,
    preferred_sources: list[str] | None = None,
    excluded_keywords: list[str] | None = None,
    recent_urls: set[str] | None = None,
) -> list[dict]:
    candidates: list[dict] = []
    rss_sources = [
        ("https://blog.cloudflare.com/rss/", "Cloudflare Blog", "网络技术", 5),
        ("https://hnrss.org/frontpage?count=10", "Hacker News", "网络与AI", 6),
        ("https://simonwillison.net/atom/everything/", "Simon Willison", "AI大模型", 5),
        ("https://www.animenewsnetwork.com/all/rss.xml?ann-edition=us", "Anime News Network", "ACGN", 5),
    ]
    for src in preferred_sources or []:
        if src.startswith("http://") or src.startswith("https://"):
            rss_sources.insert(0, (src, src.split("/")[2], "偏好来源", 6))

    seen_urls: set[str] = set()
    for url, source_name, topic, limit in rss_sources:
        norm_url = url.split("?")[0].rstrip("/")
        if norm_url in seen_urls:
            continue
        seen_urls.add(norm_url)
        try:
            raw = http_get(
                url,
                headers={"Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"},
            )
            candidates.extend(parse_rss_or_atom(raw, source_name, topic, limit))
        except Exception as exc:
            print(f"[warn] RSS 抓取失败 ({source_name}): {exc}", file=sys.stderr)

    # Hugging Face Daily Papers (AI 大模型论文)
    try:
        papers = json.loads(http_get("https://huggingface.co/api/daily_papers?limit=6").decode("utf-8"))
        for entry in papers[:5]:
            paper = entry.get("paper") or {}
            pid = paper.get("id")
            title = (paper.get("title") or "").strip()
            if pid and title:
                candidates.append({
                    "title": title,
                    "url": f"https://huggingface.co/papers/{pid}",
                    "summary": strip_html(paper.get("summary") or ""),
                    "source": "Hugging Face Papers",
                    "topic": "AI大模型",
                    "date": now.strftime("%Y-%m-%d"),
                })
    except Exception as exc:
        print(f"[warn] Hugging Face Papers 抓取失败: {exc}", file=sys.stderr)

    # GitHub 近期热门开源项目
    try:
        since = (now - dt.timedelta(days=7)).strftime("%Y-%m-%d")
        gh_url = f"https://api.github.com/search/repositories?q=created:>{since}&sort=stars&order=desc&per_page=6"
        gh = json.loads(http_get(gh_url).decode("utf-8"))
        for repo in (gh.get("items") or [])[:5]:
            candidates.append({
                "title": f"{repo.get('full_name')} (★{repo.get('stargazers_count', 0)})",
                "url": repo.get("html_url"),
                "summary": strip_html(repo.get("description") or "GitHub 近期热门开源项目"),
                "source": "GitHub Trending",
                "topic": "GitHub开源热门",
                "date": (repo.get("created_at") or "")[:10],
            })
    except Exception as exc:
        print(f"[warn] GitHub 热门抓取失败: {exc}", file=sys.stderr)

    # Bangumi 近期放送 ACGN 参考
    try:
        bgm = json.loads(http_get("https://api.bgm.tv/calendar").decode("utf-8"))
        today_idx = now.isoweekday()
        for day_block in bgm:
            if day_block.get("weekday", {}).get("id") == today_idx:
                for item in (day_block.get("items") or [])[:3]:
                    name = item.get("name_cn") or item.get("name")
                    if name and item.get("url"):
                        candidates.append({
                            "title": f"今日放送新番: {name}",
                            "url": item.get("url"),
                            "summary": f"Bangumi 今日更新放送动画作品，原名 {item.get('name', name)}",
                            "source": "Bangumi 番组计划",
                            "topic": "ACGN",
                            "date": now.strftime("%Y-%m-%d"),
                        })
    except Exception as exc:
        print(f"[warn] Bangumi 抓取失败: {exc}", file=sys.stderr)

    excluded = [k.strip().lower() for k in (excluded_keywords or []) if k.strip()]
    if excluded:
        candidates = [
            item for item in candidates
            if not any(kw in f"{item.get('title', '')} {item.get('summary', '')}".lower() for kw in excluded)
        ]

    if recent_urls:
        fresh = [item for item in candidates if _norm_item_url(item.get("url") or "") not in recent_urls]
        if len(fresh) >= 6:
            candidates = fresh

    return candidates


def extract_json_object(text: str) -> dict:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


def call_model(ai_cfg: dict, api_key: str, prompt: str) -> dict:
    provider = ai_cfg.get("provider", "gemini")
    base_url = (ai_cfg.get("baseUrl") or "").rstrip("/")
    model = ai_cfg.get("model") or "gemini-3.8-flash"

    if provider == "gemini":
        if not base_url:
            base_url = "https://generativelanguage.googleapis.com"
        fallback_models = [model] + [
            m for m in ("gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite") if m != model
        ]
        last_err: Exception | None = None
        for idx, candidate_model in enumerate(fallback_models):
            endpoint = f"{base_url}/v1beta/models/{candidate_model}:generateContent?key={api_key}"
            try:
                if idx > 0:
                    print(f"[info] 尝试自动降级到备选模型 {candidate_model}...", file=sys.stderr)
                resp = http_post_json(
                    endpoint,
                    {
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.3},
                    },
                )
                raw_text = resp["candidates"][0]["content"]["parts"][0]["text"]
                return extract_json_object(raw_text)
            except Exception as exc:
                last_err = exc
                print(f"[warn] 模型 {candidate_model} 调用失败: {exc}", file=sys.stderr)
        raise last_err or RuntimeError("所有 Gemini 模型均调用失败")

    if provider == "openai":
        if not base_url:
            base_url = "https://api.siliconflow.cn/v1"
        endpoint = f"{base_url}/chat/completions"
        resp = http_post_json(
            endpoint,
            {
                "model": model,
                "messages": [
                    {"role": "system", "content": "你是一个专业的技术与二次元资讯编辑，只输出合法的 JSON 对象，不要输出任何额外说明。"},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,
            },
            headers={"Authorization": f"Bearer {api_key}"},
        )
        raw_text = resp["choices"][0]["message"]["content"]
        return extract_json_object(raw_text)

    raise ValueError(f"不支持的 provider: {provider}")


def build_prompt(
    candidates: list[dict],
    topics: list[str],
    channels: list[dict],
    date_str: str,
    *,
    language: str = "zh-CN",
    min_items: int = 4,
    max_items: int = 6,
    preferred_sources: list[str] | None = None,
    excluded_keywords: list[str] | None = None,
) -> str:
    channel_desc = ", ".join(f"{c['id']}({c['name']})" for c in channels)
    topic_desc = "、".join(topics) if topics else "AI大模型、ACGN、GitHub开源热门、网络技术"
    lang_map = {"zh-CN": "简体中文", "en-US": "English", "ja-JP": "日本語"}
    lang_label = lang_map.get(language, "简体中文")
    extra_rules = []
    if preferred_sources:
        extra_rules.append(f"优先考虑以下偏好来源：{'、'.join(preferred_sources)}。")
    if excluded_keywords:
        extra_rules.append(f"严禁收录包含以下关键词的内容：{'、'.join(excluded_keywords)}。")
    extra_text = ("\n" + "\n".join(extra_rules)) if extra_rules else ""
    return (
        f"今天是 {date_str}。请从以下候选资讯中挑选 {min_items} 到 {max_items} 条（至少 {min_items} 条、最多 {max_items} 条）最有价值的内容，组成今天的「每日选刊」。\n"
        f"输出语言要求：标题、摘要、要点与点评均使用 {lang_label}。\n"
        f"要求尽量覆盖用户关注的主题：{topic_desc}。{extra_text}\n"
        f"可用栏目 category 只能从以下 id 中选择：{channel_desc}。\n"
        f"【重要】必须为上述每一个已启用的栏目都分配至少 1 条内容（建议尽量均匀分配，例如 {len(channels)} 个栏目共 {max_items} 条时尽量平均分配），绝不允许任何已启用的栏目出现 0 条！\n"
        f"必须返回严格 JSON，格式如下：\n"
        "{\n"
        '  "notice": "一句话导语（15-30字，概括今日看点）",\n'
        '  "coverTags": "根据今日选刊热点，为画面中的白发龙娘看板娘设计3-6个英文现实世界场景、动作与道具Tag（不要重复人物外貌）",\n'
        '  "items": [\n'
        "    {\n"
        f'      "category": "只能填 {channel_desc} 中的 id之一",\n'
        '      "title": "中文标题（简洁准确）",\n'
        '      "originalTitle": "原标题",\n'
        '      "source": "来源名称",\n'
        '      "sourceOrg": "机构/社区名称",\n'
        '      "sourceDate": "YYYY-MM-DD",\n'
        '      "url": "原文链接（必须完全来自候选列表，不可编造）",\n'
        '      "tags": ["从关注主题中匹配1-2个标签"],\n'
        '      "summary": "中文摘要（60-120字，通俗易懂）",\n'
        '      "highlights": ["要点1", "要点2"],\n'
        '      "readingNote": "一句话编辑点评或阅读建议",\n'
        '      "coverTags": "为本条资讯专属设计的3-5个英文画面Tag（逗号分隔，不要重复龙娘外貌）：1. 背景必须贴合本条资讯的真实/现实场景（如AI/开源用现代电脑桌/机房/咖啡馆笔记本，时政用城市街景/新闻厅，游戏/ACGN用电竞房/街头/客厅主机）；2. 若本条是ACGN或游戏新闻且提到了具体角色，请务必在Tag中加入该角色英文名与龙娘同框互动（例如 alongside <Character Name> from <Work>）"\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        f"候选列表：\n{json.dumps(candidates, ensure_ascii=False, indent=2)}"
    )


def should_run_on_schedule(config: dict, now: dt.datetime) -> tuple[bool, str]:
    force = "--force" in sys.argv[1:] or os.environ.get("GITHUB_EVENT_NAME", "") != "schedule"
    if force:
        return True, "手动或强制模式，立即执行"
    sched = config.get("schedule") or {}
    if not sched.get("enabled", True):
        return False, "云端定时更新已关闭，跳过本次调度"
    preferred = str(sched.get("preferredTime") or "08:00").strip()
    try:
        pref_hour = int(preferred.split(":", 1)[0])
    except ValueError:
        pref_hour = 8
    today_dot = now.strftime("%Y.%m.%d")
    if LATEST_PATH.is_file():
        try:
            latest = json.loads(LATEST_PATH.read_text(encoding="utf-8"))
            if latest.get("edition", {}).get("date") == today_dot and latest.get("items"):
                return False, f"今日 ({today_dot}) 选刊已生成，跳过重复执行"
        except Exception:
            pass
    if now.hour < pref_hour:
        return False, f"当前北京时间 {now.strftime('%H:%M')} 未到设定时间 {preferred}，跳过"
    return True, f"已到设定时间 {preferred}，开始执行每日选刊"


def main() -> int:
    if not CONFIG_PATH.is_file():
        print("找不到 briefingConfig.json，跳过执行。")
        return 0

    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if not config.get("display", {}).get("enabled", False):
        print("每日选刊首页展示已关闭，跳过生成。")
        return 0

    now = beijing_now()
    can_run, reason = should_run_on_schedule(config, now)
    print(reason)
    if not can_run:
        return 0

    ai_cfg = config.get("aiProvider") or {
        "provider": "gemini",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "model": "gemini-3.8-flash",
        "secretName": "GEMINI_API_KEY",
    }
    secret_name = ai_cfg.get("secretName") or "GEMINI_API_KEY"
    api_key = (os.environ.get(secret_name) or "").strip()
    if not api_key:
        print(f"未检测到环境变量 {secret_name}，请在 GitHub Repository Secrets 中配置后重试。", file=sys.stderr)
        return 1

    today_dot = now.strftime("%Y.%m.%d")
    today_iso = now.strftime("%Y-%m-%d")
    weekday_zh = WEEKDAYS_ZH[now.weekday()]

    selection = config.get("selection") or {}
    topics = selection.get("topics") or config.get("topics") or ["AI大模型", "ACGN", "GitHub开源热门", "网络技术"]
    excluded_keywords = selection.get("excludedKeywords") or []
    preferred_sources = selection.get("preferredSources") or []
    language = selection.get("language") or "zh-CN"
    max_items = max(1, min(20, int(selection.get("maxItems") or 6)))
    min_items = max(1, min(max_items, int(selection.get("minItems") or 4)))

    recent_urls = load_recent_published_urls(today_dot)
    candidates = fetch_candidates(now, preferred_sources=preferred_sources, excluded_keywords=excluded_keywords, recent_urls=recent_urls)
    if not candidates:
        print("未能抓取到任何候选资讯，跳过更新。", file=sys.stderr)
        return 1

    channels = [c for c in config.get("channels", []) if c.get("enabled")]
    if not channels:
        channels = [{"id": "news", "name": "动态精选"}, {"id": "reading", "name": "深度阅读"}]

    prompt = build_prompt(
        candidates,
        topics,
        channels,
        today_iso,
        language=language,
        min_items=min_items,
        max_items=max_items,
        preferred_sources=preferred_sources,
        excluded_keywords=excluded_keywords,
    )

    print(f"正在调用 {ai_cfg.get('provider')} ({ai_cfg.get('model')}) 生成 {today_dot} 每日选刊...")
    generated = call_model(ai_cfg, api_key, prompt)
    raw_items = generated.get("items") or []
    if not raw_items:
        raise RuntimeError("模型未返回有效的 items 列表")

    valid_channel_ids = {c["id"] for c in channels}
    normalized_items = []
    for idx, item in enumerate(raw_items[:max_items], start=1):
        url = (item.get("url") or "").strip()
        if not url.startswith("http"):
            continue
        cat = item.get("category") if item.get("category") in valid_channel_ids else channels[0]["id"]
        digest = hashlib.sha1(f"{today_dot}:{url}".encode("utf-8")).hexdigest()[:8]
        normalized_items.append({
            "id": f"brief-{now.strftime('%Y%m%d')}-{idx}-{digest}",
            "category": cat,
            "title": (item.get("title") or "未命名资讯").strip(),
            "originalTitle": (item.get("originalTitle") or item.get("title") or "").strip(),
            "source": (item.get("source") or "Web").strip(),
            "sourceOrg": (item.get("sourceOrg") or item.get("source") or "Community").strip(),
            "sourceDate": normalize_dot_date(item.get("sourceDate"), today_dot),
            "url": url,
            "tags": [str(t).strip() for t in (item.get("tags") or topics[:1]) if str(t).strip()][:3],
            "summary": (item.get("summary") or "").strip(),
            "highlights": [str(h).strip() for h in (item.get("highlights") or []) if str(h).strip()][:4],
            "readingNote": (item.get("readingNote") or "").strip(),
            "verifiedAt": today_dot,
            "verificationUrls": [url],
        })

    if not normalized_items:
        raise RuntimeError("清洗后无有效条目")

    # 兜底均衡：保证每个已启用的栏目至少有 1 条内容
    if len(normalized_items) >= len(channels):
        counts = {c["id"]: 0 for c in channels}
        for it in normalized_items:
            counts[it["category"]] = counts.get(it["category"], 0) + 1
        for cid in [c["id"] for c in channels]:
            if counts.get(cid, 0) == 0:
                donor_cid = max(counts, key=lambda k: counts[k])
                if counts[donor_cid] > 1:
                    for it in reversed(normalized_items):
                        if it["category"] == donor_cid:
                            it["category"] = cid
                            counts[donor_cid] -= 1
                            counts[cid] = 1
                            break

    # 为每条简报生成专属 AI 封面图（第 1 条同时作为当日顶部轮播封面）
    image_cfg = config.get("imageGen") or {}
    if image_cfg.get("enabled"):
        first_cover_meta: dict | None = None
        for idx, (item, raw_item) in enumerate(zip(normalized_items, raw_items[:max_items]), start=1):
            item_tags = str(raw_item.get("coverTags") or generated.get("coverTags") or "").strip()
            cover_res = generate_single_cover(image_cfg, f"{today_iso}-{idx}", item_tags)
            if cover_res:
                item["cover"] = cover_res["src"]
                if first_cover_meta is None:
                    first_cover_meta = {
                        "src": cover_res["src"],
                        "alt": f"{today_dot} 每日选刊封面",
                        "theme": item_tags[:120],
                        "model": cover_res["model"],
                        "sha256": cover_res["sha256"],
                        "sourceSha256": cover_res["sha256"],
                    }
        if first_cover_meta:
            covers_doc = json.loads(COVERS_PATH.read_text(encoding="utf-8")) if COVERS_PATH.is_file() else {"version": 1, "covers": {}}
            covers_map = covers_doc.setdefault("covers", {})
            covers_map[today_dot] = first_cover_meta
            COVERS_PATH.write_text(json.dumps(covers_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # 若存在旧一期有效数据且不是今天，归档到 dailyBriefingArchive.json
    if LATEST_PATH.is_file():
        prev = json.loads(LATEST_PATH.read_text(encoding="utf-8"))
        prev_date = prev.get("edition", {}).get("date", "")
        if prev.get("items") and prev_date and prev_date != "1970.01.01" and prev_date != today_dot:
            archive = json.loads(ARCHIVE_PATH.read_text(encoding="utf-8")) if ARCHIVE_PATH.is_file() else {"windowDays": 30, "asOfDate": today_dot, "issues": []}
            existing_dates = {iss.get("edition", {}).get("date") for iss in archive.get("issues", [])}
            if prev_date not in existing_dates:
                archive.setdefault("issues", []).insert(0, prev)
            archive["windowDays"] = 30
            archive["asOfDate"] = today_dot
            ARCHIVE_PATH.write_text(json.dumps(archive, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        elif ARCHIVE_PATH.is_file():
            archive = json.loads(ARCHIVE_PATH.read_text(encoding="utf-8"))
            archive["windowDays"] = 30
            archive["asOfDate"] = today_dot
            ARCHIVE_PATH.write_text(json.dumps(archive, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    new_issue = {
        "edition": {
            "date": today_dot,
            "weekday": weekday_zh,
            "label": config.get("display", {}).get("title", "每日选刊"),
            "notice": (generated.get("notice") or "今日精选已送达，点击卡片即可展开阅读。").strip(),
        },
        "items": normalized_items,
    }
    LATEST_PATH.write_text(json.dumps(new_issue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"成功生成 {today_dot} 每日选刊，共 {len(normalized_items)} 条。")

    # 自动清理超过 30 天的归档简报与本地封面图片
    cleanup_old_briefings(now, retention_days=30)

    return 0


def cleanup_old_briefings(now: dt.datetime, retention_days: int = 30) -> None:
    cutoff_date = (now - dt.timedelta(days=retention_days)).date()

    def parse_dot_date(val: str) -> dt.date | None:
        try:
            return dt.datetime.strptime(val.strip()[:10], "%Y.%m.%d").date()
        except Exception:
            return None

    if ARCHIVE_PATH.is_file():
        try:
            archive = json.loads(ARCHIVE_PATH.read_text(encoding="utf-8"))
            kept_issues = []
            for iss in archive.get("issues", []):
                d = parse_dot_date(iss.get("edition", {}).get("date", ""))
                if d is None or d >= cutoff_date:
                    kept_issues.append(iss)
            archive["windowDays"] = retention_days
            archive["issues"] = kept_issues
            ARCHIVE_PATH.write_text(json.dumps(archive, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        except Exception as exc:
            print(f"[warn] 清理旧归档失败: {exc}", file=sys.stderr)

    if COVERS_PATH.is_file():
        try:
            covers_doc = json.loads(COVERS_PATH.read_text(encoding="utf-8"))
            covers_map = covers_doc.get("covers") or {}
            covers_doc["covers"] = {
                k: v for k, v in covers_map.items()
                if (parse_dot_date(k) is None or parse_dot_date(k) >= cutoff_date)
            }
            COVERS_PATH.write_text(json.dumps(covers_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        except Exception as exc:
            print(f"[warn] 清理旧封面索引失败: {exc}", file=sys.stderr)

    if COVERS_DIR.is_dir():
        for img_file in COVERS_DIR.iterdir():
            if not img_file.is_file():
                continue
            m = re.match(r"^(\d{4}-\d{2}-\d{2})", img_file.name)
            if m:
                try:
                    file_date = dt.datetime.strptime(m.group(1), "%Y-%m-%d").date()
                    if file_date < cutoff_date:
                        img_file.unlink(missing_ok=True)
                        print(f"[cleanup] 已删除超过 {retention_days} 天的旧封面: {img_file.name}")
                except Exception:
                    pass


def generate_single_cover(image_cfg: dict, filename_stem: str, cover_tags: str) -> dict | None:
    provider = image_cfg.get("provider") or "openai-images"
    base_url = (image_cfg.get("baseUrl") or "").rstrip("/")
    model = image_cfg.get("model") or "Kwai-Kolors/Kolors"
    secret_name = (image_cfg.get("secretName") or "").strip()
    api_key = (os.environ.get(secret_name) or "").strip() if secret_name else ""
    base_tags = (image_cfg.get("baseTags") or "").strip()
    negative_tags = (image_cfg.get("negativeTags") or "").strip()
    size = (image_cfg.get("size") or "1280x720").strip()

    prompt_parts = [p for p in (base_tags, cover_tags.strip()) if p]
    full_prompt = ", ".join(prompt_parts) or "anime illustration, peaceful digital reading corner, soft light, no text"
    if provider == "openai-images" and secret_name and not api_key:
        print(f"[warn] 未检测到生图密钥环境变量 {secret_name}，跳过 AI 封面生成。", file=sys.stderr)
        return

    try:
        img_bytes: bytes | None = None
        ext = "jpg"
        if provider == "openai-images":
            endpoint = f"{base_url}/images/generations"
            payload: dict = {"model": model, "prompt": full_prompt, "size": size, "n": 1}
            if "volces.com" in base_url:
                payload["watermark"] = False
            if negative_tags:
                payload["negative_prompt"] = negative_tags
            headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
            try:
                resp = http_post_json(endpoint, payload, headers=headers, timeout=90, retries=2)
            except RuntimeError as exc:
                if "HTTP 400" in str(exc):
                    payload.pop("negative_prompt", None)
                    if "volces.com" in base_url and payload.get("size") == "1280x720":
                        payload["size"] = "2K"
                    resp = http_post_json(endpoint, payload, headers=headers, timeout=90, retries=2)
                else:
                    raise
            first = (resp.get("data") or [{}])[0]
            if first.get("b64_json"):
                img_bytes = base64.b64decode(first["b64_json"])
                ext = "png"
            elif first.get("url"):
                img_bytes = http_get(first["url"], timeout=60)
                if ".png" in first["url"].lower():
                    ext = "png"
        elif provider == "pollinations":
            w, _, h = size.partition("x")
            encoded = urllib.parse.quote(full_prompt, safe="")
            query_obj: dict[str, str] = {"model": model, "width": w or "1280", "height": h or "720", "nologo": "true"}
            if negative_tags:
                query_obj["negative_prompt"] = negative_tags
            params = urllib.parse.urlencode(query_obj)
            url = f"{base_url or 'https://gen.pollinations.ai'}/image/{encoded}?{params}"
            headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
            img_bytes = http_get(url, timeout=90, headers=headers)
        else:
            print(f"[warn] 不支持的生图 provider: {provider}", file=sys.stderr)
            return

        if not img_bytes or len(img_bytes) < 1024:
            print("[warn] 生图返回内容过小或为空，已保留默认封面。", file=sys.stderr)
            return

        COVERS_DIR.mkdir(parents=True, exist_ok=True)
        filename = f"{filename_stem}.{ext}"
        target = COVERS_DIR / filename
        target.write_bytes(img_bytes)

        sha = hashlib.sha256(img_bytes).hexdigest()
        src = f"/images/briefing/{filename}"
        print(f"成功生成 AI 封面: {src}")
        return {"src": src, "sha256": sha, "model": model}
    except Exception as exc:
        print(f"[warn] AI 封面生成失败 ({filename_stem})，已自动跳过: {exc}", file=sys.stderr)
        return None


if __name__ == "__main__":
    raise SystemExit(main())
