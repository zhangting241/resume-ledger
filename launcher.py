"""
招聘台账 - 桌面应用启动器
双击启动 Flask 服务并自动打开浏览器，不再依赖 SSH 隧道
"""
import os
import sys
import threading
import webbrowser
from pathlib import Path

# ── 路径处理（PyInstaller 打包兼容）──
if getattr(sys, "frozen", False):
    # 打包后的路径
    APP_DIR = Path(sys._MEIPASS)
    # 可写数据目录：放在 exe 同目录下
    USER_DIR = Path(sys.executable).parent
else:
    APP_DIR = Path(__file__).parent
    USER_DIR = APP_DIR

# 将 APP_DIR 加入 sys.path（确保 resume_parser 可导入）
sys.path.insert(0, str(APP_DIR))

# ── 设置数据文件路径 ──
DATA_FILE = USER_DIR / "data.json"
UPLOAD_DIR = USER_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ── 启动前信息 ──
print("=" * 50)
print("  招聘台账桌面版  v2.4")
print("  拖拽简历 → 自动解析 → 分类管理")
print("=" * 50)
print(f"  数据目录: {USER_DIR}")
print(f"  本地地址: http://127.0.0.1:5000")
print()

# ── 导入 Flask app ──
# 覆写 app.py 中的路径变量
import app as _app_module
_app_module.BASE_DIR = APP_DIR
_app_module.DATA_FILE = DATA_FILE
_app_module.UPLOAD_DIR = UPLOAD_DIR
_app_module.PUBLIC_URL = None  # 桌面版不使用公网隧道

# 如果 data.json 不存在则创建空文件
if not DATA_FILE.exists():
    DATA_FILE.write_text("[]", encoding="utf-8")

from app import app

# ── 启动 Flask（后台线程）──
def run_flask():
    """在后台线程运行 Flask"""
    app.run(
        host="127.0.0.1",       # 仅本地访问，安全
        port=5000,
        debug=False,
        use_reloader=False,
    )

flask_thread = threading.Thread(target=run_flask, daemon=True)
flask_thread.start()

# ── 等待 Flask 就绪后打开浏览器 ──
import time
import urllib.request

print("  正在启动服务...", end="", flush=True)
for _ in range(30):
    try:
        urllib.request.urlopen("http://127.0.0.1:5000", timeout=1)
        print(" 就绪!")
        break
    except Exception:
        time.sleep(0.5)
else:
    print("\n  [警告] 服务启动超时，请手动访问 http://127.0.0.1:5000")

# 打开默认浏览器
webbrowser.open("http://127.0.0.1:5000")

print()
print("  已在浏览器中打开！关闭此窗口将停止服务。")
print("  数据保存在: " + str(DATA_FILE))
print("  按 Ctrl+C 或关闭窗口退出...")
print()

# ── 保持运行 ──
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("\n  服务已停止，再见！")
