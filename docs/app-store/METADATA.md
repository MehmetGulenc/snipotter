# Snipotter — App Store Metadata (TR / EN)

Hazırlanma: 2026-11-08. Karakter sınırları: Ad ≤ 30, Alt başlık ≤ 30, Tanıtım metni ≤ 170, Anahtar kelimeler ≤ 100 (virgülle, boşluksuz), Açıklama ≤ 4000, What's New ≤ 4000. Aşağıdaki sayılar doğrulanmıştır (§8).

## 1. Genel bilgiler

| Alan | Değer |
|---|---|
| Ad | `Snipotter` (alt başlıkla ayırt edilir; ad alınmışsa "Snipotter Pano & Notlar") |
| Bundle ID | `com.snipotter.app` (iOS + macOS, universal purchase) |
| SKU | `snipotter-001` |
| Birincil kategori | **Productivity** (Verimlilik) — macOS: `public.app-category.productivity` (`electron-builder.json:20`) |
| İkincil kategori | **Utilities** (Araçlar) |
| Fiyat | Ücretsiz, uygulama içi satın alma yok |
| Telif | `© 2026 Snipotter` (hesap sahibi adıyla güncelleyin) |
| Gizlilik politikası URL | `https://snipotter.com/privacy` (yayında olmalı) |
| Destek URL | `https://snipotter.com/support` |
| Pazarlama URL | `https://snipotter.com` |
| Diller | Türkçe (birincil), İngilizce (ABD) |
| Sürüm | iOS `0.5.3` build 1 (`apps/web/ios/App/App.xcodeproj/project.pbxproj:316-345`); macOS `0.7.1` (`package.json`) — ilk mağaza sürümü için `1.0.0` önerilir |

## 2. Yaş derecesi (2025+ yeni anket)

Önerilen sonuç: **4+**. Tüm sorulara "Yok/Hayır": şiddet, cinsel içerik, kumar, tıbbi, alkol/uyuşturucu, korku, küfür yok; "Kullanıcı tarafından üretilen içerik / sosyal paylaşım" yok — kullanıcılar yalnızca kendi özel çalışma alanlarında veri tutar, birbirleriyle içerik paylaşmaz (cihaz eşleştirme kodu aynı kişinin cihazlarını bağlar: `apps/web/src/lib/api.ts:126-140`). Sınırsız web erişimi yok (paketli uygulama). Anketteki yapay zekâ/sohbet sorusu: iOS ve MAS build'lerinde AI özelliği yoktur → **Hayır**. Kaynak: https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions

## 3. Türkçe metinler

**Ad:** Snipotter
**Alt başlık (≤30):** Pano geçmişi ve hızlı notlar
**Tanıtım metni (≤170):** Kopyaladığın her şey kaybolmasın. Panonu kaydet, notlarını yaz, cihazların arasında eşitle. Hesap açmadan, saniyeler içinde başla.
**Anahtar kelimeler (≤100):** pano,pano geçmişi,not,notlar,kopyala yapıştır,clipboard,snippet,metin,eşitleme,verimlilik

**Açıklama:**
```
Snipotter, kopyaladığın metinleri ve notlarını tek yerde toplayan sade ve hızlı bir pano geçmişi uygulamasıdır.

NEDEN SNIPOTTER?
• Panoya kopyaladığın metni tek dokunuşla kaydet, sonra istediğin zaman geri bul.
• Zengin metin editörüyle notlar yaz: başlıklar, listeler, kalın/italik, görseller.
• Sık kullandıklarını sabitle, gereksizleri sil, kütüphanende ara ve filtrele.
• Hesap oluşturmana gerek yok: uygulama ilk açılışta seni anonim olarak tanır.
• Cihazlarını eşleştirme koduyla bağla; kayıtların tüm cihazlarında güncel kalsın.
• Tamamen çevrimdışı açılır; arayüz cihazında paketli gelir.

GİZLİLİK SENDEN YANA
• Panon yalnızca sen "Panodan kaydet"e dokunduğunda okunur; arka planda izlenmez.
• Reklam yok, izleme yok, veri satışı yok.
• Ayarlar'dan hesabını ve tüm verilerini istediğin an kalıcı olarak silebilirsin.

MAC SÜRÜMÜ
• Mac'te pano geçmişin menü çubuğundan hemen elinin altında. Hızlı Yapıştır'da kaydı seç, kopyala ve Cmd+V ile yapıştır.

Geri bildirimlerin için: https://snipotter.com/support
```

