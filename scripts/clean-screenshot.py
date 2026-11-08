from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

SRC = "/Users/mehmetgulenc/Desktop/play-store-assets/screenshot-1-real.png"
OUT = "/Users/mehmetgulenc/Desktop/play-store-assets"

FONT      = "/Library/Fonts/Arial Unicode.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

def f(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)

# Load real screenshot
img = Image.open(SRC).convert("RGBA")
W, H = img.size
print(f"Real screenshot size: {W}x{H}")

# ── Screenshot 1: crop the real top UI, extend with more cards ────────────────
# The real app is visible from top ~ y=0 to y=420 (dialog starts ~420)
# We'll keep the top portion and fill rest with realistic cards

real_top = img.crop((0, 0, W, 420))

# Create a new full-height image
out1 = Image.new("RGBA", (W, H), (10, 10, 15, 255))
out1.paste(real_top, (0, 0))

d = ImageDraw.Draw(out1)
BG     = (10, 10, 15)
CARD   = (19, 19, 28)
BORDER = (30, 30, 46)
WHITE  = (255, 255, 255)
GRAY   = (107, 114, 128)
RED    = (239, 68, 68)

# Add more cards below the real content
clips = [
    ("git commit -m 'fix: supabase realtime'", "Bugün 11:42 · Kod", GRAY),
    ("design-system-v3.figma token export",    "Bugün 11:20 · Metin", GRAY),
    ("API anahtarı: sk-proj-••••••••••",        "Hassas içerik — gizlendi", RED),
    ("Toplantı: Cuma 14:00 Zoom",               "Dün 18:30 · Metin", GRAY),
    ("npm run build && npm run deploy",         "Dün 17:55 · Kod", GRAY),
]

# Estimate card height from real screenshot — cards appear ~260px tall each in 1080px width
card_h = 110
y = 430
for text, sub, sc in clips:
    # shadow
    shadow = Image.new("RGBA", out1.size, (0,0,0,0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([28, y+4, W-28+4, y+card_h+4], radius=18, fill=(0,0,0,60))
    blurred = shadow.filter(ImageFilter.GaussianBlur(4))
    out1.paste(blurred, (0,0), blurred)
    d = ImageDraw.Draw(out1)
    d.rounded_rectangle([24, y, W-24, y+card_h], radius=18, fill=CARD, outline=BORDER, width=1)
    d.text((48, y+16), text[:48]+("…" if len(text)>48 else ""), font=f(28), fill=WHITE)
    d.text((48, y+60), sub, font=f(22), fill=sc)
    # action icons on right
    for i, icon_char in enumerate(["⧉", "⊕", "✕"]):
        d.text((W-110+i*2, y+16+i*24), "·", font=f(30), fill=BORDER)
    y += card_h + 12
    if y > H - 130:
        break

out1 = out1.convert("RGB")
out1.save(os.path.join(OUT, "screenshot-1-library.png"), quality=95)
print("screenshot-1-library saved")

# ── Screenshot 2: Notes tab from real app ─────────────────────────────────────
# We need to navigate to Notes - let's build it cleanly combining real header + synthetic notes

# Use real header from top screenshot (first ~100px has real status bar + header)
real_header = img.crop((0, 0, W, 100))

out2 = Image.new("RGBA", (W, H), (10, 10, 15, 255))
out2.paste(real_header, (0, 0))
d2 = ImageDraw.Draw(out2)

PURPLE = (124, 58, 237)
GRAY2  = (75, 85, 99)
PURPLE2= (139, 92, 246)

# Tab bar — Notlar active
d2.rectangle([0, 100, W, 160], fill=(13, 13, 20))
d2.text((80, 114), "Pano", font=f(28), fill=GRAY)
cx = W//2
d2.rounded_rectangle([cx-120, 106, cx+120, 154], radius=14, fill=PURPLE)
d2.text((cx-50, 114), "Notlar", font=f(28, bold=True), fill=WHITE)
d2.text((W-160, 114), "Ayarlar", font=f(28), fill=GRAY)
d2.rectangle([0, 160, W, 161], fill=BORDER)

# + Yeni Not button
d2.rounded_rectangle([24, 174, W-24, 240], radius=14, fill=PURPLE)
d2.text((W//2 - 90, 192), "+ Yeni Not", font=f(32, bold=True), fill=WHITE)

notes = [
    ("Haftalık Sprint Planı",  "Backend görevleri: auth, sync, API entegrasyonu tamamlandı.",    "Bugün 13:00"),
    ("Okuma Listesi",          "Deep Work, The Pragmatic Programmer, Clean Architecture...",      "Dün 20:15"),
    ("Deploy Checklist",       "1. Build  2. Test  3. Tag & push  4. Monitor logs",              "Dün 17:30"),
    ("Fikir: Çevrimdışı Mod",  "Service worker + IndexedDB ile offline destek eklenebilir...",   "2 gün önce"),
    ("API Notları",            "Supabase anon key — RLS politikaları ile koruma yeterli.",       "3 gün önce"),
    ("UI Tasarım Notları",     "Figma tokenlarını CSS variables ile entegre et.",                "4 gün önce"),
]

y = 258
for title, preview, date in notes:
    shadow = Image.new("RGBA", out2.size, (0,0,0,0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([28, y+4, W-24, y+152], radius=18, fill=(0,0,0,60))
    blurred = shadow.filter(ImageFilter.GaussianBlur(5))
    out2.paste(blurred, (0,0), blurred)
    d2 = ImageDraw.Draw(out2)
    d2.rounded_rectangle([24, y, W-24, y+148], radius=18, fill=CARD, outline=BORDER, width=1)
    d2.text((48, y+16), title, font=f(30, bold=True), fill=WHITE)
    d2.text((48, y+62), preview[:54]+"…", font=f(24), fill=GRAY)
    d2.text((48, y+106), date, font=f(22), fill=GRAY2)
    y += 164
    if y > H - 130:
        break

# Bottom nav
d2.rectangle([0, H-110, W, H], fill=(13, 13, 20))
d2.rectangle([0, H-111, W, H-110], fill=BORDER)
d2.text((80-30, H-82), "Pano", font=f(26), fill=GRAY)
d2.text((W//2-30, H-82), "Notlar", font=f(26, bold=True), fill=PURPLE2)
d2.text((W-160, H-82), "Ayarlar", font=f(26), fill=GRAY)

out2 = out2.convert("RGB")
out2.save(os.path.join(OUT, "screenshot-2-notes.png"), quality=95)
print("screenshot-2-notes saved")
print("Done!")
