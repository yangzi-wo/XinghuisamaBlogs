from pathlib import Path
import re
import time
from typing import Optional
from fastapi import APIRouter, File, Form, UploadFile
import requests

router = APIRouter()

MANAGER_ROOT = Path(__file__).resolve().parents[2]
SITE_ROOT = MANAGER_ROOT.parent / "YZBlogs"

ALLOWED_AUDIO_EXT = {".mp3", ".m4a", ".ogg", ".wav", ".flac", ".aac"}
ALLOWED_LRC_EXT = {".lrc", ".txt"}
ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"}
MAX_AUDIO_BYTES = 20 * 1024 * 1024  # 20 MB (Cloudflare Pages 25 MiB limit)


def _save_to_music_dirs(filename: str, content: bytes):
    mgr_dir = MANAGER_ROOT / "public" / "music"
    mgr_dir.mkdir(parents=True, exist_ok=True)
    (mgr_dir / filename).write_bytes(content)

    if SITE_ROOT.is_dir():
        site_dir = SITE_ROOT / "public" / "music"
        site_dir.mkdir(parents=True, exist_ok=True)
        (site_dir / filename).write_bytes(content)


def _safe_filename(prefix: int, raw_name: str, fallback_stem: str, ext: str) -> str:
    stem = re.sub(r"[^a-zA-Z0-9_-]", "_", Path(raw_name).stem).strip("_") or fallback_stem
    return f"{prefix}_{stem[:40]}{ext}"


@router.post("/upload-local")
async def upload_local_music(
    audio: UploadFile = File(...),
    lrc: Optional[UploadFile] = File(None),
    cover: Optional[UploadFile] = File(None),
    title: str = Form(""),
    artist: str = Form(""),
):
    """上传本地音频、LRC歌词与封面至 public/music/"""
    try:
        audio_bytes = await audio.read()
        if len(audio_bytes) > MAX_AUDIO_BYTES:
            return {"success": False, "message": "音频文件超过 20MB 限制，请压缩或转为 MP3 后上传"}

        raw_audio = Path(audio.filename or "track.mp3").name
        audio_ext = Path(raw_audio).suffix.lower()
        if audio_ext not in ALLOWED_AUDIO_EXT:
            return {"success": False, "message": f"不支持的音频格式: {audio_ext or '未知'}"}

        ts = int(time.time() * 1000)
        audio_filename = _safe_filename(ts, raw_audio, "track", audio_ext)
        _save_to_music_dirs(audio_filename, audio_bytes)

        lrc_url = ""
        if lrc is not None and lrc.filename:
            lrc_bytes = await lrc.read()
            if len(lrc_bytes) > 1024 * 1024:
                return {"success": False, "message": "歌词文件超过 1MB 限制"}
            raw_lrc = Path(lrc.filename).name
            lrc_ext = Path(raw_lrc).suffix.lower()
            if lrc_ext not in ALLOWED_LRC_EXT:
                return {"success": False, "message": "歌词仅支持 .lrc 或 .txt 文件"}
            lrc_filename = _safe_filename(ts, raw_lrc, "lyric", lrc_ext)
            _save_to_music_dirs(lrc_filename, lrc_bytes)
            lrc_url = f"/music/{lrc_filename}"

        cover_url = "/avatar.jpg"
        if cover is not None and cover.filename:
            cover_bytes = await cover.read()
            if len(cover_bytes) > 10 * 1024 * 1024:
                return {"success": False, "message": "封面图片超过 10MB 限制"}
            raw_cover = Path(cover.filename).name
            cover_ext = Path(raw_cover).suffix.lower()
            if cover_ext not in ALLOWED_IMAGE_EXT:
                return {"success": False, "message": f"不支持的封面格式: {cover_ext or '未知'}"}
            cover_filename = _safe_filename(ts, raw_cover, "cover", cover_ext)
            _save_to_music_dirs(cover_filename, cover_bytes)
            cover_url = f"/music/{cover_filename}"

        final_title = title.strip() or Path(raw_audio).stem
        final_artist = artist.strip() or "未知歌手"

        return {
            "success": True,
            "message": "✅ 本地音乐保存成功！",
            "track": {
                "id": f"local_{ts}",
                "title": final_title,
                "artist": final_artist,
                "src": f"/music/{audio_filename}",
                "cover": cover_url,
                "lrcUrl": lrc_url,
            },
        }
    except Exception as e:
        return {"success": False, "message": f"保存失败: {str(e)}"}


@router.get("/query/{song_id}")
def query_netease_music(song_id: str):
    """通过网易云公开接口查询歌曲详情（保留兼容）"""
    try:
        api_url = f"https://music.163.com/api/song/detail/?id={song_id}&ids=[{song_id}]"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Referer": "https://music.163.com/",
        }
        response = requests.get(api_url, headers=headers, timeout=5)
        data = response.json()

        if data.get("songs") and len(data["songs"]) > 0:
            song = data["songs"][0]
            return {
                "success": True,
                "data": {
                    "id": song_id,
                    "name": song["name"],
                    "artist": song["artists"][0]["name"],
                    "album": song["album"]["name"],
                    "cover": song["album"]["picUrl"],
                },
            }
        return {"success": False, "message": "未找到该歌曲，可能是 VIP 歌曲或 ID 错误"}
    except Exception as e:
        return {"success": False, "message": f"后端请求失败: {str(e)}"}