**What's New (1.0):** İlk sürüm: pano geçmişi, zengin metin notlar, cihazlar arası eşitleme ve hesap/veri silme.

## 4. İngilizce (ABD) metinler

**Name:** Snipotter
**Subtitle (≤30):** Clipboard history & notes
**Promotional text (≤170):** Never lose what you copy. Save your clipboard, write notes and sync across your devices. No account needed — get started in seconds.
**Keywords (≤100):** clipboard,history,notes,copy paste,snippet,text,sync,productivity,paste,manager

**Description:**
```
Snipotter is a fast, minimal clipboard history and notes app that keeps everything you copy in one place.

WHY SNIPOTTER?
• Save text from your clipboard with one tap and find it again whenever you need it.
• Write notes with a rich-text editor: headings, lists, bold/italic and images.
• Pin favorites, delete what you don't need, search and filter your library.
• No account required: the app signs you in anonymously on first launch.
• Link your devices with a pairing code so your items stay up to date everywhere.
• Opens offline; the interface is bundled on your device.

PRIVACY FIRST
• Your clipboard is read only when you tap "Save from clipboard" — never in the background.
• No ads, no tracking, no selling your data.
• Permanently delete your account and all data at any time from Settings.

ON THE MAC
• Your clipboard history is one click away in the menu bar. In Quick Paste, pick an item, copy it and press Cmd+V to paste.

Questions or feedback: https://snipotter.com/support
```

**What's New (1.0):** First release: clipboard history, rich-text notes, cross-device sync, and in-app account and data deletion.

> Not: "Hesap/veri silme" ve "Panodan kaydet" ifadeleri yalnızca ilgili özellik yayında olduğunda kullanılabilir (`apps/web/src/components/Settings.tsx:228-230`, `:208`). **Kapsam kararı:** App Store kaydı yalnızca iOS ve MAS build'lerini kapsar; MAS'ta AI anahtarları boşaltılır ve AI arayüzü gizlenir, bu yüzden metin ve ekran görüntülerinde AI yoktur. iOS'ta Share Extension hedefi yok (paylaşım hedefi yalnızca Android: `apps/web/src/lib/mobile.ts:8,75-105`), bu yüzden Share Sheet iddiası yoktur. MAS'ta otomatik yapıştırma yoktur; Quick Paste "kopyala, Cmd+V" şeklinde çalışır.

## 5. İnceleme bilgileri

- Sign-in required: **Hayır** (anonim oturum). Demo hesabı gerekmez.
- İletişim: hesap sahibi adı, telefon, e-posta (kullanıcı doldurur).
- Notlar: SUBMISSION_GUIDE.md §8.

## 6. App Privacy tablosu (koda dayalı)

Genel: **Tracking = Hayır** (`NSPrivacyTracking=false`, `apps/web/ios/App/App/PrivacyInfo.xcprivacy:5-6`); reklam SDK'sı yok (`apps/web/package.json` bağımlılıkları: Capacitor, Supabase, Tiptap). Universal kayıt tek App Privacy yanıtı taşıdığı için iOS ve MAS (DMG hariç) davranışını kapsayan en geniş küme bildirilir.

