# Changelog

## [0.12.0] - 2026-11-14

### 📲 Kolay Cihaz Eşleştirme

- **Kodu gir, Onayla**: Yeni cihazda 6 haneli eşleştirme kodunu yaz; diğer cihazında "iPhone bağlanmak istiyor — Onayla" çıkar. 12 kelime girmek kalktı.
- **Doğrulama kodu**: İki ekranda aynı 4 rakam görünür; şifre anahtarı cihazlar arasında sunucuya görünmeden aktarılır.
- **Reddet**: Tanımadığın bir cihazı reddedersen eşleşmeden çıkarılır.
- **Kurtarma**: 24 kelimelik kurtarma anahtarı yalnızca hiçbir cihazına erişimin kalmadığında gerekir.

### 🏝️ Dynamic Island

- Ortak alana yeni not eklenince Dynamic Island ve kilit ekranında kimin hangi alana ne eklediği görünür; dokununca not açılır.
- İsimler ve başlık telefonunda çözülür, sunucu yine göremez. iOS 17.2 ve üstü, bildirimler açıkken.

### ✨ Sade Ortak Alan Ekranları

- Tek menü: Notlar ekranındaki "Notlarım ▾" ile alanlar arası geçiş, yeni alan, davete katıl.
- Açık alanda "Kişiler" düğmesi: tek dokunuşla davet, kişi listesi, alandan çıkma.
- Davet yalnızca bağlantıyla; bağlantı açılınca alanın adı gösterilip "Katıl" sorulur.

### 🐛 Düzeltmeler

- iPhone'da formlara dokununca sayfanın kayması ve klavyenin düğmeleri örtmesi düzeltildi.
- Kişiler listesi açıkken yeni katılanlar kendiliğinden görünür.

## [0.11.0] - 2026-11-13

### 👥 Ortak Çalışma Alanları

Eşinle, ailenle ya da arkadaşlarınla notları birlikte yazın. İçerik uçtan uca şifreli kalır; pano geçmişin her zaman yalnızca sende.

- **Ortak alan**: Notlar ekranındaki "Notlarım ▾" menüsünden yeni alan aç ya da alanlar arasında geçiş yap. Herkes aynı notu aynı anda düzenleyebilir.
- **Davet**: "Davet bağlantısı oluştur" tek kullanımlık, 7 gün geçerli bir bağlantı verir. iPhone'da bağlantıya dokununca katılma ekranı açılır; bilgisayarda bağlantı ya da 12 kelime "Davete katıl" ekranına yapıştırılır.
- **Kişiler**: Alandaki kişileri gör; alanı kuran kişi başkasını çıkarabilir, herkes alandan çıkabilir. Son kişi çıkınca alan ve notları silinir.
- **Ortak alana gönder**: Bir pano kaydını ortak alana not olarak ekle; kayıt yalnızca sende kalır.
- **Bildirim**: Ortak alana yeni not eklenince diğer kişilerin iPhone'una bildirim gelir, dokununca not açılır. Bildirimde içerik görünmez.
- **Şifreleme**: Notlar, alan adı ve kişi adları cihazlarda şifrelenir; bir kişinin tüm cihazları alanı otomatik görür.

### 🔒 Güvenlik

- Sunucuda şifreleme ayarı artık uygulama dışından kapatılamaz.

## [0.10.0] - 2026-11-13

### 🔐 Pano ve Notlar Artık Uçtan Uca Şifreli

Pano kayıtların ve notların artık cihazlarında şifreleniyor. Anahtar yalnızca senin cihazlarında durur; sunucu, yedekler ve Snipotter ekibi içeriği okuyamaz.

- **Şifrelenenler**: Pano metinleri ve önizlemeleri, not başlıkları ve içerikleri, not geçmişi, çöp kutusu, fotoğraflar, defter adları ve cihazlar arası aksiyonlar.
- **Kurtarma anahtarı**: Şifrelemeyi açarken 24 kelime verilir; tüm cihazlarını kaybedersen verine yalnızca bu kelimelerle ulaşabilirsin. Kelimeler kopyalanamaz, pano geçmişine düşmez.
- **Yeni cihaz ekle**: Ayarlar → Cihazlar → Yeni cihaz ekle ile 10 dakika geçerli, tek kullanımlık 12 kelime al; yeni cihazda "Bu cihazı bağla" ekranına yaz.
- **Mevcut veriler**: Güncellemeden sonraki ilk açılışta eski kayıtların şifrelenir; yarıda kalırsa bir sonraki açılışta devam eder.
- **Sunucu koruması**: Şifreleme açıldıktan sonra sunucu şifresiz yazmayı reddeder.

