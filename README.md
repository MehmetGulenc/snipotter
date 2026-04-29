# Snipotter

Mac + Windows + Linux için **pano yöneticisi + AI destekli hızlı not** uygulaması. Her şey bulutta senkron — masaüstünde aldığın not telefondan/web'den de görünsün diye Supabase üstüne kuruldu.

> **Stack**: Electron + React + TypeScript + Tailwind + Supabase + Anthropic Claude Haiku + Google Gemini Flash

## Özellikler

- **Pano geçmişi**: Sistem panosunu otomatik izler. Eski kopyaladıkların bir tıkla geri gelir.
- **Hızlı not** (`Cmd+Shift+N` / `Ctrl+Shift+N`): Global kısayolla küçük bir kutu açılır, Cmd+Enter ile kaydeder.
- **AI etiketleme + özet**: Her içerik Claude Haiku'ya, başarısız olursa Gemini Flash'a gider. Otomatik etiket + 1 cümle özet.
- **Realtime senkron**: Supabase Realtime ile cihazlar arası anında güncellenir.
- **Hassas içerik koruması**: API key, JWT, AWS key gibi pattern'lar otomatik maskelenir.
- **Pin & arama**: Önemli içerikleri sabitle, hepsinde arama yap.
- **Cross-platform**: Tek codebase'den Mac (.dmg), Windows (.exe), Linux (.AppImage) çıkar.

## Klasör Yapısı

```
snipotter/
├── electron/
│   ├── main/                # Main process: clipboard monitor, AI, IPC, tray, hotkeys
│   │   ├── index.ts
│   │   ├── clipboard.ts
│   │   ├── ai.ts
│   │   ├── supabase.ts
│   │   ├── windows.ts
│   │   ├── tray.ts
│   │   ├── hotkeys.ts
│   │   └── store.ts
│   └── preload/             # contextBridge → window.snipotter
│       ├── index.ts
│       └── index.d.ts
├── src/                     # React renderer
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   ├── pages/
│   ├── store/useStore.ts
│   ├── lib/utils.ts
│   └── styles/globals.css
├── shared/types.ts          # Main + renderer ortak tipler ve IPC sözleşmesi
├── supabase/migrations/
│   └── 0001_init.sql        # profiles, clipboard_items, notes + RLS + realtime
├── electron.vite.config.ts
├── electron-builder.json
├── tailwind.config.ts
├── tsconfig*.json
└── package.json
```

## Kurulum (Adım Adım)

### 1. Bağımlılıklar

```bash
node -v   # 20+ olmalı
npm install
```

### 2. Supabase

1. [supabase.com](https://supabase.com) → yeni proje aç (free tier yeter).
2. SQL Editor → `supabase/migrations/0001_init.sql` içeriğini yapıştır → Run.
3. Settings → API → **URL** ve **anon key**'i not al.
4. Authentication → Providers → Email Provider'ı aç. (Mail onayı istersen "Confirm email"'i açık bırak; geliştirme sırasında kapatabilirsin.)

### 3. AI API Keys

- **Anthropic Claude Haiku** (primary): [console.anthropic.com](https://console.anthropic.com/settings/keys) → API Keys → Create Key. ~$5 yükle yeter; Haiku binlerce çağrıda dolar mertebesinde kalır.
- **Google Gemini Flash** (fallback): [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → Create API key. Free tier var, kart bile istemiyor.

### 4. `.env`

```bash
cp .env.example .env
# Şu değişkenleri doldur:
# MAIN_VITE_SUPABASE_URL
# MAIN_VITE_SUPABASE_ANON_KEY
# RENDERER_VITE_SUPABASE_URL
# RENDERER_VITE_SUPABASE_ANON_KEY
# MAIN_VITE_ANTHROPIC_API_KEY
# MAIN_VITE_GEMINI_API_KEY
```

> **Not**: AI key'leri sadece `MAIN_VITE_*` olarak ekleniyor; main process'te yaşıyor, renderer'a sızmıyor. Supabase anon key her iki tarafta da var.

### 5. Çalıştır

```bash
npm run dev
```

İlk açılışta giriş ekranı çıkar → e-posta + şifre ile kayıt ol → giriş yap → kopyaladığın her şey otomatik gelmeye başlar.

### 6. Build

```bash
npm run build:mac     # Mac (.dmg + .zip, arm64 + x64)
npm run build:win     # Windows (.exe + portable)
npm run build:linux   # Linux (.AppImage + .deb)
```

Çıktı: `dist/` klasörü.

## Kısayollar (varsayılan)

| Eylem               | Mac                 | Windows / Linux        |
| ------------------- | ------------------- | ---------------------- |
| Kütüphaneyi aç      | `Cmd+Shift+V`       | `Ctrl+Shift+V`         |
| Hızlı not           | `Cmd+Shift+N`       | `Ctrl+Shift+N`         |
| Notu kaydet         | `Cmd+Enter`         | `Ctrl+Enter`           |
| Hızlı notu kapat    | `Esc`               | `Esc`                  |

Ayarlar sekmesinden değiştirilebilir.

## AI Fallback Mantığı

`electron/main/ai.ts`:

1. Kullanıcının seçtiği primary provider denenir (default Claude Haiku).
2. 8 sn timeout, hata, rate limit veya boş JSON → diğer provider'a düşer.
3. İkisi de başarısız olursa item AI olmadan kalır; UI'da "Sparkles" ikonuyla yeniden tetiklenebilir.

Çıkan format her zaman:

```json
{
  "summary": "≤120 karakter tek cümle özet",
  "tags": ["en fazla 5 küçük harf etiket"],
  "language": "tr"
}
```

## Senkron Mimarisi

```
[Mac App]  ──┐                              ┌──> [Windows App]
             │                              │
             ├──> Supabase (Postgres + RLS) ─┼──> [Web - sonraki adım]
             │                              │
[Quick Note]─┘                              └──> [Mobile - sonraki adım]
```

- Her tablo `user_id`'ye RLS ile bağlı; başkasının içeriğini göremezsin.
- `supabase_realtime` publication ile her INSERT/UPDATE/DELETE diğer client'lara push edilir.
- Offline yazılan içerikler `synced=false` ile lokalde durur, online olunca yukarı atılır (TODO: outbox queue).

## Yol Haritası (Sonraki Adımlar)

- [ ] Browser extension (Chrome + Firefox) — sayfadan direkt nota gönder.
- [ ] iOS/Android (Expo + React Native) — aynı Supabase backend'i.
- [ ] Outbox queue: offline yazılan içerikler yeniden bağlanınca senkron.
- [ ] Image clipboard senkronu (Supabase Storage).
- [ ] Görsellerden OCR + AI özetleme.
- [ ] Klasörler / koleksiyonlar.
- [ ] End-to-end encryption (kullanıcı opt-in).
- [ ] Auto-update (electron-updater).

## Geliştirme Notları

- **IPC sözleşmesi**: `shared/types.ts` içindeki `IPC` enum'u kullanılır. Yeni handler eklerken hem orada hem `electron/main/index.ts` hem de `electron/preload/index.ts`'i güncelle.
- **Stil**: Tailwind + CSS değişkenleri (`src/styles/globals.css`). Tema değişimi `.light` class ekle/kaldırla yapılır.
- **State**: Zustand (`src/store/useStore.ts`). Supabase realtime push'ları store'a `upsert*` ile gider.
- **Pano monitor**: 700ms polling. Native NSPasteboard hook'u istersen ileride bir native module eklenebilir.

## Lisans

MIT
