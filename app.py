"""
招聘台账 - Flask 后端服务
网页拖拽上传简历，自动解析并展示台账
支持 ngrok 内网穿透，可将公网链接分享给朋友访问
"""
import os
import sys
import json
import hashlib
import tempfile
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, render_template

from resume_parser import parse_resume

# 修复 Windows 终端 emoji 编码问题
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ==================== 配置 ====================
BASE_DIR = Path(__file__).parent
DATA_FILE = BASE_DIR / "data.json"
UPLOAD_DIR = BASE_DIR / "uploads"
DEBUG_DIR = BASE_DIR / "debug"

# 确保上传临时目录存在
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Flask 上传大小限制（50MB）
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024


@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}

# ngrok 公网地址（启动后自动设置）
PUBLIC_URL = None


# ==================== 数据管理 ====================
def load_data() -> list:
    """加载已有台账数据"""
    if DATA_FILE.exists():
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data
        except:
            pass
    return []


def save_data(data: list):
    """保存台账数据"""
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def migrate_data():
    """存量数据迁移：为旧记录补充 gender/city/skills 字段，尝试从 debug 文件回填"""
    data = load_data()
    if not data:
        return

    modified = False
    for item in data:
        needs_gender = "gender" not in item
        needs_city = "city" not in item
        needs_skills = "skills" not in item

        if not (needs_gender or needs_city or needs_skills):
            continue

        # 补充默认值
        if needs_gender:
            item["gender"] = ""
        if needs_city:
            item["city"] = ""
        if needs_skills:
            item["skills"] = []

        # 尝试从 debug 文本文件回填 gender 和 city
        filename = item.get("filename", "")
        debug_file = DEBUG_DIR / f"{filename}.txt"
        if debug_file.exists() and (needs_gender or needs_city):
            try:
                with open(debug_file, "r", encoding="utf-8") as f:
                    debug_text = f.read()
                from resume_parser import _extract_gender, _extract_city
                if needs_gender:
                    g = _extract_gender(debug_text)
                    if g:
                        item["gender"] = g
                if needs_city:
                    c = _extract_city(debug_text)
                    if c:
                        item["city"] = c
            except Exception:
                pass

        modified = True

    if modified:
        save_data(data)
        print(f"[MIGRATE] 已为 {len(data)} 条记录补充新字段")


def save_data(data: list):
    """保存台账数据"""
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def bytes_hash(data: bytes) -> str:
    """计算字节数据 MD5（用于去重）"""
    return hashlib.md5(data).hexdigest()


