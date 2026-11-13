# Notlar — Profesyonel Not Aracı Yol Haritası

Hedef: Snipotter notlarını iPhone, web ve masaüstünde (macOS/Windows/Linux) aynı editörle çalışan, çakışmasız senkronlanan, çevrimdışı çalışan bir not aracına dönüştürmek.

## Bugünkü durum (2026-11-13)

| Konu | Durum | Sorun |
| --- | --- | --- |
| Editör | Tiptap 3.23, iki ayrı kopya (`src/components/TiptapEditor.tsx` 657 satır, `apps/web/src/components/TiptapEditor.tsx` ~330 satır) | Her özellik iki kez yazılıyor, davranışlar ayrışmış |
| Kayıt | `notes.content` = tüm belgenin JSON'u, 0,6 sn gecikmeli tam üzerine yazma | Son yazan kazanır; iki cihazda aynı anda düzenlemede metin kaybolur |
| Görseller | base64 olarak not içine gömülü | Not şişer, her tuşta MB'lar gönderilir |
| Masaüstü erişim | Renderer → IPC → ana işlem → Supabase | Renderer'da Supabase istemcisi yok |
| Çevrimdışı / geçmiş / çöp kutusu | Yok | Silinen veya ezilen not geri gelmez |

## Mimari kararlar

1. **Ortak not modülü `shared/notes/`**: editör uzantıları, araç çubuğu, `/` menüsü, düğüm görünümleri, metin çıkarma, Yjs senkron mantığı. İki uygulama da buradan içe aktarır.
   - React/Tiptap tek kopya olmalı: Next (`apps/web/next.config.mjs`) ve electron-vite yapılandırmalarında `react`, `react-dom`, `@tiptap/*`, `yjs` için `resolve.alias` / dedupe.
2. **Senkron: Yjs (CRDT) + kendi taşıma katmanımız.** Yeni servis eklemiyoruz (PowerSync yok, alfa `y-supabase` yok).
   - `NoteTransport` arayüzü: `pull(noteId, afterSeq)`, `push(noteId, update)`, `subscribe(noteId, cb)`.
     - Web/iOS: supabase-js ile doğrudan.
     - Masaüstü: IPC üzerinden ana işlemdeki Supabase istemcisi.
   - Yerel kalıcılık: `y-indexeddb` (iOS WKWebView, Electron renderer, tarayıcı). Çevrimdışı yazılanlar bekleyen-gönderim kuyruğunda tutulur, bağlanınca gönderilir.
   - Anlık dağıtım: mevcut `sync-<workspace>` yayın kanalına `note:yupdate` olayı. Kalıcı kayıt `note_updates` tablosu (yedek yol).
   - Sıkıştırma: güncelleme sayısı eşiği aşınca istemci `notes.ydoc` anlık görüntüsünü yazar, eski güncellemeler silinir.
3. **Geriye uyumluluk:** Yeni istemciler `notes.content` (JSON) ve `title`'ı da yazmaya devam eder; arama, önizleme ve eski sürümler (masaüstü ≤0.8.x, iOS build ≤4) çalışır. Eski bir istemci `content`'i değiştirirse yeni istemci farkı algılar ve belgeyi o içerikten yeniden tohumlar (o tek durumda son yazan kazanır).
4. **Görseller/ekler:** Supabase Storage `note-assets` kovası, yol `workspace_id/note_id/<uuid>.<ext>`, RLS ile yalnız çalışma alanı üyeleri. Not içinde yalnız referans. Mevcut base64 görseller ilk açılışta arka planda taşınır.

## Veritabanı değişiklikleri (migration 0011+, her biri production'a ayrı onayla)

- `0011_note_sync.sql` → `postgres` rolüyle; `0012_note_assets.sql` → `supabase_admin` ile (Storage politikaları). İkisi de henüz production'a **uygulanmadı**.

- `notes`: `ydoc text` (base64 Yjs durumu), `deleted_at timestamptz` (çöp kutusu), `notebook_id uuid`, `tags text[]`, `locked boolean`.
- `note_updates`: `id bigserial`, `note_id`, `workspace_id`, `update text` (base64), `created_by`, `created_at`. RLS: çalışma alanı üyesi; insert'te boyut sınırı.
- `note_versions`: anlık görüntüler (otomatik: oturum başına + saatlik; elle: "Sürümü kaydet").
- `notebooks`: `id`, `workspace_id`, `name`, `icon`, `parent_id`, `sort`.
- `note_links`: `from_note`, `to_note` (geri bağlantılar için, istemci senkronlar).
- Çöp kutusu 30 gün sonra zamanlanmış görevle temizlenir (pg_cron varsa, yoksa istemci tarafı temizlik).

