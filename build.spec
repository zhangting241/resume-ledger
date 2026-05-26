# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller 打包配置
生成单文件桌面应用 (Windows .exe / Mac .app)
"""

import sys
from pathlib import Path

# 项目根目录（SPECPATH 由 PyInstaller 提供）
BASE = Path(SPECPATH)

a = Analysis(
    # 入口：启动器脚本
    [str(BASE / "launcher.py")],
    pathex=[str(BASE)],
    binaries=[],
    datas=[
        # Flask 模板和静态资源
        (str(BASE / "templates"), "templates"),
        (str(BASE / "static"), "static"),
        # 简历解析模块
        (str(BASE / "resume_parser.py"), "."),
        # 数据文件（空文件占位，实际数据在用户目录）
        (str(BASE / "data.json"), "."),
    ],
    hiddenimports=[
        # Flask 依赖
        "flask",
        "flask.json",
        "werkzeug",
        "jinja2",
        "jinja2.ext",
        "markupsafe",
        "itsdangerous",
        "click",
        "blinker",
        # pdfplumber 相关
        "pdfplumber",
        "pdfminer",
        "pdfminer.pdfparser",
        "pdfminer.pdfdocument",
        "pdfminer.pdfpage",
        "pdfminer.pdfinterp",
        "pdfminer.converter",
        "pdfminer.layout",
        "pdfminer.utils",
        "pdfminer.high_level",
        "pdfminer.psparser",
        "pdfminer.cmapdb",
        "pdfminer.encodingdb",
        "pdfminer.glyphlist",
        "pdfminer.image",
        "pdfminer.ccitt",
        "pdfminer.lzw",
        "pdfminer.runlength",
        "pdfminer.jbig2",
        "pdfminer.jpeg",
        "chardet",
        "cryptography",
        # python-docx 依赖
        "docx",
        "lxml",
        "lxml.etree",
        "lxml._elementpath",
        # 其他
        "PIL",
        "urllib3",
        "certifi",
        "charset_normalizer",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "unittest",
        "test",
        "pytest",
        "setuptools",
        "distutils",
        "pip",
        "wheel",
        "pkg_resources",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

# Windows / Mac 分别处理
if sys.platform == "darwin":
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.zipfiles,
        a.datas,
        [],
        name="招聘台账",
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        upx_exclude=[],
        runtime_tmpdir=None,
        console=True,           # 显示控制台窗口（查看日志用）
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
        icon=None,              # 如有 ico/icns 可指定
    )
    app_bundle = BUNDLE(
        exe,
        name="招聘台账.app",
        icon=None,
        bundle_identifier="com.resume.ledger",
        info_plist={
            "NSHighResolutionCapable": "True",
            "CFBundleName": "招聘台账",
            "CFBundleDisplayName": "招聘台账",
            "CFBundleShortVersionString": "2.4",
            "CFBundleVersion": "2.4.0",
        },
    )
else:
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.zipfiles,
        a.datas,
        [],
        name="招聘台账",
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        upx_exclude=[],
        runtime_tmpdir=None,
        console=True,           # Windows 也显示控制台
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
        icon=None,
    )