| Veri türü (Apple) | Topluyor muyuz | Kullanıcıya bağlı | Tracking | Amaç | Kanıt (dosya:satır) |
|---|---|---|---|---|---|
| **User Content → Other User Content** (pano metni, notlar, dosya) | Evet — Supabase'e senkronlanır | Evet | Hayır | App Functionality | iOS: `apps/web/src/lib/api.ts:186-196` (`clipboard_items` okuma), `:215-230` (ekleme), `:286-340` (`notes`); manifest `PrivacyInfo.xcprivacy:35-44`. macOS: `electron/main/supabase.ts:384-420,520-560`; dosya panosu `electron/main/clipboard.ts:340-360` |
| **AI sağlayıcılarına aktarım** (Anthropic/Google) | **MAS ve iOS build'inde yok** — MAS'ta anahtarlar boşaltılır, AI arayüzü gizlenir; DMG kanalı App Store kaydının dışındadır | — | — | — | Kod: `electron/main/ai.ts:148-151,173-185` (yalnızca DMG). MAS'ta anahtar bulunmadığı `scripts/check-no-embedded-keys.cjs` ile doğrulanmalı; AI MAS'a geri eklenirse App Privacy ve 5.1.2(i) rızası gerekir |
| **Photos or Videos** (nota yapıştırılan görseller, base64 olarak nota gömülür ve senkronlanır) | Evet | Evet | Hayır | App Functionality | `apps/web/src/components/TiptapEditor.tsx:124-143` (`handlePaste` → `readAsDataURL`); manifest `PrivacyInfo.xcprivacy:47-56` |
| **Identifiers → User ID** (anonim Supabase `auth.uid`) | Evet | Evet | Hayır | App Functionality | `apps/web/src/lib/api.ts:79` (`signInAnonymously`); `electron/main/supabase.ts:226-250`; manifest `PrivacyInfo.xcprivacy:23-32` |
| **Identifiers → Device ID** (rastgele UUID, `Preferences`/electron-store) | Evet | **Evet** (hesaba bağlı değil ama cihaz UUID'si sunucuda ham saklanır → Apple'ın "linked" tanımı cihaz bağlantısını da kapsar) | Hayır | Analytics | iOS: `apps/web/src/lib/mobile.ts:160-190` (`ensureDeviceId`, heartbeat); macOS: `electron/main/telemetry.ts:36-60`; `workers/heartbeat/src/index.ts:116-130` (ham `device_id` saklama); manifest `PrivacyInfo.xcprivacy:59-68` |
| **Usage Data → Product Interaction** (uygulama açılışı sayısı, platform, sürüm, dil) | Evet | **Evet** (aynı `device_id` ile günlük kayıt) | Hayır | Analytics | `apps/web/src/lib/mobile.ts:44-50,176-195`; `electron/main/telemetry.ts:15-27,60-70`; manifest `PrivacyInfo.xcprivacy:71-80` |
| **Other Data** — cihaz adı (eşleştirme etiketi) | Evet | Evet | Hayır | App Functionality | `apps/web/src/lib/api.ts:128,148,169` (`p_device_name`); `electron/main/supabase.ts:299,324` |
| Contact Info (e-posta, ad) | **Hayır** — e-posta/parola girişi yok | — | — | — | `grep "signInWith(OAuth\|signUp("` sonuçsuz; yalnızca anonim oturum |
| Location, Contacts, Photos, Health, Financial, Browsing/Search History, Diagnostics (çökme günlüğü), Purchases | **Hayır** | — | — | — | İlgili Capacitor eklentileri yok (`apps/web/package.json`: app, clipboard, device, preferences, share, splash-screen, status-bar) |

Notlar:
1. iOS telemetri heartbeat'inde kullanıcı kapatma seçeneği **yok** (`mobile.ts:50` koşulsuz); masaüstünde `telemetryEnabled` ile kapatılabilir (`electron/main/telemetry.ts:60`, `src/pages/Settings.tsx:130`). Hesaba/e-postaya bağlı olmasa da cihaz UUID'si sunucuda ham saklandığı için (`workers/heartbeat/src/index.ts:116-130`) **"Linked to You"** bildirilir (iOS mühendisi manifest'i böyle düzeltti; ilk taslağımdaki "Not linked" yanlıştı); yine de Ayarlar'a iOS kapatma anahtarı eklenmesi önerilir.
2. Pano/not verisi Supabase'te saklanır; silme akışı: `Settings.tsx:79-83` + `api.ts:90-97` + `0008_delete_own_account.sql` (production'a uygulanmalı).
3. Heartbeat IP saklamaz (`telemetry.ts` açıklaması); sunucu tarafı için gizlilik politikasında belirtilmeli.
4. App Store Connect "Data Used to Track You" → boş; "Data Linked to You" → Other User Content, Photos or Videos, User ID, Device ID, Product Interaction, Other Data; "Data Not Linked to You" → boş. Manifest'teki 5 türün tamamı `linked=true`, `tracking=false` ile uyumludur.
5. Privacy manifest ile App Store Connect yanıtları birbirini tutmalı (Apple bunları karşılaştırır). Manifest (5 tür: UserID, OtherUserContent, PhotosorVideos, DeviceID, ProductInteraction; `PrivacyInfo.xcprivacy:24,36,48,60,72`) cihaz adını (Other Data) listelemiyor; App Store Connect'e Other Data eklenecekse manifest'e `NSPrivacyCollectedDataTypeOtherDataTypes` (linked, AppFunctionality) eklenmesi iOS mühendisine önerilir.