### ⚠️ Önemli

- Şifreleme açıldıktan sonra eski sürümler bu verileri okuyamaz; tüm cihazlarını bu sürüme güncelle.
- Çıkış yapınca ya da eşleşmeden ayrılınca anahtar cihazdan silinir.

## [0.9.0] - 2026-11-13

### 📝 Notlar Artık Profesyonel Bir Not Aracı

Notlar baştan yazıldı: aynı notu iki cihazda aynı anda düzenleyebilir, internet yokken yazmaya devam edebilirsin.

- **Çakışmasız senkron**: Aynı notu Mac'te ve iPhone'da aynı anda düzenlesen bile yazdıkların birbirini silmez, tek notta birleşir.
- **Çevrimdışı yazma**: Bağlantı yokken yazdıkların cihazda saklanır, bağlantı gelince gönderilir.
- **Sürüm geçmişi**: Notun önceki hâllerini gör, istediğine geri dön. Geri dönmeden önce mevcut hâl de saklanır.
- **Çöp kutusu**: Silinen notlar 30 gün boyunca geri yüklenebilir.
- **Fotoğraflar**: Nota eklenen fotoğraflar artık notu şişirmiyor; ayrı ve özel bir depoda saklanıyor.

### 🗂️ Düzen

- **Defterler**: Notlarını iç içe defterlerde (en fazla 4 kat) topla; yeni not açık deftere eklenir.
- **#etiket**: Yazarken vurgulanır, tıklayınca o etiketin notları listelenir.
- **Not bağlantıları**: `[[` yazıp başka bir notu bağla; bağlanan notta "Bu nota bağlananlar" görünür.
- **Arama**: Türkçe karakter ve büyük/küçük harf ayırmaz, başlık eşleşmeleri öne çıkar, eşleşen yerler vurgulanır.

### ✍️ Yazma Deneyimi

- **/ menüsü**: Satır başında `/` yaz; başlık, liste, yapılacaklar, tablo, kod, fotoğraf, tarih ve şablonlar.
- **Şablonlar**: Toplantı notu, alışveriş listesi, günlük ve proje planı.
- **Kod renklendirme**, **blok taşıma** (⌥↑ / ⌥↓, masaüstünde sürükleme tutamacı), **geri al / yinele** butonları.
- **Biten görevler** listenin sonuna iner.
- **iPhone**: Biçimlendirme çubuğu klavyenin hemen üstünde durur.

### 🐛 Düzeltmeler

- Aynı kopyanın iki-üç kez kaydedilmesi (iPhone ve Universal Clipboard) düzeltildi.
- iPhone uygulaması öne gelir gelmez senkronlanıyor.
- Masaüstünden kopyalanan görseller iPhone'da metin yerine görsel olarak görünüyor.
- Maddeli notların liste önizlemesi satır satır gösteriliyor.

## [0.8.0] - 2026-11-12

### 📲 İş PC ↔ iPhone Aksiyon Köprüsü

Bilgisayarda kopyaladığın şeyi telefonda tek dokunuşla kullan; telefona gelen kod bilgisayarda hazır olsun.

- **Telefona gönder**: Telefon numarası, adres, IBAN veya bağlantı içeren kartlarda "Telefona gönder" butonu. iPhone'a bildirim gelir; dokununca arar, haritada açar, kopyalar veya bağlantıyı açar. İçerik kilit ekranında gösterilmez.
- **Kod otomatik kopyalama**: Başka bir cihazdan gelen tek kullanımlık kod (son 2 dk) bilgisayarın panosuna yalnızca kod olarak yazılır ve bildirim gösterilir. Aynı kod iki kez kopyalanmaz.
- **Ödeme kopyalama**: IBAN içeren kartlarda IBAN (boşluksuz), alıcı adı ve tutar ayrı ayrı kopyalanabilir.

### 🧼 Temiz Kopyala

- **Düz metin kopyala**: Markdown işaretlerini (`**`, `#`, liste imleri, kod blokları) temizler.
- **Tablo olarak kopyala**: Markdown tablolarını Excel/Sheets'e doğrudan yapıştırılabilir tabloya çevirir.
- **Satırları birleştir**: PDF'ten kopyalanan bölünmüş satırları birleştirir.
- **Bağlantıları temizle**: Kopyalanan bağlantılardaki izleme parametrelerini (`utm_*`, `fbclid`, `gclid`…) kaldırır.

