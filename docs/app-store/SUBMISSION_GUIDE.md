# Snipotter — App Store / Mac App Store Gönderim Rehberi

Hazırlanma tarihi: 2026-11-08. Bu rehber kod değiştirmez; gerçek imzalama, App Store Connect işlemleri ve gönderim **kullanıcı tarafından** yapılır. Apple gereksinimleri web aramasıyla doğrulandı; Apple'ın bazı sayfaları (özellikle ekran görüntüsü ölçüleri, 4.8) için ikincil kaynak kullanıldı ve ✱ ile işaretlendi — gönderimden önce resmi sayfadan teyit edin.

## 0. Hızlı özet

| Konu | Karar |
|---|---|
| iOS uygulaması | Capacitor 8 (`apps/web/ios`), Bundle ID `com.snipotter.app` (`apps/web/capacitor.config.ts:4`, `project.pbxproj:321,342`) |
| macOS uygulaması | Electron (kök), `appId` `com.snipotter.app` (`electron-builder.json:2`), kategori `public.app-category.productivity` (`:20`) |
| Universal purchase | Öneri: **aynı Bundle ID ile tek App Store Connect kaydı** (iOS + macOS), bkz. §3 |
| Team ID | `3PDY9R5UKT` (`project.pbxproj:221,284`) — hesabınızla eşleştiğini doğrulayın |
| Giriş yöntemi | Yalnızca anonim Supabase oturumu (`apps/web/src/lib/api.ts:79`, `electron/main/supabase.ts:237`) → Sign in with Apple (4.8) gerekmez |
| Kritik risk | Gömülü AI API anahtarları (§9-R1), hesap/veri silme (§9-R2), iOS otomatik pano okuması (§9-R3), MAS sandbox (§9-R4) |

## 1. Güncel Apple gereksinimleri (doğrulanmış)

