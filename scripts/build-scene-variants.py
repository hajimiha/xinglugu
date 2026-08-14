"""Rebuild geometry-identical day and dusk variants from the checked-in night scenes."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
PIXEL_DIR = ROOT / "src" / "assets" / "pixel"

SCENE_SOURCES = {
    "village-map.webp": "village-map",
    "farm-dusk.webp": "farm",
    "location-atlas.webp": "location-atlas",
    "location-hospital.webp": "location-hospital",
    "location-hunter-camp.webp": "location-hunter-camp",
    "location-library.webp": "location-library",
    "location-mayor-home.webp": "location-mayor-home",
    "location-monster-market.webp": "location-monster-market",
    "location-smithy.webp": "location-smithy",
}


def gamma_lift(source: Image.Image, exponent: float) -> Image.Image:
    table = [round(255 * ((value / 255) ** exponent)) for value in range(256)]
    return source.point(table * 3)


def build_day(source: Image.Image) -> Image.Image:
    """Lift the original pixels into clear daylight without resampling or redrawing."""
    day = gamma_lift(source.convert("RGB"), 0.56)
    day = ImageEnhance.Brightness(day).enhance(1.07)
    day = ImageEnhance.Contrast(day).enhance(0.92)
    day = ImageEnhance.Color(day).enhance(1.08)
    daylight = Image.new("RGB", source.size, (183, 216, 203))
    return Image.blend(day, daylight, 0.055)


def build_dusk(source: Image.Image) -> Image.Image:
    """Warm the original pixels into sunset while retaining every scene edge."""
    dusk = gamma_lift(source.convert("RGB"), 0.78)
    dusk = ImageEnhance.Brightness(dusk).enhance(1.08)
    dusk = ImageEnhance.Contrast(dusk).enhance(0.98)
    dusk = ImageEnhance.Color(dusk).enhance(1.12)
    warm = Image.new("RGB", source.size, (224, 126, 76))
    cool = Image.new("RGB", source.size, (63, 70, 118))
    mask = Image.new("L", (1, source.height))
    mask.putdata([round(108 + (y / max(1, source.height - 1)) * 62) for y in range(source.height)])
    mask = mask.resize(source.size).filter(ImageFilter.GaussianBlur(radius=18))
    light = Image.composite(warm, cool, mask)
    return Image.blend(dusk, light, 0.105)


def main() -> None:
    for source_name, stem in SCENE_SOURCES.items():
        source_path = PIXEL_DIR / source_name
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        with Image.open(source_path) as original:
            source = original.convert("RGB")
            day = build_day(source)
            dusk = build_dusk(source)
            if day.size != source.size or dusk.size != source.size:
                raise RuntimeError(f"Scene geometry changed for {source_name}")
            day.save(PIXEL_DIR / f"{stem}-day.webp", "WEBP", quality=88, method=6)
            dusk_name = "farm-evening.webp" if stem == "farm" else f"{stem}-dusk.webp"
            dusk.save(PIXEL_DIR / dusk_name, "WEBP", quality=88, method=6)
            print(f"rebuilt {stem}: {source.width}x{source.height}")


if __name__ == "__main__":
    main()
