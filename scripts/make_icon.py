"""生成「渡己」App 图标（1024×1024 PNG + 各端常用尺寸）。

为什么用代码而不是 AI 生图：
1. 图标要能复现——改个颜色重新跑一次就行，AI 生图做不到像素级稳定；
2. iOS/Android 对图标有明确规范（不得透明、不得圆角、色彩空间 sRGB），代码可控；
3. 不额外消耗生图额度。

设计取意：深色底 + 一道门（穿过这道门 = 入口页那句文案）+「渡」字。
颜色沿用站点强调色 Action Blue #0066cc，暗底 #0b0b0d 与 App 深色主题一致。
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SIZE = 1024
BG = (11, 11, 13)
ACCENT = (76, 154, 255)       # #4c9aff（深色主题里的强调色，暗底上更亮）
ACCENT_DEEP = (0, 102, 204)   # #0066cc
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"

OUT = Path(__file__).resolve().parents[1] / "src" / "static"


def rounded_gate(draw: ImageDraw.ImageDraw, scale: float = 1.0) -> None:
    """门形：上半圆拱 + 两条竖线，一笔构成「入口」的意象。"""
    cx, cy = SIZE / 2, SIZE * 0.34
    r = 300 * scale
    stroke = int(22 * scale)
    # 拱
    draw.arc(
        [cx - r, cy - r, cx + r, cy + r],
        start=180,
        end=360,
        fill=(*ACCENT, 150),
        width=stroke,
    )
    # 两竖
    draw.line([(cx - r, cy), (cx - r, cy + r * 1.05)], fill=(*ACCENT, 150), width=stroke)
    draw.line([(cx + r, cy), (cx + r, cy + r * 1.05)], fill=(*ACCENT, 150), width=stroke)


def build() -> Image.Image:
    img = Image.new("RGB", (SIZE, SIZE), BG)

    # 背景：中心偏上的一团极淡蓝光，避免大面积死黑
    glow = Image.new("RGB", (SIZE, SIZE), BG)
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse(
        [SIZE * 0.12, SIZE * 0.02, SIZE * 0.88, SIZE * 0.78],
        fill=(18, 34, 58),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(140))
    img = Image.blend(img, glow, 0.9)

    # 门（在文字后面，作为底纹）
    gate_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rounded_gate(ImageDraw.Draw(gate_layer), scale=1.0)
    gate_layer = gate_layer.filter(ImageFilter.GaussianBlur(1.2))
    img = Image.alpha_composite(img.convert("RGBA"), gate_layer).convert("RGB")

    # 「渡」字
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_BOLD, 360)
    text = "渡"
    box = draw.textbbox((0, 0), text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    tx = (SIZE - tw) / 2 - box[0]
    ty = SIZE * 0.60 - th / 2 - box[1]

    # 字后加一层柔光合，让字从暗底里「浮」出来
    halo = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(halo).text((tx, ty), text, font=font, fill=(*ACCENT_DEEP, 160))
    halo = halo.filter(ImageFilter.GaussianBlur(38))
    img = Image.alpha_composite(img.convert("RGBA"), halo).convert("RGB")

    ImageDraw.Draw(img).text((tx, ty), text, font=font, fill=(245, 248, 255))

    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    icon = build()
    master = OUT / "appicon-1024.png"
    # iOS 图标不允许带 alpha 通道，统一存 RGB
    icon.save(master, "PNG", optimize=True)
    print("written", master)

    # 常用尺寸（Android 各密度 + iOS 主屏），HBuilderX 的「自动生成所有图标」也能从 1024 切
    for side in (180, 192, 144, 96, 72, 48):
        icon.resize((side, side), Image.LANCZOS).save(
            OUT / f"appicon-{side}.png", "PNG", optimize=True
        )
    print("sizes done")


if __name__ == "__main__":
    main()
