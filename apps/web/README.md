# Snipotter Web Companion

Telefondan veya başka bir bilgisayarın tarayıcısından Snipotter alanına erişim. Aynı pano + notları, aynı pair-code tabanlı eşleşme ile.

## Özellikler

- **Anonim oturum** — e-posta/şifre yok, tarayıcı localStorage'da kalıcı
- **Pair code ile eşleşme** — masaüstünde Ayarlar → Cihazlar'dan 6 haneli kod al, buraya gir
- **Realtime pano görüntüleme** — masaüstünde kopyaladığın her şey burada anında belirir
- **Görsel pano öğeleri** — `data:image/...` PNG'ler önizlemeli, tek tıkla kopyalanır (Chrome/Safari)
- **Tam not CRUD'u** — yeni not, düzenleme, silme, sabitleme
- **PWA** — Safari/Chrome'da "Ana Ekrana Ekle" → app gibi
- **Mobile-first** — alt navigasyon, safe-area uyumlu

## Çalıştırma (lokal)

```bash
cd apps/web
cp .env.local.example .env.local   # Supabase URL + anon key (zaten dolu)
npm install
npm run dev
```

→ http://localhost:5174

## Yayına alma (Vercel / Netlify)

Otomatik tespit edilir; gerekli env var'lar:

```
NEXT_PUBLIC_SUPABASE_URL=https://oqiixlqfmjiljmpjnpbp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

## Sınırlamalar (web platformu kısıtları)

- **Pano izleme yok** — tarayıcı OS panosunu pasif olarak okuyamaz. Bu yüzden web sürümü "viewer + note creator" rolündedir; pano öğesi üretmez.
- **Bildirim yok** (henüz) — Push notification desteklenebilir ama şu an hedef değil.
- **Görsel pano öğesi kopyalama** Chrome/Safari'de çalışır, Firefox kısıtlı.

## Mimari

- Next.js 14 App Router, tüm sayfalar client component
- Supabase JS direkt — IPC yok
- Realtime: `postgres_changes` ile workspace_id'ye filtreli
- State: Zustand
- Styling: Tailwind, koyu tema varsayılan
