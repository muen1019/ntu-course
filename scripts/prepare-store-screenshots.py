from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "screenshot"
OUTPUT_DIR = ROOT / "store-assets" / "screenshots"
PROMO_DIR = ROOT / "store-assets" / "promo"
ICON_PATH = ROOT / "icons" / "icon-128.png"

CANVAS_SIZE = (1280, 800)
HEADER_HEIGHT = 112
CONTENT_BOX = (32, 136, 1248, 772)
NAVY = "#1B3154"
INDIGO = "#3E63B6"
PAGE_BACKGROUND = "#EEF2F8"
MUTED_TEXT = "#DDE7FA"

SCREENSHOTS = (
    {
        "source": "螢幕擷取畫面 2026-09-06 163245.png",
        "output": "01-priority-order.png",
        "title": "拖曳排序，跨裝置同步",
        "subtitle": "在臺大課程網直接安排志願序",
    },
    {
        "source": "螢幕擷取畫面 2026-08-31 142030.png",
        "output": "02-second-stage-import.png",
        "title": "二階選課，一眼掌握",
        "subtitle": "查看名額、登記狀態與可選課程",
    },
    {
        "source": "螢幕擷取畫面 2026-08-19 173139.png",
        "output": "03-confirm-import.png",
        "title": "確認差異後，再送出",
        "subtitle": "清楚列出操作與風險，不在背景自動執行",
        "crop": (0, 430, 1714, 1501),
    },
)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = (
        Path("C:/Windows/Fonts/msjhbd.ttc") if bold else Path("C:/Windows/Fonts/msjh.ttc"),
        Path("C:/Windows/Fonts/msjhl.ttc"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def contain(image: Image.Image, width: int, height: int) -> Image.Image:
    scale = min(width / image.width, height / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.resize(size, Image.Resampling.LANCZOS)


def rounded_image(image: Image.Image, radius: int = 14) -> Image.Image:
    image = image.convert("RGBA")
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, image.width, image.height), radius=radius, fill=255)
    image.putalpha(mask)
    return image


def render_screenshot(spec: dict[str, object]) -> Path:
    source_path = SOURCE_DIR / str(spec["source"])
    if not source_path.exists():
        raise FileNotFoundError(f"Missing source screenshot: {source_path}")

    screenshot = Image.open(source_path).convert("RGB")
    crop = spec.get("crop")
    if crop:
        screenshot = screenshot.crop(crop)

    canvas = Image.new("RGB", CANVAS_SIZE, PAGE_BACKGROUND)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, CANVAS_SIZE[0], HEADER_HEIGHT), fill=NAVY)
    draw.rectangle((0, HEADER_HEIGHT - 5, CANVAS_SIZE[0], HEADER_HEIGHT), fill=INDIGO)

    icon = Image.open(ICON_PATH).convert("RGBA").resize((72, 72), Image.Resampling.LANCZOS)
    canvas.paste(icon, (32, 20), icon)
    draw.text((120, 20), str(spec["title"]), font=load_font(34, bold=True), fill="white")
    draw.text((122, 65), str(spec["subtitle"]), font=load_font(19), fill=MUTED_TEXT)

    left, top, right, bottom = CONTENT_BOX
    fitted = rounded_image(contain(screenshot, right - left, bottom - top))
    x = left + (right - left - fitted.width) // 2
    y = top + (bottom - top - fitted.height) // 2

    shadow = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (x - 6, y - 4, x + fitted.width + 6, y + fitted.height + 10),
        radius=18,
        fill=(27, 49, 84, 52),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow)
    canvas.alpha_composite(fitted, (x, y))

    output_path = OUTPUT_DIR / str(spec["output"])
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output_path, format="PNG", optimize=True)
    return output_path


def render_small_promo() -> Path:
    width, height = 440, 280
    canvas = Image.new("RGB", (width, height), NAVY)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((-70, 176, 300, 350), radius=86, fill="#294A84")
    draw.rounded_rectangle((248, -80, 520, 114), radius=88, fill=INDIGO)
    draw.ellipse((320, 176, 480, 336), fill="#294A84")

    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((116, 38, 324, 246), fill=(111, 144, 222, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(32))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), glow)

    icon = Image.open(ICON_PATH).convert("RGBA").resize((184, 184), Image.Resampling.LANCZOS)
    canvas.alpha_composite(icon, ((width - icon.width) // 2, (height - icon.height) // 2))

    PROMO_DIR.mkdir(parents=True, exist_ok=True)
    output_path = PROMO_DIR / "small-promo-440x280.png"
    canvas.convert("RGB").save(output_path, format="PNG", optimize=True)
    return output_path


if __name__ == "__main__":
    for screenshot_spec in SCREENSHOTS:
        result = render_screenshot(screenshot_spec)
        print(f"Created {result.relative_to(ROOT)}")
    promo_result = render_small_promo()
    print(f"Created {promo_result.relative_to(ROOT)}")
