"""把一张 1024+ 的方形图切成 iOS 离线工程需要的整套图标。

为什么要把产物提交进仓库而不是 CI 里现算：
GitHub 的 macOS runner 默认没有 Pillow，装它要么慢要么脆；
图标是构建输入、不是构建产物，切成静态文件进仓库最省事也最可复现。

产出：
  ci/appicon/AppIcon.appiconset/    ← 覆盖 SDK 里空着的 AppIcon 资源目录
  ci/appicon/legacy/                ← 覆盖 SDK 的 icon/icon*.png（模板里若有脚本引用）

用法：python scripts/make_ios_icons.py icon.png
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "ci" / "appicon"

# 经典完整图标集（Xcode 各版本都认，不依赖 Xcode 14+ 的单尺寸能力）
SPECS = [
    # (idiom, size, scale, px)
    ("iphone", "20x20", "2x", 40),
    ("iphone", "20x20", "3x", 60),
    ("iphone", "29x29", "2x", 58),
    ("iphone", "29x29", "3x", 87),
    ("iphone", "40x40", "2x", 80),
    ("iphone", "40x40", "3x", 120),
    ("iphone", "60x60", "2x", 120),
    ("iphone", "60x60", "3x", 180),
    ("ipad", "20x20", "1x", 20),
    ("ipad", "20x20", "2x", 40),
    ("ipad", "29x29", "1x", 29),
    ("ipad", "29x29", "2x", 58),
    ("ipad", "40x40", "1x", 40),
    ("ipad", "40x40", "2x", 80),
    ("ipad", "76x76", "1x", 76),
    ("ipad", "76x76", "2x", 152),
    ("ipad", "83.5x83.5", "2x", 167),
    ("ios-marketing", "1024x1024", "1x", 1024),
]

# SDK 模板自带的 icon/ 文件名 → 像素尺寸
LEGACY = [100, 1024, 114, 120, 144, 152, 180, 29, 40, 50, 57, 58, 60, 72, 76, 80, 87]


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "icon.png")
    if not src.exists():
        sys.exit(f"找不到源图: {src}")

    master = Image.open(src).convert("RGB")
    if min(master.size) < 1024:
        sys.exit(f"源图太小（{master.size}），至少需要 1024×1024")

    # 1) Asset Catalog
    assetset = OUT / "AppIcon.appiconset"
    assetset.mkdir(parents=True, exist_ok=True)
    images = []
    for idiom, size, scale, px in SPECS:
        name = f"icon-{px}.png"
        master.resize((px, px), Image.LANCZOS).save(assetset / name, "PNG", optimize=True)
        images.append({"filename": name, "idiom": idiom, "scale": scale, "size": size})
    (assetset / "Contents.json").write_text(
        json.dumps({"images": images, "info": {"author": "xcode", "version": 1}}, indent=2) + "\n",
        encoding="utf-8",
    )

    # 2) 旧式 icon/ 目录（模板里若有脚本按文件名取图，这里也一并覆盖）
    legacy = OUT / "legacy"
    legacy.mkdir(parents=True, exist_ok=True)
    for px in LEGACY:
        master.resize((px, px), Image.LANCZOS).save(legacy / f"icon{px}.png", "PNG", optimize=True)

    total = len(SPECS) + len(LEGACY)
    print(f"生成 {total} 个文件 → {OUT}")
    print(f"  图标集 {len(SPECS)} 个，legacy {len(LEGACY)} 个")


if __name__ == "__main__":
    main()
