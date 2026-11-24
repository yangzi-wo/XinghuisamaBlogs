#!/usr/bin/env python3
"""每日选刊自动抓取与生成脚本（纯标准库实现，兼容 Gemini 与 OpenAI 兼容接口）。"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE_DATA = ROOT / "YZBlogs" / "data"
CONFIG_PATH = SITE_DATA / "briefingConfig.json"
LATEST_PATH = SITE_DATA / "dailyBriefing.json"
ARCHIVE_PATH = SITE_DATA / "dailyBriefingArchive.json"

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


def fetch_candidates(now: dt.datetime, preferred_sources: list[str] | None = None, excluded_keywords: list[str] | None = None) -> list[dict]:
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

    for url, source_name, topic, limit in rss_sources:
        try:
            raw = http_get(url)
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
        f"今天是 {date_str}。请从以下候选资讯中挑选最多 {max_items} 条（建议 4 到 {max_items} 条）最有价值的内容，组成今天的「每日选刊」。\n"
        f"输出语言要求：标题、摘要、要点与点评均使用 {lang_label}。\n"
        f"要求尽量覆盖用户关注的主题：{topic_desc}。{extra_text}\n"
        f"可用栏目 category 只能从以下 id 中选择：{channel_desc}（一般快讯/新番/开源热门用 news，技术深度文章/论文用 reading）。\n"
        f"必须返回严格 JSON，格式如下：\n"
        "{\n"
        '  "notice": "一句话导语（15-30字，概括今日看点）",\n'
        '  "items": [\n'
        "    {\n"
        '      "category": "news 或 reading",\n'
        '      "title": "中文标题（简洁准确）",\n'
        '      "originalTitle": "原标题",\n'
        '      "source": "来源名称",\n'
        '      "sourceOrg": "机构/社区名称",\n'
        '      "sourceDate": "YYYY-MM-DD",\n'
        '      "url": "原文链接（必须完全来自候选列表，不可编造）",\n'
        '      "tags": ["从关注主题中匹配1-2个标签"],\n'
        '      "summary": "中文摘要（60-120字，通俗易懂）",\n'
        '      "highlights": ["要点1", "要点2"],\n'
        '      "readingNote": "一句话编辑点评或阅读建议"\n'
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

    candidates = fetch_candidates(now, preferred_sources=preferred_sources, excluded_keywords=excluded_keywords)
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

    # 若存在旧一期有效数据且不是今天，归档到 dailyBriefingArchive.json
    if LATEST_PATH.is_file():
        prev = json.loads(LATEST_PATH.read_text(encoding="utf-8"))
        prev_date = prev.get("edition", {}).get("date", "")
        if prev.get("items") and prev_date and prev_date != "1970.01.01" and prev_date != today_dot:
            archive = json.loads(ARCHIVE_PATH.read_text(encoding="utf-8")) if ARCHIVE_PATH.is_file() else {"windowDays": 90, "asOfDate": today_dot, "issues": []}
            existing_dates = {iss.get("edition", {}).get("date") for iss in archive.get("issues", [])}
            if prev_date not in existing_dates:
                archive.setdefault("issues", []).insert(0, prev)
                archive["issues"] = archive["issues"][:90]
            archive["asOfDate"] = today_dot
            ARCHIVE_PATH.write_text(json.dumps(archive, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        elif ARCHIVE_PATH.is_file():
            archive = json.loads(ARCHIVE_PATH.read_text(encoding="utf-8"))
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
