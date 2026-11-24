from pathlib import Path
import re
import time
from fastapi import APIRouter, Body, UploadFile, File, Form
import httpx

router = APIRouter()

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".bmp"}
MAX_LOCAL_IMAGE_BYTES = 20 * 1024 * 1024  # 20 MB (safely below Cloudflare Pages 25 MiB limit)
MANAGER_ROOT = Path(__file__).resolve().parents[2]
SITE_ROOT = MANAGER_ROOT.parent / "XHBlogs"


@router.post("/test")
async def test_picbed_connection(payload: dict = Body(...)):
    url = payload.get("url", "").strip().rstrip('/')
    token = payload.get("token", "").strip()

    if not url or not token:
        return {"success": False, "message": "图床 API 地址和 Token 不能为空"}

    test_endpoint = f"{url}/api/v1/profile"
    if not token.startswith("Bearer "):
        token = f"Bearer {token}"

    headers = {"Authorization": token, "Accept": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(test_endpoint, headers=headers)
            if response.status_code != 200:
                return {"success": False, "message": f"校验失败，服务器返回了 {response.status_code} 错误"}

            data = response.json()
            if data.get("status") is True:
                user_email = data.get("data", {}).get("email", "未知用户")
                return {"success": True, "message": f"连接成功！当前账户: {user_email}"}
            else:
                return {"success": False, "message": f"Token 无效: {data.get('message', '未知错误')}"}
    except Exception as e:
        return {"success": False, "message": f"网络异常: {str(e)}"}


# 👇 【全新追加】：支持云端图床与本地 public/uploads 双模式上传
@router.post("/upload")
async def upload_image(
        file: UploadFile = File(...),
        url: str = Form(""),
        token: str = Form("")
):
    url = url.strip().rstrip('/')
    token = token.strip()

    try:
        content = await file.read()
    except Exception as e:
        return {"success": False, "message": f"读取文件失败: {str(e)}"}

    if not token:
        if len(content) > MAX_LOCAL_IMAGE_BYTES:
            return {"success": False, "message": "图片超过 20MB 限制，请压缩后再上传"}

        raw_name = Path(file.filename or "image.png").name
        ext = Path(raw_name).suffix.lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            return {"success": False, "message": f"不支持的图片格式: {ext or '未知'}"}

        safe_stem = re.sub(r"[^a-zA-Z0-9_-]", "_", Path(raw_name).stem).strip("_") or "img"
        saved_name = f"{int(time.time() * 1000)}_{safe_stem[:40]}{ext}"

        try:
            manager_upload_dir = MANAGER_ROOT / "public" / "uploads"
            manager_upload_dir.mkdir(parents=True, exist_ok=True)
            (manager_upload_dir / saved_name).write_bytes(content)

            if SITE_ROOT.is_dir():
                site_upload_dir = SITE_ROOT / "public" / "uploads"
                site_upload_dir.mkdir(parents=True, exist_ok=True)
                (site_upload_dir / saved_name).write_bytes(content)

            return {"success": True, "message": "已保存至本地目录", "url": f"/uploads/{saved_name}"}
        except Exception as e:
            return {"success": False, "message": f"本地保存失败: {str(e)}"}

    if not token.startswith("Bearer "):
        token = f"Bearer {token}"

    upload_endpoint = f"{url}/api/v1/upload"
    headers = {
        "Authorization": token,
        "Accept": "application/json"
    }

    try:
        # 封装为 httpx 支持的文件上传格式
        files = {'file': (file.filename, content, file.content_type)}

        # 上传图片可能较慢，将超时设置为 30 秒
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(upload_endpoint, headers=headers, files=files)

            if response.status_code != 200:
                return {"success": False, "message": f"上传失败，图床返回了 {response.status_code} 错误"}

            data = response.json()
            # 兼容 Lsky Pro 的返回格式
            if data.get("status") is True:
                img_url = data.get("data", {}).get("links", {}).get("url")
                return {"success": True, "message": "上传成功", "url": img_url}
            else:
                return {"success": False, "message": f"图床拒绝接收: {data.get('message', '未知')}"}
    except httpx.ReadTimeout:
        return {"success": False, "message": "图片上传超时，请检查网络或图片是否过大"}
    except Exception as e:
        return {"success": False, "message": f"服务器异常: {str(e)}"}