### 🎨 Tek Tasarım

- Masaüstü uygulaması iPhone ve web ile aynı mor temaya ve koyu zemine geçti; yeşil/turkuaz vurgular kaldırıldı.
- macOS sürümü artık Developer ID ile imzalı ve Apple tarafından notarize edilmiş: ilk açılışta "geliştirici doğrulanamadı" uyarısı çıkmaz.

## [0.5.0] - 2026-05-10

### 🗑️ Toplu Silme & Drag-to-Select

Notlar ve Kütüphane bölümlerinde seçim + silme deneyimi tamamen yenilendi.

- **Anlık toplu silme**: 10.000 not seçsen bile "Sil"e basınca UI anında temizlenir — artık 200 sıralı istek yok, tek Supabase sorgusuna indirgendi.
- **Geri al (Undo)**: `confirm()` diyaloğu kalktı. Sil'e basınca notlar anında gider, alt barda 5 saniyelik "Geri al" linki çıkar.
- **Sürükleyerek seçim (Desktop)**: Checkbox'a mouse-down yapıp sürükle — üstünden geçtiğin kartlar otomatik seçilir.
- **Dokunarak seçim (Mobil/Web)**: Bir karta 400ms basılı tut → seçim moduna girer + parmağı aşağı sürükle → birden fazla öğe seçilir.
- **Yapışkan Sil butonu**: Liste ne kadar aşağı kaydırılırsa kaydırılsın Sil butonu artık her zaman görünür (sidebar/ekranın altına sabitlendi).
- **Performans**: `NoteCard` ve `ClipboardCard` `React.memo` ile sarıldı; "Tümünü Seç" tıklandığında artık donmuyor.
- **Web/Mobil**: `apps/web` uygulamasına da tam çoklu seçim, uzun basış ve toplu silme eklendi.

## [0.3.3] - 2025-05-01

### 🔔 Update Notification Banner
- Non-intrusive banner at the top of the app shows when a new version is available, downloading, or ready to install.
- **Available**: amber bar with version number — download starts automatically in background.
- **Downloading**: progress bar with percentage.
- **Ready**: green bar with "Yeniden Başlat" button — one click to install.
- Dismissible per session; reappears when a newer update is detected.

### 📝 Note Titles (Web)
- Web app now shows a title input above the content editor.
- Auto-saves with 400ms debounce — no save button needed.
- Note list shows title (or first line of content as fallback).
- Syncs in real-time with desktop app titles.

### 🐛 Bug Fixes (from v0.3.2.x patches)
- **Ghost notes**: `deleteNote` now uses `count: 'exact'` to detect silent RLS failures; falls back to workspace-member RPC for notes created in previous anonymous sessions.
- **Windows tray icon**: `tray-icon.png/.ico` now included in `extraResources` for packaged builds; Windows uses `.ico` for native rendering quality.
- **autoMirrorClipboard**: Added diagnostic logs to pinpoint why mirror is skipped; setting description updated to note it must be enabled on each device separately.
- **userId fix**: `clipboardFromRow` / `noteFromRow` now correctly maps `created_by` to `userId` instead of `workspace_id`.

## [0.3.2] - 2025-05-01

### 🔄 OS Clipboard Auto-Mirror (Opt-in)

The headline feature: when enabled in Settings, items copied on **any** paired device are written directly to *this* device's OS clipboard. Hit `Cmd/Ctrl+V` and paste — no need to find the item in the library first.

- **Setting**: `Cihazlar arası otomatik panoya yaz` (Settings → Pano)
- **Default**: OFF — opt-in only. Auto-mirror replaces the user's local clipboard whenever a remote copy arrives, so we never enable it without consent.
- **Security**: Items flagged as sensitive (passwords, JWTs, API keys, IBANs, phone numbers, emails) are *never* mirrored regardless of the setting.
- **Loop prevention**: `clipboard.copy()` now refreshes the polling watermark for every content type (text/image/rich-text), so writes from the mirror don't get re-broadcast back to the source device.

### ⚡ Faster Source Detection
- Clipboard polling: 200ms → **100ms** (avg detection latency 50ms; CPU cost negligible).

### 🛡️ Reliability — Eventual Consistency
A backgrounded tray-app or a sleeping laptop missing broadcasts no longer means a stale list. Both desktop and web clients now:

