import os
import shutil
import subprocess
from fastapi import APIRouter, Request

router = APIRouter()

# 动态定位 Manager 根目录
CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))

# 需要镜像覆盖的文件夹 (先清空目标，再全量复制)
SYNC_DIRS = ["posts", "chatters", "moments"]
# 需要精确覆盖的单文件
SYNC_FILES = [
    "app/about/about.md",
    "data/albums.ts",
    "data/friends.ts",
    "data/projects.ts",
    "siteConfig.ts"
]


def is_safe_blog_dir(target_path):
    """防呆检测：只有包含 package.json 的才被认为是安全的博客目录"""
    return os.path.exists(os.path.join(target_path, "package.json"))


@router.post("/check")
async def check_blog_path(request: Request):
    """检测目标路径是否合法且具备基本结构"""
    try:
        payload = await request.json()
        target_path = payload.get("blogPath", "").strip()

        if not target_path or not os.path.exists(target_path):
            return {"success": False, "message": "🚫 目标物理路径不存在，请检查输入！"}

        if not is_safe_blog_dir(target_path):
            return {"success": False,
                    "message": "⚠️ 危险！目标路径未检测到 package.json，似乎不是一个有效的前端项目，已拦截操作。"}

        missing = []
        for d in ["posts", "data", "app"]:
            if not os.path.exists(os.path.join(target_path, d)):
                missing.append(d)

        if missing:
            return {"success": True,
                    "message": f"✅ 路径安全。但目标缺失以下文件夹：{', '.join(missing)}。同步时将自动创建。"}

        return {"success": True, "message": "✅ 路径校验通过，目录结构完美！"}
    except Exception as e:
        return {"success": False, "message": f"校验异常: {str(e)}"}


@router.post("/execute")
async def execute_sync(request: Request):
    """执行物理覆盖同步"""
    try:
        payload = await request.json()
        target_path = payload.get("blogPath", "").strip()

        if not is_safe_blog_dir(target_path):
            return {"success": False, "message": "安全拦截：目标路径不合法！"}

        # 1. 同步文件夹 (先彻底删除目标文件夹，再把 Manager 的复制过去)
        for d in SYNC_DIRS:
            src_dir = os.path.join(PROJECT_ROOT, d)
            dst_dir = os.path.join(target_path, d)

            if os.path.exists(src_dir):
                if os.path.exists(dst_dir):
                    shutil.rmtree(dst_dir)
                shutil.copytree(src_dir, dst_dir)

        # 2. 同步单个文件 (直接覆盖或过滤)
        for f in SYNC_FILES:
            src_file = os.path.join(PROJECT_ROOT, f.replace("/", os.sep))
            dst_file = os.path.join(target_path, f.replace("/", os.sep))

            if os.path.exists(src_file):
                os.makedirs(os.path.dirname(dst_file), exist_ok=True)

                # 🌟 核心过滤逻辑：如果是 siteConfig.ts，拦截并剔除敏感信息
                if f == "siteConfig.ts":
                    with open(src_file, "r", encoding="utf-8") as file_in:
                        lines = file_in.readlines()

                    with open(dst_file, "w", encoding="utf-8") as file_out:
                        for line in lines:
                            # 只要这一行包含以下关键词，直接跳过不写入
                            if "picBedName:" in line or "picBedUrl:" in line or "picBedToken:" in line or "图床核心配置" in line:
                                continue
                            file_out.write(line)
                else:
                    # 其他普通文件，直接物理拷贝
                    shutil.copy2(src_file, dst_file)

        # 3. 自动提交并推送到 GitHub（触发 Cloudflare Pages 自动部署）
        git_env = os.environ.copy()
        git_env["GIT_TERMINAL_PROMPT"] = "0"
        repo_root = os.path.dirname(os.path.abspath(target_path))
        if not os.path.exists(os.path.join(repo_root, ".git")):
            repo_root = target_path

        try:
            subprocess.run(["git", "-C", repo_root, "add", "-A"], check=True, env=git_env, timeout=15)
            status_res = subprocess.run(
                ["git", "-C", repo_root, "status", "--porcelain"],
                check=True, capture_output=True, text=True, env=git_env, timeout=15
            )
            if status_res.stdout.strip():
                subprocess.run(
                    ["git", "-C", repo_root, "commit", "-m", "chore: sync content from manager"],
                    check=True, capture_output=True, text=True, env=git_env, timeout=20
                )

            pull_res = subprocess.run(
                ["git", "-C", repo_root, "pull", "--rebase", "--autostash", "origin", "main"],
                capture_output=True, text=True, env=git_env, timeout=30
            )
            if pull_res.returncode != 0:
                subprocess.run(["git", "-C", repo_root, "rebase", "--abort"], capture_output=True, env=git_env, timeout=10)
                err_msg = (pull_res.stderr or pull_res.stdout or "拉取合并冲突").strip()[:100]
                return {"success": True, "message": f"✅ 本地已同步，但拉取云端更新冲突（{err_msg}），请检查或让 AI 处理。"}

            ahead_res = subprocess.run(
                ["git", "-C", repo_root, "rev-list", "--count", "origin/main..HEAD"],
                capture_output=True, text=True, env=git_env, timeout=10
            )
            if ahead_res.returncode == 0 and ahead_res.stdout.strip() == "0":
                return {"success": True, "message": "🎉 本地与云端已同步（无新改动需要推送）"}

            subprocess.run(
                ["git", "-C", repo_root, "push"],
                check=True, capture_output=True, text=True, env=git_env, timeout=45
            )
            return {"success": True, "message": "🎉 已同步并自动推送至 GitHub！Cloudflare 约 1 分钟内自动更新。"}
        except Exception as git_err:
            err_detail = getattr(git_err, "stderr", None) or str(git_err)
            return {"success": True, "message": f"✅ 本地已同步，但自动推送 GitHub 失败（{err_detail.strip()[:80]}），可稍后让 AI 代推。"}
    except Exception as e:
        return {"success": False, "message": f"同步过程中发生致命错误: {str(e)}"}