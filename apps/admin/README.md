# Snipotter Admin Dashboard

Tüm uygulamaların, tüm platformların — tek sayfada. **admin.snipotter.com**.

Microsoft Store, Google Play, GitHub Releases, Cloudflare Analytics, Supabase ve in-app heartbeat — hepsini birleştirip aynı arayüzde gösterir. Çoklu uygulama destekler (Snipotter Desktop bugün, ileride Snipotter #2 vb.).

## Mimari

```
admin.snipotter.com (Next.js statik export, Cloudflare Workers)
    └── Supabase (apps + metric_snapshots + reviews + heartbeats tabloları)
                  ↑                        ↑
   workers/cron (her gece 03:00 UTC)    workers/heartbeat (Electron + Capacitor pingleri)
                  ↑
   GitHub API · MS Partner Center · Play Reporting · Cloudflare Analytics
```

Üç ayrı Cloudflare Worker:
- `apps/admin` — bu sayfanın kendisi (statik), `admin.snipotter.com`
- `workers/heartbeat` — Electron/Capacitor ping endpoint'i, `api.snipotter.com/heartbeat`
- `workers/cron` — gece pull eden cron worker

## Kurulum

### 1. Supabase migration

```bash
psql "$SUPABASE_CONNECTION_STRING" -f supabase/migrations/0006_admin_dashboard.sql
```

veya Supabase Studio → SQL Editor → migration dosyasını yapıştır → Run.

İlk çalıştırma `apps` tablosuna iki satır ekler:
- `snipotter-desktop` (Microsoft Store ID + GitHub repo dolu)
- `snipotter-android` (Play paket adı placeholder, MS Store ID yok)

### 2. Admin paneli (apps/admin)

```bash
cd apps/admin
cp .env.local.example .env.local
# Düzenle: NEXT_PUBLIC_SUPABASE_ANON_KEY ve NEXT_PUBLIC_ADMIN_EMAILS
npm install
npm run dev   # http://localhost:5180
```

**Production deploy:**

```bash
npm run deploy
# → snipotter-admin Cloudflare Worker'ı oluşturur
```

Sonra Cloudflare dashboard → Workers & Pages → snipotter-admin → Settings → Custom Domains'den `admin.snipotter.com` ekle.

### 3. Heartbeat worker (workers/heartbeat)

Snipotter Electron + Capacitor uygulamalarının her açılışta ping atacağı endpoint.

```bash
cd workers/heartbeat
npm install

# Secret'ları gir
npx wrangler secret put SUPABASE_URL
# → https://oqiixlqfmjiljmpjnpbp.supabase.co
npx wrangler secret put SUPABASE_SERVICE_KEY
# → service_role JWT (Supabase Studio → Settings → API → service_role key)

npx wrangler deploy
```

Cloudflare dashboard'dan `api.snipotter.com/heartbeat` Custom Domain rotasını bağla.

**Test:**
```bash
curl -X POST https://snipotter-heartbeat.<account>.workers.dev/heartbeat \
  -H 'Content-Type: application/json' \
  -d '{"appSlug":"snipotter-desktop","deviceId":"test-uuid","platform":"darwin-arm64","version":"0.4.4"}'
# → {"ok":true}
```

### 4. Cron worker (workers/cron)

```bash
cd workers/cron
npm install

# Mecburi secret'lar
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put CRON_TRIGGER_SECRET   # rastgele string, /run endpoint'ini korur

# Opsiyonel kaynaklar — env yoksa sessizce atlanır:
npx wrangler secret put GITHUB_TOKEN          # rate limit 60→5000/h
# npx wrangler secret put MS_TENANT_ID        # PR-2'de devreye girecek
# npx wrangler secret put MS_CLIENT_ID
# npx wrangler secret put MS_CLIENT_SECRET
# npx wrangler secret put PLAY_SERVICE_ACCOUNT_JSON_B64  # PR-3
# npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
# npx wrangler secret put CLOUDFLARE_API_TOKEN

npx wrangler deploy
```

**İlk pull'u manuel tetikle:**
```bash
curl "https://snipotter-cron.<account>.workers.dev/run?source=github&secret=$CRON_TRIGGER_SECRET"
```

### 5. Electron uygulamasında heartbeat (PR-3'te eklenecek)

`electron/main/telemetry.ts` modülü her açılışta:
```typescript
const deviceId = ensureDeviceId()  // Electron app userData'da kalıcı UUID
fetch('https://api.snipotter.com/heartbeat', {
  method: 'POST',
  body: JSON.stringify({
    appSlug: 'snipotter-desktop',
    deviceId,
    platform: `${process.platform}-${process.arch}`,
    version: app.getVersion(),
    language: app.getLocale(),
  }),
}).catch(() => {})
```

Settings'te `Telemetri kapalı` toggle'ıyla devre dışı bırakılabilir (varsayılan: açık, anonim).

## Kaynak başına ne çıkıyor?

| Kaynak | Bu PR'da | Sonraki adım |
|--------|----------|--------------|
| GitHub Releases | ✅ Çalışıyor — anonim API ile per-asset indirme sayıları | Token ile rate limit yükselt |
| In-app heartbeat | ✅ Endpoint hazır | Electron tarafında bağla (PR-3) |
| Web app (Supabase direkt) | ✅ Workspaces, clipboard items, notes sayıları | — |
| Microsoft Store | 🚧 İskelet — Azure AD + Partner Center API gerekli | PR-2 |
| Cloudflare Workers Analytics | 🚧 İskelet | PR-2 |
| Google Play | 🚧 İskelet — Service account JSON gerekli | PR-3 (Android yayınlanınca) |
| Apple App Store Connect | — | İleride (Mac App Store yayınlanırsa) |
| Birleşik yorum kutusu | ✅ Okuma + filtreleme | Cevap gönderme: PR-3 |

## Gizlilik

- Heartbeat tamamen anonim. `device_id` = istemci tarafında üretilen rastgele UUID; e-posta, IP veya hesap kimliği yok.
- Service-role anahtarı sadece Cloudflare Worker secret bağlamasında. İstemci hiçbir zaman doğrudan Supabase yazmaz.
- `heartbeats` tablosu RLS ile kapalı, sadece service-role yazabilir/okuyabilir.
- Admin paneli erişimi: `NEXT_PUBLIC_ADMIN_EMAILS` allowlist'indeki e-postalar. Diğer Supabase oturumları otomatik çıkış yapar.
