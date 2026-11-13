# Ortak alan tasarımı

Karar (2026-11-13): eş, aile ya da arkadaş grubu notları birlikte yazabilsin. İçerik uçtan uca şifreli kalır; pano geçmişi her zaman kişiseldir.

## Kavramlar

- **Kişi** = kişisel çalışma alanı (`workspaces.kind = 'personal'`). Kişinin tüm eşleşmiş cihazları bu alanın doğrudan üyesidir (`workspace_members`).
- **Ortak alan** = `workspaces.kind = 'shared'`. Üyeleri cihazlar değil kişilerdir (`space_members(space_id, person_id)`). Bir kişi ortak alana katılınca o kişinin bütün cihazları (sonradan eşleşenler dahil) alanı görür.
- `is_workspace_member(ws)`: doğrudan üyelik **ya da** üyesi olunan bir kişinin ortak alan üyeliği. Bütün RLS kuralları zaten bu fonksiyondan geçtiği için notlar, defterler, sürümler, çöp kutusu ve görseller ek kural gerekmeden ortak alanda çalışır.

## Anahtarlar

- Ortak alanın kendi rastgele 32 baytlık anahtarı vardır; alan verisi bununla şifrelenir (AAD'de alan kimliği).
- Anahtar her kişi için o kişinin kendi anahtarıyla mühürlenip `space_members.wrapped_key` alanında durur. Sunucu açamaz; kişinin herhangi bir cihazı açar.
- Alan adı ve kişilerin görünen adları da alan anahtarıyla şifrelidir.
- Ortak alanın kurtarma kelimesi yoktur: her üye kendi kişisel anahtarıyla (o da kendi 24 kelimesiyle) erişir.

## Davet

1. Herhangi bir üye 16 baytlık tek kullanımlık bir sır üretir. `invite_id = HMAC(sır, 'invite')`, alan anahtarı sırdan türetilen anahtarla sarılır ve `space_invites` tablosuna yazılır (7 gün geçerli).
2. Sır 12 kelimeye çevrilir. Bağlantı `https://snipotter.com/katil#kelime-kelime-…` biçimindedir. `#` sonrası tarayıcı tarafından sunucuya gönderilmez; sayfa yalnızca kelimeleri gösterir ve `snipotter://katil#…` ile uygulamayı açar.
3. Davet edilen kişi `peek_space_invite` ile sarılı anahtarı alır, açar, kendi kişisel anahtarıyla yeniden mühürler ve `join_space` ile tek adımda katılır. Davet bu anda silinir.

## Kurallar

- Kişi çıkarma yalnızca kurucu (owner); herkes kendini çıkarabilir. Kurucu çıkarsa en eski üye kurucu olur; son kişi çıkınca alan ve tüm notları silinir.
- Cihaz eşleştirme (`offer_key_transfer`) yalnızca kişisel alanlarda çalışır; bir cihaz ortak alana doğrudan bağlanamaz.
- İstemciler `workspaces` tablosunu doğrudan güncelleyemez (0015). Böylece 0014'teki `encryption` sütununun kapatılabilmesi açığı da kapandı. Ad değişikliği `rename_space` ile yalnızca şifreli olarak yapılır.
- Bir kişi en fazla 20 alana üye olabilir; bir alanda en fazla 20 açık davet bulunabilir.

## Bilinçli sınırlar

- **Anahtar yenileme yok.** Çıkarılan kişinin sunucu erişimi RLS ile anında kesilir. Daha önce gördüğü içeriğin kopyasını zaten görmüştü. Alan anahtarı değişmediği için, çıkarılan biri veritabanının bir kopyasını da ele geçirirse sonraki notları okuyabilir. Bu senaryo için anahtar yenileme ve yeniden şifreleme ileride eklenebilir.
- Pano kayıtları ortak alana otomatik gitmez. "Ortak alana gönder" kaydın bir kopyasını not olarak ekler.
- Bildirim: ortak alanda yeni not açılınca yazan kişi dışındaki üyelerin iPhone'larına "Ortak alanına yeni bir not eklendi" gider. İçerik ve alan adı bildirimde yer almaz. Düzenlemeler bildirim üretmez.
- Masaüstünde `snipotter://` bağlantısı kayıtlı değil; masaüstünde davet bağlantısı "Davete katıl" ekranına yapıştırılır.
- Dynamic Island / Live Activity bu sürümde yok.

## Test

- `supabase/tests/0015_shared_spaces.test.sql`: 30 kontrol (RLS, davet, tek kullanım, çıkarma, sahiplik devri, şifresiz yazma reddi).
- `supabase/tests/integration/spaces.test.cjs`: PostgREST üzerinden iki kişi; davet bağlantısıyla katılma, ortak notu okuma, yeni cihazda anahtarın kişisel anahtardan gelmesi, çıkarılınca erişimin kesilmesi.
