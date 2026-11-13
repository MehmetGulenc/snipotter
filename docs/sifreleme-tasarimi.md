# Uçtan Uca Şifreleme — Tasarım

Karar (2026-11-13): pano ve notlar uçtan uca şifrelenir. Anahtar yalnızca kullanıcının cihazlarında bulunur; sunucu, veritabanı yedekleri ve Snipotter geliştiricileri içeriği okuyamaz. Kurtarma için 24 kelimelik kurtarma anahtarı verilir. Geçiş zorunlu güncellemeyle yapılır.

## Tehdit modeli

| Korunur | Korunmaz |
| --- | --- |
| Sunucunun / veritabanının ele geçirilmesi, yedeklerin sızması, sunucu yöneticisi | Kilidi açık ve ele geçirilmiş bir cihaz |
| Ağ trafiğinin izlenmesi (TLS'e ek katman) | Kullanıcının içeriği kendi isteğiyle üçüncü tarafa göndermesi (AI özetleri: Anthropic/Gemini) |
| Satırlar arası şifreli metin takası (AAD ile) | Meta veri: kayıt sayısı, zamanları, boyutları, hangi cihazın yazdığı |

## Anahtarlar

- **Çalışma alanı anahtarı `K_ws`**: 256 bit rastgele, her çalışma alanı için bir tane. Tüm içerik bununla şifrelenir.
- **Alt anahtarlar** (HKDF-SHA256, `K_ws`'ten): `enc` (AES-256-GCM), `hash` (HMAC-SHA256, tekrar kontrolü için).
- **Kurtarma anahtarı**: 256 bit entropi → 24 kelime (BIP39 İngilizce sözlük, sağlama toplamlı). `K_rec = HKDF(entropi)`; sunucuda yalnızca `wrap(K_ws, K_rec)` saklanır. 256 bit olduğu için kaba kuvvetle çözülemez.
- **Cihazda saklama**: iOS Keychain (App Group erişimli: paylaşım uzantısı ve widget da okuyabilir), macOS/Windows Electron `safeStorage` (ana işlemde), web: dışa aktarılamaz `CryptoKey` olarak IndexedDB.

## Şifreli alan biçimi

`enc:v1:` + base64( IV(12 bayt) ‖ şifreli metin ‖ GCM etiketi(16) )

- Algoritma: AES-256-GCM (WebCrypto; iOS WKWebView, Electron, tarayıcı, Node'da ortak).
- AAD: `workspace_id|tablo|satır_id|kolon` → bir satırın şifreli metni başka satıra/kolona taşınamaz.
- Şifrelenen alanlar:
  - `clipboard_items`: `text`, `html`, `ai`
  - `notes`: `title`, `content`, `ai`, `ydoc`
  - `note_updates.update`, `note_versions.content` (+ başlık), `notes_trash.note` içindekiler
  - `device_actions`: `payload`, `label`
  - Storage görselleri: bayt düzeyinde şifrelenip yüklenir; gösterirken çözülüp `blob:` URL olur.
- `clipboard_items.hash`: düz SHA-1 yerine `HMAC(K_hash, metin)`. Düz hash, kısa metinlerde (ör. 6 haneli kodlar) kaba kuvvetle çözülebilir.

## Yeni cihaz ekleme

Mevcut 6 haneli eşleştirme kodu sunucudan geçtiği için anahtar taşıyamaz. Yeni akış:

1. Mevcut cihaz tek kullanımlık 128 bit `S` üretir; sunucuya `wrap(K_ws, HKDF(S))` 10 dakikalığına yazılır.
2. `S` sunucuya hiç gitmez: QR kod (iPhone kamerayla okur) veya 12 kelime olarak gösterilir.
3. Yeni cihaz `S` ile sarılı anahtarı alıp açar ve tek kullanımlık kaydı siler.

Ortak çalışma alanı daveti aynı mekanizmayı kullanır: `https://snipotter.com/katil#<S>`. `#` sonrası tarayıcı tarafından sunucuya gönderilmez.

## Geçiş (zorunlu güncelleme)

1. `workspaces.encryption` kolonu (`null` | `'v1'`) ve `workspace_keys` tablosu (sarılı anahtarlar).
2. Güncel sürüm açıldığında, çalışma alanı şifresizse: anahtar üretilir, kurtarma kelimeleri gösterilir ve onaylatılır, `workspace_keys` yazılır (`unique(workspace_id)`; aynı anda iki cihaz denerse yalnız biri kazanır, diğeri "bu cihazı eşleştir" akışına düşer).
3. Kazanan cihaz tüm satırları şifreleyip yazar (sayfalı, yarıda kalırsa kaldığı yerden devam eder), sonra `encryption = 'v1'`.
4. Sunucu tetikleyicisi: `encryption = 'v1'` olan alana `enc:v1:` ile başlamayan içerik yazılamaz. Eski sürümlerin yazmaları reddedilir; yeni sürümler "uygulamayı güncelle" ekranı gösterir.
5. **Önceki yedekler** (`/opt/supabase/backups/public-before-0011-*.dump`, `public-before-0014-*.dump`) düz metin içerir; kullanıcı cihazlarında geçiş doğrulandıktan sonra silinmeli.

Durum (2026-11-13): 0014 production'da, v0.10.0 ile yayınlandı.

## Bilinen sonuçlar

- Sunucu tarafı arama yok (zaten istemcide).
- Push bildirimi içeriği gösteremez (zaten genel metin: "Cihazından yeni bir işlem geldi"); işlem uygulamada çözülür.
- AI özetleri (masaüstü) içeriği düz metin olarak Anthropic/Gemini'ye gönderir; bu ayar açık kaldığı sürece o içerik üçüncü tarafa gider. Ayarlarda bu açıkça yazılacak.
- Kurtarma kelimeleri ve tüm cihazlar kaybolursa veri geri getirilemez.

## Test planı

- Şifreleme çekirdeği: AES-GCM gidiş-dönüş, yanlış AAD/anahtar reddi, `enc:v1` biçimi, HMAC tekrar kontrolü, BIP39 kelime ↔ entropi ve sağlama toplamı.
- Sunucu: tetikleyici şifresiz yazmayı reddeder; `workspace_keys` yalnız üyelere; tek kullanımlık eşleştirme kaydı süresi dolunca okunamaz (yerel Postgres, `supabase/tests`).
- Uçtan uca: iki cihaz eşleşir, biri yazar diğeri okur; kurtarma kelimeleriyle yeni cihaz açılır; eski sürüm yazamaz.

## Yeni cihaz: kod + onay (0016)

12 kelimelik aktarım kaldırıldı. Yeni cihaz eski 6 haneli eşleştirme koduyla çalışma alanına katılır, sonra bir P-256 ECDH açık anahtarı yayınlar (`key_requests`). Anahtarı tutan herhangi bir cihazda "iPhone bağlanmak istiyor — Onayla" çıkar. Onaylanınca çalışma alanı anahtarı ECDH ile türetilen anahtarla (HKDF, AAD `pair|<istek>`) mühürlenip geri gönderilir. İki ekranda da yeni cihazın açık anahtarından türetilen 4 haneli kod gösterilir; sunucu açık anahtarı değiştirirse kodlar tutmaz. "Reddet" isteği siler ve o cihazı çalışma alanından çıkarır. 24 kelimelik kurtarma yalnızca hiçbir cihaza erişim kalmadığında kullanılır.
