import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def load_font(font_file: str | None, font_size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = []
    if font_file:
      candidates.append(font_file)
    candidates.extend(
        [
            "/System/Library/Fonts/Supplemental/PingFang.ttc",
            "/System/Library/Fonts/Supplemental/Hiragino Sans GB.ttc",
            "/System/Library/Fonts/Supplemental/Songti.ttc",
            "/Library/Fonts/Arial Unicode.ttf",
        ]
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, font_size)
        except Exception:
            continue
    return ImageFont.load_default()


def text_width(draw: ImageDraw.ImageDraw, text: str, font, stroke_width: int) -> int:
    if not text:
        return 0
    left, _top, right, _bottom = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
    return max(0, right - left)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int, stroke_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        paragraph = paragraph.strip()
        if not paragraph:
            if lines:
                lines.append("")
            continue
        current = ""
        for char in paragraph:
            probe = f"{current}{char}"
            if not current or text_width(draw, probe, font, stroke_width) <= max_width:
                current = probe
                continue
            lines.append(current)
            current = char
        if current:
            lines.append(current)
    return lines or [text.strip() or ""]


def render_item(draw_config: dict, item: dict, font) -> None:
    width = int(draw_config["width"])
    height = int(draw_config["height"])
    max_text_width = int(draw_config["maxTextWidth"])
    stroke_width = 2

    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    lines = wrap_text(draw, str(item["text"]), font, max_text_width, stroke_width)
    text = "\n".join(lines)
    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=10, align="center", stroke_width=stroke_width)
    text_w = max(0, bbox[2] - bbox[0])
    text_h = max(0, bbox[3] - bbox[1])
    padding_x = 28
    padding_y = 18
    box_left = max(0, (width - text_w) // 2 - padding_x)
    box_top = max(0, (height - text_h) // 2 - padding_y)
    box_right = min(width, box_left + text_w + padding_x * 2)
    box_bottom = min(height, box_top + text_h + padding_y * 2)
    draw.rounded_rectangle((box_left, box_top, box_right, box_bottom), radius=18, fill=(0, 0, 0, 160))
    x = (width - text_w) // 2
    y = (height - text_h) // 2
    draw.multiline_text(
        (x, y),
        text,
        font=font,
        fill=(255, 255, 255, 255),
        spacing=10,
        align="center",
        stroke_width=stroke_width,
        stroke_fill=(0, 0, 0, 220),
    )
    output_path = Path(item["outputPath"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, format="PNG")


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: render-subtitle-overlays.py <config.json>")
    config_path = Path(sys.argv[1])
    config = json.loads(config_path.read_text("utf-8"))
    font = load_font(config.get("fontFile"), int(config.get("fontSize", 40)))
    for item in config.get("items", []):
        render_item(config, item, font)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
