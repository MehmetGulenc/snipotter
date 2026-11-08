from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

OUT  = "/Users/mehmetgulenc/Desktop/play-store-assets"
ICON = "/Users/mehmetgulenc/Desktop/snipotter/build/icon.iconset/icon_512x512.png"

BG      = (10,  10,  15)
CARD    = (19,  19,  28)
CARD2   = (22,  22,  34)
BORDER  = (30,  30,  46)
WHITE   = (255, 255, 255)
PURPLE  = (124, 58,  237)
PURPLE2 = (139, 92,  246)
GRAY    = (107, 114, 128)
GRAY2   = (75,  85,  99)
RED     = (239, 68,  68)
GREEN   = (34,  197, 94)
ORANGE  = (251, 146, 60)

FONT_PATH      = "/Library/Fonts/Arial Unicode.ttf"
FONT_PATH_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

def f(size, bold=False):
    try:
        p = FONT_PATH_BOLD if bold else FONT_PATH
        return ImageFont.truetype(p, size)
    except:
        return ImageFont.load_default()

def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def shadow_card(img, x, y, w, h, r=20):
    """Draw a subtle drop shadow then the card."""
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([x+4, y+6, x+w+4, y+h+6], radius=r, fill=(0, 0, 0, 80))
    blurred = shadow.filter(ImageFilter.GaussianBlur(radius=8))
    img.paste(blurred, (0, 0), blurred)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x, y, x+w, y+h], radius=r, fill=CARD, outline=BORDER, width=1)

def status_bar(img, y=0):
    d = ImageDraw.Draw(img)
    d.text((44, y+14), "9:41", font=f(28, bold=True), fill=WHITE)
    d.text((img.width - 180, y+14), "WiFi  100%", font=f(24), fill=WHITE)