Kaynak: https://developer.apple.com/app-store/app-privacy-details/

## 7. Ekran görüntüleri

Mevcut script'ler (`scripts/gen-screenshots.py`, `scripts/clean-screenshot.py`, `scripts/gen-feature.py`) Play Store içindir (çıktı `~/Desktop/play-store-assets`); App Store ölçülerine uyarlanmalı. Metin üzerinde cihaz çerçevesi kullanılabilir ancak ekran içeriği gerçek uygulamayı göstermelidir (Guideline 2.3.3). Ölçüler için bkz. SUBMISSION_GUIDE §1 madde 7 (✱ teyit edin).

| # | Platform | Boyut (px) | Sahne | TR başlık | EN başlık |
|---|---|---|---|---|---|
| 1 | iPhone 6.9" | 1320×2868 | Kütüphane — pano kayıtları listesi | Kopyaladığın her şey burada | Everything you copy, in one place |
| 2 | iPhone 6.9" | 1320×2868 | Panodan kaydet (Ayarlar) | Tek dokunuşla kaydet | Save with one tap |
| 3 | iPhone 6.9" | 1320×2868 | Zengin metin not editörü | Zengin metin notlar | Rich-text notes |
| 4 | iPhone 6.9" | 1320×2868 | Sabitle / ara / filtrele | Bul, sabitle, düzenle | Find, pin, organize |
| 5 | iPhone 6.9" | 1320×2868 | Cihaz eşleştirme kodu | Cihazların arasında eşitle | Sync across your devices |
| 6 | iPhone 6.9" | 1320×2868 | Ayarlar — gizlilik ve hesabı sil | Gizliliğin senin elinde | Your privacy, your control |
| 7–9 | iPad 13" (**zorunlu**, `TARGETED_DEVICE_FAMILY=1,2`) | 2064×2752 | 1, 3, 5 sahnelerinin iPad düzeni | — | — |
| 11 | Mac | 2880×1800 (veya 2560×1600) | Ana pencere — Kütüphane | Pano geçmişin masaüstünde | Your clipboard history on the Mac |
| 12 | Mac | 2880×1800 | Hızlı Yapıştır — seç, kopyala, Cmd+V | Seç, kopyala, Cmd+V ile yapıştır | Pick, copy, press Cmd+V |
| 13 | Mac | 2880×1800 | Zengin metin notlar | Zengin metin notlar | Rich-text notes |
| 14 | Mac | 2880×1800 | Ayarlar — Gizlilik | Gizlilik kontrolleri | Privacy controls |

Kurallar: PNG/JPEG, alfa/saydamlık yok, 1–10 görüntü/set; uygulama iPad'i destekliyor (`TARGETED_DEVICE_FAMILY = "1,2"`, `project.pbxproj:329,350`) → **iPad 13" seti zorunludur**; yalnızca iPhone yapılacaksa önce hedef aileyi `1` yapın; **gerçek e-posta, kişisel veri, API anahtarı içeren kayıt göstermeyin** (örnek verilerle çekin); Mac görüntülerinde pano içeriği hassas olmamalı. Uygulama simgesi 1024×1024 alfasız (#148 doğruladı).

Doğrulama komutları: `sips -g pixelWidth -g pixelHeight dosya.png`, `sips -g hasAlpha dosya.png`.

## 8. Karakter sayısı doğrulaması

Ölçüm (`python3`): TR alt başlık 28/30, tanıtım 130/170, anahtar kelime 89/100, açıklama 1016/4000; EN alt başlık 25/30, tanıtım 132/170, anahtar kelime 79/100, açıklama 993/4000. Tümü limit içinde.