## Aşamalar

### Aşama 1 — Temel
- [x] `shared/notes/` ortak editör; iki uygulama bu editöre geçer, eski iki kopya silinir
- [x] Yjs senkron + `NoteTransport` (web/iOS, masaüstü IPC) + `y-indexeddb` çevrimdışı
- [x] Görseller Storage'a (özel kova, imzalı URL); eski base64 görsellerin taşınması
- [x] Sürüm geçmişi (listele, önizle, geri yükle; geri yüklemeden önce mevcut hâl kaydedilir)
- [x] Çöp kutusu (30 gün, geri yükle, kalıcı sil; eski istemciler normal silme görür)
- [x] Testler: `scripts/tests/note-sync.test.cjs` (9), `supabase/tests/*.sql` (30 kontrol, `supabase/tests/run-local.sh` ile yerel Postgres'te)

### Aşama 2 — Düzen
- [x] Defterler (en fazla 4 kat iç içe), not taşıma, deftersiz görünümü (migration `0013_notebooks.sql`)
- [x] `#etiket` (yazarken vurgulanır, tıklayınca filtreler; şema değişikliği yok)
- [x] `[[` ile not seçici + `snipotter://note/<id>` bağlantıları (eski sürümler korur) + geri bağlantılar
- [x] Tam metin arama (Türkçe büyük/küçük harf ve aksan duyarsız, başlık öncelikli, `#etiket` süzgeci), vurgulu özet

### Aşama 3 — Yazma deneyimi

> Durum (2026-11-13): tamamlandı. Yerel deneme sayfasında (`.playground/`, git dışı) iki editör arasında doğrulandı; iPhone klavye üstü çubuğu ve sürükleyerek taşıma gerçek cihazda/uygulamada henüz denenmedi.
- [x] `/` komut menüsü (biçim, ekle, şablon)
- [x] Blok taşıma: masaüstünde tutamaç, her yerde ⌥↑/⌥↓ ve araç çubuğu okları
- [x] Şablonlar (toplantı, alışveriş, günlük, proje)
- [x] Kod blokları için sözdizimi renklendirme
- [x] Biten görevler listenin sonuna iner (her zaman açık; ayar eklenmedi)
- [x] Mobilde klavye üstü araç çubuğu (cihazda doğrulanacak)

### Aşama 4 — Farkı yaratanlar
- [ ] Pano kaydını tek dokunuşla nota ekle / notta pano paneli
- [ ] iPhone: belge tarama + OCR (VisionKit), görseldeki metni seçilebilir yapma
- [ ] Sesli not + yazıya dökme (iOS Speech, masaüstünde sistem tanıma)
- [ ] Face ID / Touch ID ile not kilidi (içerik cihazda şifreli)
- [ ] Yapay zekâ: özetle, maddeleştir, başlık öner, düzelt (mevcut AI anahtarları ile)
- [ ] Dışa aktarma: Markdown, PDF, HTML (tüm platformlar); bağlantıyla paylaşma

### Aşama 5 — Güvenlik ve paylaşım (2026-11-13 kararı)
- [ ] Uçtan uca şifreleme (pano + notlar), 24 kelimelik kurtarma anahtarı, zorunlu güncelleme — ayrıntı: `docs/sifreleme-tasarimi.md`
- [ ] Ortak çalışma alanı (eş / arkadaş grubu), davet bağlantısı anahtarı da taşır
- [ ] iOS: ortak alanda yeni not gelince bildirim + Dynamic Island (Live Activity)
- [ ] Notlarda çizim
- [ ] iOS ana ekran widget'ı: seçilen not / çizim

## Yayın planı

Her aşama sonunda: tüm testler, iOS TestFlight build'i ve masaüstü sürümü — **her birinden önce onay alınır**. Migration'lar production'a yalnız onayla uygulanır. 0010–0013 production'a uygulandı (2026-11-13, öncesinde `public` şeması yedeklendi).