def tab_bar(img, active="library"):
    W, H = img.size
    d = ImageDraw.Draw(img)
    d.rectangle([0, H-110, W, H], fill=(13, 13, 20))
    d.rectangle([0, H-111, W, H-110], fill=BORDER)
    tabs = [("Kütüphane", "library", W//4), ("Notlar", "notes", W//2), ("Ayarlar", "settings", 3*W//4)]
    for label, key, cx in tabs:
        color = PURPLE2 if key == active else GRAY
        bold  = key == active
        d.text((cx - 50, H-80), label, font=f(26, bold=bold), fill=color)

W, H = 1080, 1920

# ─── Screenshot 1: Clipboard Library ─────────────────────────────────────────
img1 = Image.new("RGBA", (W, H), (*BG, 255))
d1 = ImageDraw.Draw(img1)

status_bar(img1, y=0)

# Header
d1.rectangle([0, 56, W, 58], fill=BORDER)
icon_img = Image.open(ICON).resize((48, 48), Image.LANCZOS)
img1.paste(icon_img, (28, 68), icon_img)
d1.text((90, 76), "Snipotter", font=f(38, bold=True), fill=WHITE)

# Tabs
d1.rectangle([0, 130, W, 192], fill=(13, 13, 20))
d1.rounded_rectangle([16, 136, 428, 186], radius=14, fill=PURPLE)
d1.text((120, 150), "Kütüphane", font=f(28, bold=True), fill=WHITE)
d1.text((560, 150), "Notlar", font=f(28), fill=GRAY)
d1.text((820, 150), "Ayarlar", font=f(28), fill=GRAY)
d1.rectangle([0, 192, W, 193], fill=BORDER)

# Search bar
d1.rounded_rectangle([24, 206, W-24, 264], radius=14, fill=CARD2, outline=BORDER, width=1)
d1.text((60, 222), "🔍  Ara...", font=f(28), fill=GRAY)

# Clipboard cards
clips = [
    ("npm install @supabase/supabase-js", "Bugün 12:34 · Metin", GRAY,   None),
    ("https://app.snipotter.com",         "Bugün 12:21 · Bağlantı", GRAY, None),
    ("Toplantı notları: Pazartesi 09:00", "Bugün 11:58 · Metin", GRAY,   None),
    ("API_KEY=sk-proj-••••••••••••••••",  "Hassas içerik · senkronize edilmedi", RED, RED),
    ("git commit -m 'fix: auth flow'",    "Dün 18:42 · Kod",    GRAY,   None),
    ("design-tokens-v2.json",             "Dün 16:10 · Metin",  GRAY,   None),
    ("Supabase bağlantısı kuruldu ✓",     "Dün 14:22 · Metin",  GRAY,   None),
]
y = 284
for text, sub, sc, badge in clips:
    shadow_card(img1, 24, y, W-48, 100, r=16)
    d1 = ImageDraw.Draw(img1)
    d1.text((48, y+16), text[:46] + ("…" if len(text) > 46 else ""), font=f(30), fill=WHITE)
    d1.text((48, y+58), sub, font=f(24), fill=sc)
    if badge:
        d1.rounded_rectangle([W-130, y+28, W-44, y+72], radius=8, fill=(239, 68, 68, 40))
        d1.text((W-120, y+36), "Hassas", font=f(20), fill=RED)
    y += 116

tab_bar(img1, active="library")

img1 = img1.convert("RGB")
img1.save(os.path.join(OUT, "screenshot-1-library.png"), quality=95)
print("screenshot-1 done")

# ─── Screenshot 2: Notes ──────────────────────────────────────────────────────
img2 = Image.new("RGBA", (W, H), (*BG, 255))
d2 = ImageDraw.Draw(img2)

status_bar(img2, y=0)

d2.rectangle([0, 56, W, 58], fill=BORDER)
img2.paste(icon_img, (28, 68), icon_img)
d2.text((90, 76), "Snipotter", font=f(38, bold=True), fill=WHITE)

d2.rectangle([0, 130, W, 192], fill=(13, 13, 20))
d2.text((120, 150), "Kütüphane", font=f(28), fill=GRAY)
d2.rounded_rectangle([476, 136, 760, 186], radius=14, fill=PURPLE)
d2.text((536, 150), "Notlar", font=f(28, bold=True), fill=WHITE)
d2.text((820, 150), "Ayarlar", font=f(28), fill=GRAY)
d2.rectangle([0, 192, W, 193], fill=BORDER)

# + New note button
d2.rounded_rectangle([24, 206, W-24, 270], radius=14, fill=PURPLE)
d2.text((W//2 - 80, 224), "+ Yeni Not", font=f(30, bold=True), fill=WHITE)

notes = [
    ("Haftalık Sprint Planı",  "Backend görevleri: auth, sync, API entegrasyonu tamamlandı.", "Bugün 13:00"),
    ("Okuma Listesi",          "Deep Work, The Pragmatic Programmer, Clean Architecture...",  "Dün 20:15"),
    ("Deploy Checklist",       "1. Build  2. Test  3. Tag & push  4. Monitor logs",          "Dün 17:30"),
    ("Fikir: Çevrimdışı Mod",  "Service worker + IndexedDB ile offline destek eklenebilir.", "2 gün önce"),
    ("API Notları",            "Supabase anon key public olabilir — RLS politikaları yeterli.", "3 gün önce"),
]
y = 290
for title, preview, date in notes:
    shadow_card(img2, 24, y, W-48, 148, r=18)
    d2 = ImageDraw.Draw(img2)
    d2.text((48, y+18), title, font=f(30, bold=True), fill=WHITE)
    d2.text((48, y+64), preview[:55] + "…", font=f(26), fill=GRAY)
    d2.text((48, y+112), date, font=f(22), fill=GRAY2)
    y += 166

tab_bar(img2, active="notes")

img2 = img2.convert("RGB")
img2.save(os.path.join(OUT, "screenshot-2-notes.png"), quality=95)
print("screenshot-2 done")
print("All done →", OUT)
