from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src-tauri" / "icons" / "icon.png"
TARGET = ROOT / "store-assets"


def canvas(size: tuple[int, int], icon_size: int, output: str) -> None:
    background = Image.new("RGBA", size, "#0f172a")
    icon = Image.open(SOURCE).convert("RGBA").resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    background.alpha_composite(icon, ((size[0] - icon_size) // 2, (size[1] - icon_size) // 2))
    background.convert("RGB").save(TARGET / output, optimize=True)


TARGET.mkdir(parents=True, exist_ok=True)
canvas((620, 300), 220, "SplashScreen.png")
canvas((310, 150), 112, "Wide310x150Logo.png")
canvas((1240, 600), 420, "StoreHero.png")
print(TARGET)