- **High-water cursor** (`lastClipEventAt` / `lastNoteEventAt`) updated on every realtime event.
- **Replay on reconnect**: when a channel transitions to `SUBSCRIBED`, fetch all rows newer than the cursor and emit them through the normal upsert pipeline. Idempotent — safe even if no events were missed.
- **Single debounced reconnect**: when multiple channels fail at once (typical network blip), we fire one reconnect attempt instead of N parallel ones.
- **Heartbeat**: 25s no-op broadcast keeps the WebSocket alive past Supabase's 60s idle timeout and macOS power-save schedules.

### 🔧 Internal
- `connection:state` events emitted from the desktop Supabase service for future UI indicators.
- Auto-mirror migration in settings store: existing users upgrading from <0.3.2 default to OFF.

---

## [0.3.1] - 2025-05-01

### ⚡ Instant Sync (Telegram-like)

The flagship change: **sub-50ms cross-device synchronization**. Actions now propagate to every paired device almost instantly, even if the other app is minimized, in the background, or the screen is locked.

#### Architecture
- **Hybrid sync layer** — every CRUD operation now fires on two parallel channels:
  - **Broadcast channel** (`sync-<workspace>`): direct WebSocket pub/sub, no database round-trip. Typical latency: **10–50ms**.
  - **postgres_changes** (existing): durable backstop via WAL replication. Catches anything the broadcast missed.
- **Eventual consistency**: broadcasts are fire-and-forget; the DB write is the source of truth. Both handlers are idempotent so duplicate delivery is safe.

#### Covered operations
Electron desktop **and** web app both emit and listen for:
- `clip:upsert` — new clipboard item, re-copy (touch), pin toggle, AI enrichment
- `clip:deleted` — single and bulk delete
- `note:upsert` — create, update, pin, AI enrichment
- `note:deleted` — single and bulk delete

#### Supporting changes
- Supabase Realtime `eventsPerSecond` raised from default 10 → 100 on both desktop and web clients (no more socket-level throttling on bulk operations or rapid typing).
- `self: false` on broadcast config + per-process `clientId` tag means devices never process echoes of their own broadcasts.
- Removed `document.visibilityState === 'visible'` guard on the reconciliation interval on both clients — when a tab/window is hidden we still catch up in the background. Interval relaxed from 10s → 15s since broadcasts cover the hot path.
- Auto-retry on broadcast channel errors (2s backoff) matching the existing postgres_changes retry.

### Result
Delete a note on your Mac → it's gone from your Windows app and browser tab within ~30ms, whether or not those windows are in focus. Copy something on Windows → it appears in Mac's QuickPaste instantly.

---

## [0.3.0] - 2025-05-01

### ✨ New Features

#### Instant Real-time Sync (Priority)
- Clipboard polling interval reduced from 700ms to 200ms (3.5x faster detection)
- Optimized Supabase realtime channels with broadcast acknowledgment
- Auto-retry on connection errors for reliable sync across devices
- Changes propagate to all paired devices almost instantly

#### macOS Menubar Mode (Like Maccy)
- App now runs exclusively in the menubar (top panel)
- Dock icon is hidden (`LSUIElement: true`)
- Clean, native macOS menubar experience
- Click menubar icon to open library window

#### Windows System Tray Optimization
- Fixed tray icon visibility issue (now uses proper 16x16 sizing)
- App runs only in system tray (hidden from taskbar)
- Close button minimizes to tray instead of quitting
- Click tray icon to restore window

#### Multi-Select Bulk Deletion
- New checkbox selection system for both Clipboard and Notes
- "Select All" button to quickly select all visible items
- "Delete Selected" button for bulk operations
- Optimistic UI: items disappear immediately, then deleted from backend
- Shows count of selected items

### 🐛 Bug Fixes

#### Browser Notes Reliability
- Fixed flickering when deleting notes via realtime sync
- Fixed "saving..." text appearing incorrectly
- Proper handling of `deleted` flag in store updates
- Notes now sync instantly without visual glitches

### 🔧 Improvements
- Improved clipboard change detection responsiveness
- Better realtime channel error handling with automatic reconnection
- Enhanced UI feedback during bulk operations

---

## [0.2.10] - Previous

- Windows Store packaging configuration
- Smart download button with OS detection
- Privacy policy page
- Icon generation script for Store assets

---

## [0.4.0] - Coming Soon

### Planned Features
- **Note Titles**: Add title field to notes in browser and desktop apps
- **AI Summarization**: Summarize notes with AI and save as new note
- **Database Encryption**: Encrypt note content at rest, decrypt on read
- **File Support**: Import txt, md, and Excel files to clipboard
- **Browser Clipboard Capture**: Research browser extension for web app

Stay tuned! 🚀
