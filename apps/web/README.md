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

## Android (Capacitor)

Aynı Next.js bundle Capacitor 8 ile native Android paketi olarak dağıtılır. Statik export → `android/app/src/main/assets/public/` altına bundle'lanır, böylece Play Store "salt-wrapper app" değil bağımsız uygulama olarak kabul eder.

### Sürüm öncesi gereksinimler

- **Node ≥ 22** (Capacitor 8 şartı). Repo `nvm install 22` ile geçer.
- **Android Studio** (Hedgehog veya üstü), Android SDK 34+.
- `JAVA_HOME` Studio'nun bundled JDK'sına bağlı (genelde `/Applications/Android Studio.app/Contents/jbr/Contents/Home`).

### Kullanılabilir scriptler

```bash
npm run android:sync     # next build + cap sync (her TS değişikliğinden sonra)
npm run android:open     # build + sync + Android Studio'da aç
npm run android:run      # build + sync + bağlı cihaz/emülatörde çalıştır
npm run android:bundle   # release .aab üretir → Play Store yüklemesi
npm run android:assets   # ikon + splash regenere et (assets/icon.png + assets/splash.png)
```

### Native özellikler

| Özellik | Native dosya | JS bridge |
|---------|--------------|-----------|
| Share Target (her uygulamadan paylaş → Snipotter) | `AndroidManifest.xml` (`SEND` + `text/*` intent filter) | `lib/mobile.ts` → `SendIntent.checkSendIntentReceived()` |
| Quick Settings tile (panoyu tek tık kaydet) | `SnipTileService.java` + `drawable/ic_tile_snip.xml` | `lib/mobile.ts` → `snipotter://clip?text=...` deep-link handler |
| Resume clipboard read | — (sadece Capacitor `Clipboard.read()`) | `lib/mobile.ts` → `App.appStateChange` |
| Splash + status bar | Capacitor `SplashScreen` + `StatusBar` plugin'leri | `lib/mobile.ts` |

> **Not:** Android 10+ üçüncü parti uygulamalara arka planda pano okumayı yasaklar. Yukarıdaki üç yüzey de bunu aşmak için **kullanıcı el hareketi gerektiren ön plan** akışlarıdır. Background polling teknik olarak imkansız.

### Release build (Play Store)

İlk release sırasında upload keystore oluşturuldu ve makineye kuruldu:

| Dosya | Konum | İçerik |
|-------|-------|--------|
| Upload keystore | `~/snipotter-upload.keystore` | RSA 2048, alias `snipotter-upload`, 10.000 gün geçerli |
| Parola | `~/.snipotter-upload-keystore-password` (chmod 600) | 32 karakter random base64 |
| Gradle config | `android/key.properties` (gitignored) | Yukarıdaki dosyaları okur |

> **🔐 Kritik:** Bu keystore Play Store'a uygulamayı yüklerken kullanılır. **Asla kaybetme** — kaybedersen bu uygulama kimliği altında bir daha güncelleme yayınlayamazsın. Keystore + parola dosyasını 1Password / iCloud Keychain / şifrelenmiş yedek diskte sakla.
> Production imzalama anahtarını Google **Play App Signing** üzerinden yönetir (ilk yüklemede otomatik kabul edilir); sen sadece upload anahtarını yönetirsin.

**AAB üret:**
```bash
npm run android:bundle
# → android/app/build/outputs/bundle/release/app-release.aab (~4.5 MB)
```

**Upload keystore SHA-1 fingerprint** (Play Console'da görünür):
```bash
keytool -list -v -keystore ~/snipotter-upload.keystore \
  -alias snipotter-upload \
  -storepass "$(cat ~/.snipotter-upload-keystore-password)"
```

### Play Console adımları (uygulama zaten oluşturulmuş)

1. **Internal Testing → Yeni sürüm → AAB yükle.** İlk yüklemede Play App Signing'i kabul et (Google anahtarı yönetir; sen sadece upload anahtarını saklarsın).
2. **Store listesi:** ikon 512×512, feature graphic 1024×500, en az 2 telefon ekran görüntüsü, gizlilik politikası URL'si (https://snipotter.com/privacy gibi — **zorunlu**).
3. **Veri güvenliği formu:** Pano içeriği Supabase'de saklanıyor → "Personal info / User-generated content" altında açıkça beyan.
4. **İçerik derecelendirmesi anketi.**
5. **İncelemeye gönder** — internal track 1-2 saat, production 1-3 gün.

## Mimari

- Next.js 14 App Router, tüm sayfalar client component
- Supabase JS direkt — IPC yok
- Realtime: `postgres_changes` ile workspace_id'ye filtreli
- State: Zustand
- Styling: Tailwind, koyu tema varsayılan