def process_resume_bytes(filename: str, content: bytes, category: str = "", position: str = "") -> dict:
    """
    处理上传的简历文件（字节数据），返回结果或 None。
    会自动保存临时文件 → 解析 → 去重入库 → 清理临时文件。
    """
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return None

    # 计算哈希去重
    fhash = bytes_hash(content)

    data = load_data()

    # 检查是否已存在
    for item in data:
        if item.get("hash") == fhash:
            print(f"[SKIP] 已存在: {filename}")
            return {"status": "duplicate", "name": item.get("name", "")}

    # 保存临时文件用于解析
    tmp_path = None
    keep_file = False  # 失败时保留文件供调试
    try:
        with tempfile.NamedTemporaryFile(
            suffix=ext, dir=str(UPLOAD_DIR), delete=False
        ) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        # 解析简历
        print(f"[PROCESS] 解析: {filename}")
        result = parse_resume(tmp_path)
        if not result:
            print(f"[SKIP] 无法解析: {filename}，临时文件: {tmp_path}")
            print(f"        可用命令测试: python resume_parser.py {tmp_path}")
            keep_file = True  # 保留文件供调试
            return None

        # 构建台账条目
        entry = {
            "id": len(data) + 1,
            "category": category or "",
            "position": position or "",
            "name": result.get("name", "未知"),
            "age": result.get("age", "未知"),
            "gender": result.get("gender", ""),
            "education": result.get("education", "未知"),
            "city": result.get("city", ""),
            "work_experiences": result.get("work_experiences", []),
            "phone": result.get("phone", ""),
            "email": result.get("email", ""),
            "skills": [],
            "note": "",  # 沟通记录
            "filename": filename,
            "hash": fhash,
            "add_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

        data.append(entry)
        save_data(data)
        print(f"[ADDED] 序号 {entry['id']}: {entry['name']}")
        return {"status": "ok", "entry": entry}

    except Exception as e:
        print(f"[ERROR] 解析失败 {filename}: {e}")
        import traceback
        traceback.print_exc()
        keep_file = True
        return None
    finally:
        # 清理临时文件（调试模式保留失败文件）
        if tmp_path and os.path.exists(tmp_path) and not keep_file:
            try:
                os.remove(tmp_path)
            except:
                pass


# ==================== API 路由 ====================
@app.route("/")
def index():
    """主页面"""
    return render_template("index.html")


@app.route("/api/ledger")
def api_ledger():
    """获取台账数据"""
    data = load_data()
    return jsonify(data)


@app.route("/api/upload", methods=["POST"])
def api_upload():
    """
    上传简历文件（支持单文件和批量上传）
    返回每条文件的处理结果
    """
    if "files" not in request.files:
        return jsonify({"status": "error", "message": "未找到文件"}), 400

    files = request.files.getlist("files")
    if not files:
        return jsonify({"status": "error", "message": "未选择文件"}), 400

    # 从表单中获取分类和岗位
    category = request.form.get("category", "")
    position = request.form.get("position", "")

    results = []
    for file in files:
        if not file or not file.filename:
            continue
        filename = file.filename
        content = file.read()
        if not content:
            continue

        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            results.append({
                "filename": filename,
                "status": "unsupported",
                "message": "不支持的文件格式，请上传 PDF / Word / TXT"
            })
            continue

        r = process_resume_bytes(filename, content, category, position)
        if r is None:
            results.append({
                "filename": filename,
                "status": "failed",
                "message": "无法解析简历内容"
            })
        else:
            results.append(r)

    return jsonify({
        "status": "ok",
        "results": results,
        "total": len(data := load_data())
    })


@app.route("/api/delete/<int:entry_id>", methods=["DELETE"])
def api_delete(entry_id):
    """删除某条记录"""
    data = load_data()
    data = [item for item in data if item["id"] != entry_id]
    # 重新编号
    for i, item in enumerate(data):
        item["id"] = i + 1
    save_data(data)
    return jsonify({"status": "ok"})


@app.route("/api/edit/<int:entry_id>", methods=["PUT"])
def api_edit(entry_id):
    """手动编辑某条记录"""
    data = load_data()
    body = request.get_json()
    editable_fields = [
        "name", "age", "gender", "education", "city",
        "category", "position", "phone", "email", "skills", "note",
        "work_experiences",
    ]
    for item in data:
        if item["id"] == entry_id:
            for field in editable_fields:
                if field in body:
                    item[field] = body[field]
            break
    save_data(data)
    return jsonify({"status": "ok"})


@app.route("/api/clear", methods=["POST"])
def api_clear():
    """清空所有台账数据"""
    save_data([])
    return jsonify({"status": "ok", "message": "已清空"})


@app.route("/api/info")
def api_info():
    """返回服务信息（含公网地址）"""
    data = load_data()
    return jsonify({
        "count": len(data),
        "public_url": PUBLIC_URL,
        "local_url": "http://127.0.0.1:5000",
    })


# ==================== 内网穿透 ====================
def find_ssh():
    """查找系统 SSH 客户端路径"""
    import shutil
    ssh = shutil.which("ssh")
    return ssh


def start_ssh_tunnel(port=5000, timeout=25):
    """
    通过免费 SSH 隧道服务暴露本地端口（无需注册）。
    依次尝试多个服务，返回 (public_url, subprocess) 或 (None, None)。
    """
    import subprocess
    import threading
    import re

    services = [
        {
            "name": "localhost.run",
            "args": [
                "ssh", "-o", "StrictHostKeyChecking=no",
                "-o", "ServerAliveInterval=30",
                "-o", "ConnectTimeout=10",
                "-R", f"80:localhost:{port}", "nokey@localhost.run",
            ],
            "pattern": r"https?://[a-zA-Z0-9-]+\.lhr\.life",
        },
        {
            "name": "serveo.net",
            "args": [
                "ssh", "-o", "StrictHostKeyChecking=no",
                "-o", "ServerAliveInterval=30",
                "-o", "ConnectTimeout=10",
                "-R", f"80:localhost:{port}", "serveo.net",
            ],
            "pattern": r"https?://[a-zA-Z0-9-]+\.serveo\.net",
        },
        {
            "name": "pinggy.io",
            "args": [
                "ssh", "-o", "StrictHostKeyChecking=no",
                "-o", "ServerAliveInterval=30",
                "-o", "ConnectTimeout=10",
                "-R", f"0:localhost:{port}", "a.pinggy.io",
            ],
            "pattern": r"https?://[a-zA-Z0-9-]+\.pinggy\.link",
        },
    ]

    result_url = [None]
    result_proc = [None]

    for svc in services:
        print(f"[TUNNEL] 尝试 {svc['name']} ...")
        try:
            proc = subprocess.Popen(
                svc["args"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                creationflags=(
                    subprocess.CREATE_NO_WINDOW
                    if os.name == "nt"
                    else 0
                ),
            )
        except FileNotFoundError:
            print(f"[TUNNEL] SSH 命令不可用")
            return None, None
        except Exception as e:
            print(f"[TUNNEL] 启动失败: {e}")
            continue

        # 在后台线程读取输出并匹配 URL
        url_found = threading.Event()

        def _read_output():
            try:
                for line in iter(proc.stdout.readline, ""):
                    if not line:
                        break
                    line = line.strip()
                    if line:
                        print(f"[TUNNEL:{svc['name']}] {line}")
                    match = re.search(svc["pattern"], line)
                    if match:
                        result_url[0] = match.group(0)
                        url_found.set()
                        break
            except Exception:
                pass

        t = threading.Thread(target=_read_output, daemon=True)
        t.start()

        if url_found.wait(timeout=timeout):
            if result_url[0]:
                result_proc[0] = proc
                print(f"[TUNNEL] ✅ {svc['name']} 连接成功!")
                print(f"[TUNNEL] 公网地址: {result_url[0]}")
                return result_url[0], proc

        # 超时，杀掉进程换下一个
        proc.kill()
        proc.wait()
        print(f"[TUNNEL] {svc['name']} 连接超时，尝试下一个...")

    return None, None


def start_tunnel(port=5000):
    """自动选择最佳内网穿透方式"""
    # 方式1: ngrok（如果有 token）
    ngrok_token = os.environ.get("NGROK_AUTH_TOKEN", "")
    if ngrok_token:
        try:
            from pyngrok import ngrok, conf
            conf.get_default().auth_token = ngrok_token
            tunnel = ngrok.connect(port, "http")
            url = tunnel.public_url
            print(f"[TUNNEL] ✅ ngrok 公网地址: {url}")
            return url, ("ngrok", tunnel)
        except Exception as e:
            print(f"[TUNNEL] ngrok 失败: {e}")

    # 方式2: SSH 隧道（无需注册）
    ssh = find_ssh()
    if ssh:
        url, proc = start_ssh_tunnel(port)
        if url:
            return url, ("ssh", proc)
    else:
        print("[TUNNEL] 未找到 SSH 客户端")

    print("[TUNNEL] 所有穿透方式均失败，仅本地可访问")
    return None, None


# ==================== 启动 ====================
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="招聘台账")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--no-tunnel", action="store_true", help="跳过内网穿透")
    args = parser.parse_args()

    # 云端部署：优先使用环境变量 $PORT
    port = args.port or int(os.environ.get("PORT", 5000))
    is_cloud = bool(os.environ.get("RENDER") or os.environ.get("PORT"))

    print("=" * 50)
    print("  招聘台账系统  v2.4")
    print("  拖拽上传简历，自动识别")
    print("=" * 50)

    # 存量数据迁移
    migrate_data()

    if is_cloud:
        print(f"\n[WEB] 云端模式，端口: {port}")
    elif args.no_tunnel:
        print("\n[WEB] 跳过内网穿透（--no-tunnel）")
    else:
        # 本地启动：尝试内网穿透
        PUBLIC_URL, _tunnel_info = start_tunnel(port)
        if not PUBLIC_URL:
            print("\n[提示] 内网穿透未启动，仅限本机访问")
        else:
            print(f"\n[WEB] 公网地址: {PUBLIC_URL}")
    print(f"[WEB] 本地地址: http://127.0.0.1:{port}")
    print("[WEB] 按 Ctrl+C 停止服务\n")

    app.run(host=args.host, port=port, debug=False, use_reloader=False)
