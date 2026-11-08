from PIL import Image, ImageDraw, ImageFont

OUT  = "/Users/mehmetgulenc/Desktop/play-store-assets/feature-graphic-1024x500.png"
ICON = "/Users/mehmetgulenc/Desktop/snipotter/build/icon.iconset/icon_512x512.png"

FONT      = "/Library/Fonts/Arial Unicode.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

def f(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)

img = Image.new("RGB", (1024, 500), (10, 10, 15))
d   = ImageDraw.Draw(img)

# Purple left accent bar
d.rectangle([0, 0, 5, 500], fill=(124, 58, 237))

# Subtle gradient overlay — dark to slightly lighter
for i in range(1024):
    alpha = int(8 * (i / 1024))
    d.line([(i, 0), (i, 500)], fill=(alpha, alpha, alpha + 10))

# Icon
icon = Image.open(ICON).resize((200, 200), Image.LANCZOS)
img.paste(icon, (80, 150), icon)

# App name
d.text((320, 120), "Snipotter", font=f(80, bold=True), fill=(255, 255, 255))

# Tagline
d.text((322, 220), "Pano yöneticisi + AI not", font=f(34), fill=(167, 139, 250))

# Description
d.text((322, 280), "Tüm cihazlarında anında senkronizasyon", font=f(28), fill=(107, 114, 128))

# Dots decoration
for i, col in enumerate([(124,58,237),(139,92,246),(167,139,250)]):
    d.ellipse([322 + i*24, 348, 338 + i*24, 364], fill=col)

img.save(OUT, quality=95)
print("feature-graphic done →", OUT)
