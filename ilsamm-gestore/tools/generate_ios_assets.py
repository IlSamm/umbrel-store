from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
WEB_ICONS = ROOT / "app" / "frontend" / "assets" / "icons"
IOS_ASSETS = ROOT / "ios" / "App" / "App" / "Assets.xcassets"
MARK_PATH = WEB_ICONS / "gestore-mark.png"
SOURCE_PATH = MARK_PATH if MARK_PATH.exists() else WEB_ICONS / "icon-512.png"


def make_background(size: int) -> Image.Image:
    top = (17, 31, 70)
    bottom = (2, 6, 18)
    strip = Image.new("RGB", (1, size))
    pixels = strip.load()
    for y in range(size):
        t = y / max(1, size - 1)
        pixels[0, y] = tuple(round(top[index] * (1 - t) + bottom[index] * t) for index in range(3))
    background = strip.resize((size, size))

    glow_mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(glow_mask)
    radius = round(size * 0.43)
    center = (size // 2, round(size * 0.39))
    draw.ellipse(
        (center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius),
        fill=120,
    )
    glow_mask = glow_mask.filter(ImageFilter.GaussianBlur(round(size * 0.20)))
    glow = Image.new("RGBA", (size, size), (37, 91, 229, 0))
    glow.putalpha(glow_mask)
    return Image.alpha_composite(background.convert("RGBA"), glow)


def crop_mark(mark: Image.Image) -> Image.Image:
    rgba = mark.convert("RGBA")
    box = rgba.getchannel("A").getbbox()
    return rgba.crop(box) if box else rgba


def place_mark(canvas: Image.Image, mark: Image.Image, width: int, center_y: int) -> None:
    ratio = width / mark.width
    rendered = mark.resize((width, round(mark.height * ratio)), Image.Resampling.LANCZOS)
    x = (canvas.width - rendered.width) // 2
    y = center_y - rendered.height // 2

    alpha = rendered.getchannel("A")
    halo = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    halo_alpha = Image.new("L", canvas.size, 0)
    halo_alpha.paste(alpha, (x, y))
    halo_alpha = halo_alpha.filter(ImageFilter.GaussianBlur(max(12, canvas.width // 42)))
    halo.putalpha(halo_alpha.point(lambda value: round(value * 0.26)))
    blue_halo = Image.new("RGBA", canvas.size, (40, 113, 255, 0))
    blue_halo.putalpha(halo.getchannel("A"))
    canvas.alpha_composite(blue_halo)

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_alpha = Image.new("L", canvas.size, 0)
    shadow_alpha.paste(alpha, (x, y + max(8, canvas.width // 70)))
    shadow_alpha = shadow_alpha.filter(ImageFilter.GaussianBlur(max(10, canvas.width // 64)))
    shadow.putalpha(shadow_alpha.point(lambda value: round(value * 0.48)))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(rendered, (x, y))


def find_bold_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/segoeuib.ttf"),
        Path("/System/Library/Fonts/SFNS.ttf"),
        Path("/System/Library/Fonts/SFNSDisplay-Bold.otf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


WEB_ICONS.mkdir(parents=True, exist_ok=True)
source = Image.open(SOURCE_PATH).convert("RGBA")
if not MARK_PATH.exists():
    source.save(MARK_PATH, optimize=True)
mark = crop_mark(source)

app_icon = make_background(1024)
place_mark(app_icon, mark, 650, 510)
app_icon = app_icon.convert("RGB")
app_icon.save(WEB_ICONS / "app-icon-1024.png", optimize=True)
app_icon.resize((512, 512), Image.Resampling.LANCZOS).save(WEB_ICONS / "icon-512.png", optimize=True)
app_icon.resize((192, 192), Image.Resampling.LANCZOS).save(WEB_ICONS / "icon-192.png", optimize=True)
app_icon.resize((180, 180), Image.Resampling.LANCZOS).save(WEB_ICONS / "apple-touch-icon.png", optimize=True)
app_icon.save(IOS_ASSETS / "AppIcon.appiconset" / "AppIcon-512@2x.png", optimize=True)

splash = make_background(2732)
place_mark(splash, mark, 760, 1165)
draw = ImageDraw.Draw(splash)
font = find_bold_font(174)
gest = "Gest"
ore = "Ore"
gest_box = draw.textbbox((0, 0), gest, font=font)
ore_box = draw.textbbox((0, 0), ore, font=font)
total_width = (gest_box[2] - gest_box[0]) + (ore_box[2] - ore_box[0])
text_x = (splash.width - total_width) // 2
text_y = 1610
draw.text((text_x, text_y), gest, font=font, fill=(248, 250, 255, 255))
draw.text((text_x + gest_box[2] - gest_box[0], text_y), ore, font=font, fill=(86, 142, 255, 255))

for filename in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
    splash.convert("RGB").save(IOS_ASSETS / "Splash.imageset" / filename, optimize=True)

print("GestOre iOS and PWA assets generated.")