| # | Gereksinim | Özet | Kaynak |
|---|---|---|---|
| 1 | **Xcode / SDK** | 28 Nisan 2026'dan beri App Store Connect'e yüklenen uygulamalar Xcode 26+ ve iOS/iPadOS 26 SDK ile derlenmeli. Ayrıca iOS/iPadOS uygulamalarının dağıtım hedefi iOS 13+ olmalı (Apple sayfasında 9 Eylül 2026 tarihli madde; durumunu sayfadan teyit edin). Projede hedef 15.0 → uygun. | https://developer.apple.com/news/upcoming-requirements/ |
| 2 | **Privacy manifest** | `PrivacyInfo.xcprivacy`: toplanan veri tipleri + "required reason API" bildirimi (UserDefaults, dosya zaman damgası, disk alanı, sistem açılış zamanı vb.). 1 Mayıs 2024'ten beri yeni/güncellenen uygulamalar için zorunlu; SDK'lar manifest + imza içermeli. Capacitor 8 kendi manifest'ini taşır, uygulama düzeyinde manifest eklenmeli. | https://developer.apple.com/documentation/bundleresources/privacy-manifest-files · https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api · https://developer.apple.com/news/?id=3d8a9yyh · https://capacitorjs.com/docs/ios/privacy-manifest |
| 3 | **App Privacy (beslenme etiketi)** | App Store Connect'te veri tipleri, bağlantı (linked), izleme (tracking) ve amaç bildirimi zorunlu; gizlilik politikası URL'si zorunlu. Tablo: METADATA.md §6. | https://developer.apple.com/app-store/app-privacy-details/ · https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy |
| 4 | **Hesap silme (5.1.1(v))** | Hesap oluşturmayı destekleyen uygulamalar silmeyi uygulama içinden başlatma imkânı sunmalı (30 Haziran 2022'den beri). Sign in with Apple kullanılıyorsa token iptali (REST API) gerekir. | https://developer.apple.com/support/offering-account-deletion-in-your-app · https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion · https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage |
| 5 | **Sign in with Apple (4.8)** ✱ | Birincil kimlik için üçüncü taraf/sosyal giriş sunan uygulamalar eşdeğer gizlilik özellikli bir giriş de sunmalı. Snipotter anonim oturum kullanır; e-posta/Google/GitHub girişi eklenirse 4.8 devreye girer. | https://developer.apple.com/app-store/review/guidelines/#login-services |
| 6 | **Export compliance** | `ITSAppUsesNonExemptEncryption` Info.plist anahtarı; yalnızca Apple işletim sistemi şifrelemesi / standart HTTPS kullanılıyorsa `NO`. Şifreleme belgesi gerekirse App Store Connect `ITSEncryptionExportComplianceCode` verir. Yanlış `NO` yasal risktir: Electron (Chromium/BoringSSL), Supabase TLS ve Web Crypto kullanımı için "standart şifreleme muafiyeti" sorularını App Store Connect'te yanıtlayın; ABD/Fransa belgelendirme gereklilikleri için hukuki teyit önerilir. | https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations · https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance |
| 7 | **Ekran görüntüleri** ✱ | iPhone: en az bir 6.9" set (1320×2868, 1290×2796 veya 1260×2736 dikey); 6.9" verilmezse 6.5" (1284×2778 / 1242×2688) gerekir. iPad'de çalışan uygulama için 13" set (2064×2752 veya 2048×2732). Mac: 16:10 — 1280×800, 1440×900, 2560×1600 veya 2880×1800. Apple eksik boyutları ölçekler. | https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications |
| 8 | **MAS sandbox** | Mac App Store uygulamaları App Sandbox'ta çalışmalı; yalnızca Electron'un MAS derlemesi sandbox'ta çalışır; "Apple Distribution" sertifikası + gömülü provisioning profile gerekir; entitlements dosyasında `com.apple.security.app-sandbox`. | https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide · https://developer.apple.com/documentation/security/app-sandbox · https://developer.apple.com/documentation/bundleresources/entitlements |
| 9 | **App Review Guidelines** (4.2 minimum işlevsellik, 2.5.x, 5.1.x) | WebView sarmalayıcı uygulamalar 4.2'den reddedilebilir; yerel özellik + çevrimdışı çalışma kanıtlanmalı. | https://developer.apple.com/app-store/review/guidelines/ |
| 10 | **TestFlight / yükleme** | App Store Connect → TestFlight; Xcode Organizer, `xcrun altool`/`iTMSTransporter` veya Transporter uygulaması ile yükleme. | https://developer.apple.com/testflight/ · https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview · https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds |

## 2. Kimlikler

| Öğe | Değer / not |
|---|---|
| iOS Bundle ID | `com.snipotter.app` (explicit App ID) |
| macOS Bundle ID | `com.snipotter.app` (universal purchase için aynı) — Developer portal'da App ID'ye iOS ve macOS platformlarını işaretleyin |
| Yardımcı süreçler (Electron) | `com.snipotter.app.helper`, `.helper.GPU`, `.helper.Renderer`, `.helper.Plugin` — electron-builder otomatik üretir; ayrı App ID gerekmez |
| App Group | Önerilen: `group.com.snipotter.app` (iOS: Developer portal → Identifiers → App Groups). **macOS (MAS)** için App Group adı, takım öneki ile başlamalıdır: `3PDY9R5UKT.com.snipotter.app` (macOS'ta `application-groups` bu biçimi kullanır; iOS ise `group.` önekini). Yeni bir paylaşım uzantısı/widget eklenmedikçe App Group isteğe bağlıdır; MAS mühendisinin entitlements'ında `application-groups` varsa aynı kimlik kaydedilmeli. |
| Team ID | `3PDY9R5UKT` |
| Capabilities | iOS: (şimdilik ek capability gerekmiyor; App Group yalnızca uzantı eklenirse). macOS: App Sandbox, Outgoing Connections (Client), App Groups (kullanılıyorsa) |

## 3. Universal purchase değerlendirmesi (iOS + macOS)

- **Ne sağlar:** Aynı Bundle ID ile iOS ve macOS sürümleri tek App Store Connect kaydında, tek ürün sayfası ve tek satın alma/ücretsiz indirme olarak sunulur. Uygulama ücretsiz olduğundan "satın alma" yerine tek kayıt ve ortak ürün sayfası yararı vardır (aynı Apple Kimliğiyle her iki platforma tek dokunuşla indirme).
- **Önerilen:** Kodda her iki platform da zaten `com.snipotter.app` kullanıyor (`capacitor.config.ts:4`, `electron-builder.json:2`) → universal purchase **uygun**. Aynı App kaydına macOS platformu eklenir (App Store Connect → uygulama → "+" → macOS).
- **Sınırlamalar / dikkat:**
  1. Bundle ID'yi sonradan değiştirmek mümkün değildir; macOS'ta farklı bir ID istiyorsanız kaydı **bugün** ayırın. Sonradan birleştirme yoktur.
  2. Her platformun sürüm numarası, yaş derecesi, ekran görüntüleri ve App Privacy yanıtı ortak/paylaşımlıdır — iki platformda farklı veri davranışı varsa (MAS: telemetri; iOS: telemetri; AI yalnızca App Store dışı DMG'de) en geniş kapsamı bildirin.
  3. Sürümler bağımsız yayınlanabilir; macOS incelemesi iOS'tan ayrı yürür (MAS sandbox sorunları iOS'u engellemez).
  4. Electron sürümü şimdilik `0.7.1`, iOS `0.5.3` (build 1); universal purchase sürüm eşitliği gerektirmez.
  5. Masaüstünün web sitesi/DMG dağıtımı (notarize edilmiş, `build:mac`) ayrı bir kanaldır; MAS ve DMG iki ayrı yapı olarak sürdürülmelidir.
- Kaynak: https://developer.apple.com/help/app-store-connect/manage-your-apps-platforms/offer-universal-purchase

## 4. Sertifikalar ve profiller

| Sertifika | Kullanım | Nerede |
|---|---|---|
| Apple Development | Cihazda hata ayıklama (iOS), `mas-dev` yerel test (macOS) | Xcode → Settings → Accounts |
| Apple Distribution | iOS App Store/TestFlight arşivi **ve** macOS `.app` (MAS) imzası | Developer portal → Certificates |
| Mac Installer Distribution | MAS `.pkg` imzası (electron-builder `mas` hedefi `.pkg` üretir) | Developer portal → Certificates |
| (Dışarıda dağıtım) Developer ID Application/Installer | Yalnızca MAS dışı DMG; MAS için kullanılmaz | — |

Provisioning profile'lar (Developer portal → Profiles):
1. **iOS App Store** profili: `com.snipotter.app`, Apple Distribution. Xcode "Automatically manage signing" ile otomatik üretebilir.
2. **macOS App Store** profili (Mac App Store Connect): `com.snipotter.app` → electron-builder'a `provisioningProfile` olarak verilir (ortam değişkeni ile; dosya repoya konmaz).
3. **macOS Development** profili: `mas-dev` testleri için, cihaz UDID'leri kayıtlı olmalı.
Kaynak: https://developer.apple.com/help/account/manage-certificates/certificates-overview · https://developer.apple.com/help/account/manage-profiles/create-an-app-store-provisioning-profile

## 5. App Store Connect kaydı (sırasıyla)

1. Developer Program üyeliği aktif (yıllık ücretli) — https://developer.apple.com/programs/
2. Identifiers: `com.snipotter.app` oluştur (iOS + macOS).
3. App Store Connect → Apps → "+" → New App: Platforms **iOS** (+ **macOS**), Name `Snipotter`, Primary language `Turkish`, Bundle ID `com.snipotter.app`, SKU `snipotter-001`. (İsim çakışırsa alt başlıkla ayırt edin: "Snipotter: Pano & Notlar".)
4. App Information: Kategori, içerik hakları, yaş derecesi anketi, Gizlilik Politikası URL'si (zorunlu), Destek URL'si.
5. App Privacy: METADATA.md §6'daki tablo ile doldur.
6. Pricing: Ücretsiz. (Uygulama içi satın alma yoksa vergi/banka formları gerekmez; ücretli plan eklenirse IAP zorunluluğu — guideline 3.1.1 — gündeme gelir.)
7. Sürüm sayfası: ekran görüntüleri, açıklama, anahtar kelimeler, "What's New", inceleme notu, demo bilgisi (§8).
8. Export compliance: `ITSAppUsesNonExemptEncryption=false` (iOS mühendisi ekliyor); App Store Connect sorularını standart şifreleme muafiyetiyle yanıtla. **macOS'ta Electron/Chromium kendi şifreleme kodunu (BoringSSL) taşır**; bu yüzden macOS yapısı için şifreleme yanıtı iOS'tan ayrı değerlendirilmeli, `ITSAppUsesNonExemptEncryption` değeri macOS `Info.plist`'inde (electron-builder `extendInfo`) ayrıca ve bilinçli verilmelidir.
9. Build seç → "Add for Review" → "Submit".

## 6. Derleme ve yükleme

### iOS (Xcode 26+)
```bash
cd apps/web
npm run ios:bundle                  # next build && cap sync ios
npm run ios:open                    # Xcode'u açar
```
Xcode: App hedefi → Signing & Capabilities → Team seçili, bundle id doğru → Product → Destination: **Any iOS Device (arm64)** → Product → **Archive** → Organizer → Distribute App → **App Store Connect → Upload**.
Her yüklemede `CURRENT_PROJECT_VERSION` (build) artırılmalı (`project.pbxproj:312,334`).

Komut satırı alternatifi:
```bash
xcodebuild -project apps/web/ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Snipotter.xcarchive archive
xcodebuild -exportArchive -archivePath build/Snipotter.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/export
```
(`ExportOptions.plist`: `method=app-store-connect`, `teamID=3PDY9R5UKT`.)

### macOS (MAS)
`package.json` scriptleri `build:mas` ve `build:mas-dev` (`scripts/build-mas.cjs`). Provisioning profile yolu ortam değişkeniyle verilir (`scripts/build-mas.cjs:18-19,55`); profil dosyası repoya konmaz:
```bash
MAS_PROVISIONING_PROFILE=/yol/Snipotter_MAS.provisionprofile npm run build:mas
MAS_DEV_PROVISIONING_PROFILE=/yol/Snipotter_Dev.provisionprofile npm run build:mas-dev
```
İmza kimliği otomatik bulunur (Apple Distribution / Apple Development). Birden fazla kimlik varsa `CSC_NAME` ile açıkça verin; örnek: `CSC_NAME="Apple Distribution: MEHMET GULENC (3PDY9R5UKT)" MAS_PROVISIONING_PROFILE=… npm run build:mas` (sertifika adını Anahtar Zinciri'ndekiyle birebir eşleyin). `electron-builder.json` `mas.identity` bilinçli olarak boş string'dir; `null` olsaydı imza atlanırdı. `build/entitlements.mas.plist:16-18` içindeki App Group `3PDY9R5UKT.com.snipotter.app` olup §2'deki macOS App Group biçimiyle ve `Info.plist` `ElectronTeamID` ile uyumludur; aynı kimlik Developer portal'da App ID'ye eklenmeli.
Çıktı `.pkg` (Mac Installer Distribution ile imzalı) → Transporter ile yüklenir. `mas-dev` çıktısı yalnızca yerel testtir, Apple'a yüklenemez.

### Transporter
Mac App Store'dan **Transporter** → Apple ID ile giriş → `.pkg` (macOS) veya `.ipa` (iOS) sürükle → Deliver. Alternatif: `xcrun altool --upload-package` / `xcrun iTMSTransporter`. Yükleme sonrası 10–30 dk "Processing" beklenir. Kaynak: https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds

## 7. TestFlight

1. Build işlendikten sonra TestFlight → **Export Compliance** sorusu (anahtar varsa çıkmaz).
2. **Internal testing** (en fazla 100 kişi, App Store Connect rolü olan) — inceleme gerekmez.
3. **External testing** — ilk build için Beta App Review gerekir; test bilgisi + demo notu (§8) ekleyin.
4. macOS için TestFlight desteklenir (MAS `.pkg` yüklemesi).
5. Çökme/geri bildirim: Xcode Organizer → Crashes.

## 8. İnceleme notu ve demo hesabı

Snipotter'da e-posta/parola hesabı **yok**; kullanıcı anonim Supabase oturumu alır (`electron/main/supabase.ts:237`, `apps/web/src/lib/api.ts:79`). Bu nedenle **demo hesabı gerekmez**; ancak App Store Connect "Sign-in required" işaretlenmemeli. İnceleme notu (EN, App Review Information → Notes):

> Snipotter is a clipboard history and notes app. No account or sign-in is required: on first launch the app creates an anonymous session automatically (Supabase anonymous auth). There are no login credentials to provide.
>
> How to test: (1) Open the app and go to **Settings → "Panodan kaydet" (save from clipboard)** after copying some text in another app. (2) Open the Library tab to see saved items; pin or delete an item. (3) Open Notes and create a note with the rich-text editor. (4) To sync with another device, open Settings → Devices, generate a pairing code and redeem it on the second device (the desktop app is optional; the iOS app is fully usable on its own).
>
> Clipboard access: the app reads the clipboard only when you explicitly choose to save it. Data is stored in your private workspace and is never sold or used for tracking. An in-app option to delete all your data and reset your anonymous identity is available in Settings → "Hesabımı ve verilerimi sil" (delete my account and data).
>
> The macOS build runs inside App Sandbox; features that need Accessibility/Apple Events (auto-paste) are disabled in the Mac App Store build.

⚠ Düğme metinleri `Settings.tsx:208,230` ile eşleşir (UI Türkçe; notta İngilizce karşılıkları verildi). `delete_own_account` migration'ı production'a uygulanmadan göndermeyin (bkz. R2).

Türkçe not (isteğe bağlı): "Hesap/giriş gerekmez, uygulama ilk açılışta anonim oturum açar. Panoya yalnızca kullanıcı kaydet dediğinde erişilir."

## 9. Red riskleri ve önlemler

| # | Risk | Kanıt (dosya:satır) | Önlem |
|---|---|---|---|
| **R1** | **Gömülü AI API anahtarları** (Anthropic + Gemini; MAS'ta boşaltılır ve AI arayüzü gizlenir, risk asıl olarak App Store dışı DMG kanalında kalır) uygulama paketine gömülür; `MAIN_VITE_*` Vite derlemesinde istemciye statik olarak yazılır → paketten çıkarılabilir, kötüye kullanım/maliyet ve gizlilik riski. Ayrıca pano içeriği (ilk 4.000 karakter) üçüncü taraf AI'a gönderilir (`ai.ts:148`) → App Privacy ve Guideline 5.1.2(i) (üçüncü tarafla veri paylaşımı için açık rıza) yükümlülüğü. | `electron/main/index.ts:64-67`, `electron/main/env.d.ts:6-7`, `electron/main/ai.ts:58-62,148-151,173-175`; `.env.example` başlığı bu riski zaten not ediyor | (1) MAS derlemesinden anahtarları çıkarın (#149'da yapılıyor) ve `out/` içinde `grep -r "sk-ant"` / `AIza` ile kanıtlayın. (2) Uzun vadede AI çağrılarını sunucu tarafı proxy'ye (Cloudflare Worker / Supabase Edge Function, kullanıcı başına kota) taşıyın. (3) AI özelliği varsa kullanıcıya açık onay + ayarlardan kapatma ekleyin; metadata'da "pano içeriği AI sağlayıcılarına gönderilir" açıkça belirtilsin. (4) iOS paketinde zaten AI kodu/anahtarı yok — `apps/web` `NEXT_PUBLIC_*` yalnızca Supabase public anon anahtarı içerir (`apps/web/.env.production`). **Yayımlanmış anahtarlar sızmış varsayılıp döndürülmelidir (rotate)** — önceki DMG/GitHub sürümlerinde gömülü olabilir. |
| **R2** | **Hesap/veri silme (5.1.1(v))** — anonim oturum teknik olarak bir hesaptır ve sunucuda kalıcı veri (pano, not) tutulur. **Durum (#148 sonrası): iOS'ta UI + RPC eklendi**; masaüstünde yalnızca `signOut` var (`electron/main/supabase.ts:254`). | UI: `apps/web/src/components/Settings.tsx:79-83,228-230` ("Hesabımı ve verilerimi sil"); istemci: `apps/web/src/lib/api.ts:90-97` (`rpc('delete_own_account')`, hedef ID kabul etmez, `auth.uid()` kullanır); SQL: `supabase/migrations/0008_delete_own_account.sql` | **Manuel adım (zorunlu):** migration `supabase/migrations/` altında; **Supabase production'a uygulanmalı**, aksi halde RPC hata verir ve inceleme reddedilir. TestFlight'ta silme akışını gerçek cihazda deneyin. Masaüstü MAS sürümü için de aynı akış önerilir (universal purchase tek kayıt). Gizlilik politikasında silme/saklama süresi yazılsın. |
| **R3** | **iOS otomatik pano okuması** — eskiden açılışta/`appStateChange`'de `Clipboard.read()` çağrılıyordu (iOS 16+ "Allow Paste" bildirimi). **Durum: çözüldü** — okuma yalnızca Ayarlar → "Panodan kaydet" dokunuşuyla. | `apps/web/src/lib/mobile.ts:180-181` (`saveClipboardFromUserAction`), `apps/web/src/components/Settings.tsx:96,208` | Son kodda `grep "Clipboard.read"` ile tek çağrı kaldığını teyit edin. |
| **R4** | **MAS sandbox uyumsuzlukları** — otomatik yapıştırma (AppleEvents/Accessibility), `osascript`, auto-updater (`electron-updater`), login item sandbox'ta çalışmaz veya reddedilir. | `electron/main/clipboard.ts:355` (osascript), `electron/main/windows.ts:215,264` (osascript), `electron/main/updater.ts:25,78` (autoUpdater; MAS'ta uygulama güncellemeyi yalnızca Mac App Store yapar — Guideline 2.4.5(vii)), `electron-builder.json` (`mas` hedefi yok) | #149: `process.mas` koşulları; osascript yerine yerel NSPasteboard (Electron `clipboard` API) veya `com.apple.security.temporary-exception` **kullanma** (reddedilir). Updater MAS'ta kapalı olmalı. |
| **R5** | **Guideline 4.2 (minimum işlevsellik)** — Capacitor sarmalayıcı. Paketli çevrimdışı varlık (`webDir: 'out'`, `capacitor.config.ts:8`; sunucu URL'si yok) olumlu. | `apps/web/capacitor.config.ts:6-8` | Native özellikleri vurgulayın: yerel pano (kullanıcı eylemiyle), Preferences, StatusBar/Splash; Share Sheet iOS'ta yok; incelemede çevrimdışı çalışmayı gösterin. Android Play Store için de aynı not geçerli. |
| **R6** | **Privacy manifest** — **Durum: eklendi** (`NSPrivacyTracking=false`; UserDefaults `CA92.1`; UserID + OtherUserContent + PhotosorVideos linked/AppFunctionality; DeviceID + ProductInteraction linked/Analytics — 5 türün tamamı linked=true). | `apps/web/ios/App/App/PrivacyInfo.xcprivacy:5-80`, `Info.plist:25-26` (`ITSAppUsesNonExemptEncryption=false`) | Dosyanın Xcode hedefinin *Copy Bundle Resources* aşamasında olduğunu doğrulayın; yüklemeden sonra "ITMS-91053/91056" uyarısı gelirse deklarasyonları tamamlayın. |
| **R7** | **App Privacy yanıtı yanlış** — telemetri (cihaz UUID + platform) ve pano içeriği toplanıyor. | METADATA.md §6 | Tabloyu birebir uygulayın. `deviceId` "Device ID" veri türüdür; amaç "Analytics", "Linked to You" (cihaz UUID sunucuda ham saklanır). |
| **R8** | **Üçüncü taraf giriş eklenirse 4.8** — şu an yok. | `grep signInWith(OAuth` boş | E-posta/Google girişi eklenirse Sign in with Apple ekleyin. |
| **R9** | **Gizlilik politikası/destek URL'si yok olabilir** | — | `https://snipotter.com/privacy` ve `/support` yayında olmalı (App Store Connect zorunlu alanlar). |
| **R10** | **Deployment target / SDK** | `project.pbxproj:239` 15.0 | Xcode 26 ile derleyin; eski Xcode yüklemesi reddedilir. |
| **R11** | **Git durumu** — iOS projesi izlenmiyor | RELEASE_AUDIT.md §1 | Gönderim öncesi commit edin; tekrarlanabilir yapı. |
| **R12** | **ESLint çalışmıyor, apps/web testi yok** | RELEASE_AUDIT.md §2 | Gönderimi engellemez; kalite borcu. |

## 10. Gönderim öncesi kontrol listesi

- [ ] Xcode 26+ ile Release arşivi başarılı, build numarası artırıldı
- [ ] `PrivacyInfo.xcprivacy` pakette, `ITSAppUsesNonExemptEncryption=false`
- [ ] AppIcon 1024×1024 alfasız
- [ ] Hesap/veri silme akışı uygulama içinde çalışıyor
- [ ] iOS'ta otomatik pano okuma kapalı
- [ ] MAS paketinde AI anahtarı yok, auto-updater/osascript/AppleEvents kapalı
- [ ] Gizlilik politikası ve destek URL'leri canlı
- [ ] App Privacy tablosu girildi (METADATA.md §6)
- [ ] Ekran görüntüleri yüklendi (§METADATA 7)
- [ ] İnceleme notu girildi
- [ ] TestFlight iç testi geçti
- [ ] Önceden yayımlanmış API anahtarları döndürüldü

## 11. Gelecek işler (bu gönderimde kapsam dışı)

- **iOS Share Extension:** Paylaşım hedefi yalnızca Android'de var (`apps/web/src/lib/mobile.ts:8,75-105`); iOS'ta Share Extension hedefi yok. Eklenene kadar mağaza metinlerinde Share Sheet iddiası kullanılmaz. Eklendiğinde App Group (`group.com.snipotter.app`) gerekir.
- AI özelliklerinin sunucu proxy'si ve açık rıza ile MAS/iOS'a getirilmesi (R1).
- iOS telemetri kapatma anahtarı, masaüstü hesap silme, ESLint yapılandırması.
