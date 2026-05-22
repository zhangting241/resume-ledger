#!/bin/bash
# ============================================
#  招聘台账 - macOS 打包脚本
#  在 Mac 终端中运行: bash build.sh
# ============================================

set -e
cd "$(dirname "$0")"

echo "============================================"
echo "  招聘台账 - macOS 打包工具"
echo "============================================"
echo ""

echo "[1/3] 安装 PyInstaller..."
pip3 install pyinstaller --quiet || pip install pyinstaller --quiet

echo "[2/3] 安装项目依赖..."
pip3 install -r requirements.txt --quiet || pip install -r requirements.txt --quiet

echo "[3/3] 开始打包（需要 3-8 分钟）..."
echo ""
pyinstaller --clean --noconfirm build.spec

if [ $? -eq 0 ]; then
    echo ""
    echo "============================================"
    echo "  ✅ 打包成功！"
    echo ""
    echo "  应用位置: dist/招聘台账.app"
    echo "  双击「招聘台账.app」即可运行"
    echo ""
    echo "  如需分享给他人，将 .app 压缩成 .zip 即可"
    echo "============================================"
else
    echo ""
    echo "❌ 打包失败，请检查错误信息"
fi
echo ""
