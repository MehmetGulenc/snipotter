# iPhone işlem bildirimlerini kurma

Bu adımlar dağıtımı yapacak kişi içindir. Bu geliştirme görevi sırasında migration uygulanmadı, function dağıtılmadı ve gerçek APNs anahtarı kullanılmadı. Aşağıdaki SQL ve dağıtım komutlarını yalnız ilgili ortam için ayrıca yetkilendirildiğinizde çalıştırın.

## 1. Apple APNs anahtarını oluşturun

1. [Apple Developer hesabına](https://developer.apple.com/account) giriş yapın.
2. **Certificates, IDs & Profiles → Keys → +** yolunu açın.
3. Anahtara bir ad verin, **Apple Push Notifications service (APNs)** seçeneğini işaretleyin; sihirbazdaki uygulama/ortam kapsamını ihtiyacınıza göre seçip **Continue → Register** ile tamamlayın.
4. `.p8` dosyasını **Download** ile indirin. Dosya tekrar indirilemeyebilir; güvenli bir yerde saklayın. Depoya, web ortamına veya iOS paketine eklemeyin.
5. **Keys → oluşturduğunuz anahtar** ekranındaki **Key ID** değerini not alın. **Membership details** ekranındaki **Team ID** değerini de alın; görünen ekip adıyla karıştırmayın.

## 2. Uygulama yeteneğini ve imzalamayı ayarlayın

1. Developer hesabında **Certificates, IDs & Profiles → Identifiers → com.snipotter.app** kaydını açın.
2. **Push Notifications** seçeneğini işaretleyin ve **Save** deyin.
3. Xcode'da `apps/web/ios/App/App.xcodeproj` dosyasını açın. **App target → Signing & Capabilities → + Capability → Push Notifications** seçin. Doğru Team'i seçin ve provisioning profilini yenileyin.
4. App entitlement `aps-environment` değerini `APNS_ENVIRONMENT` build ayarından alır: **Debug = sandbox**, **Release = production**. Native token kaydı da Debug/Release'e göre aynı ortamı döndürür. Özel konfigürasyon kullanıyorsanız iki ayarı birlikte düzenleyin.
5. İlk teslimat denemesini fiziksel iPhone'da yapın. Simülatörde başarılı derleme gerçek APNs teslimatını kanıtlamaz.

## 3. Veritabanı migration'ını elle uygulayın

1. Hedef Supabase projesinin doğru ortam olduğunu doğrulayın; gerekiyorsa yedek alın.
2. **Supabase Dashboard → SQL Editor → New query** açın.
3. Önce önceki migration'ların uygulandığını kontrol edin. `0008_delete_own_account.sql` henüz uygulanmadıysa önce onu inceleyip uygulayın; `0009` çalışma alanı şemasını da gerektirir.
4. `supabase/migrations/0009_action_bridge.sql` dosyasının tamamını yapıştırın ve **Run** deyin. Bu işlem yeni tablolar, RLS, hız sınırı ve realtime yayını oluşturur.
5. **Table Editor** içinde `device_actions` ve `push_tokens` tablolarının oluştuğunu doğrulayın. `push_tokens` realtime yayınına eklenmemelidir.

CLI ile yönetilen bir ortamda alternatif `supabase db push` komutudur; bu komut tüm bekleyen migration'ları uygulayabilir. Önce hedef projeyi ve bekleyen dosyaları inceleyin. Bu belge komutları otomatik çalıştırmaz.

## 4. Sırları tanımlayın ve function'ı dağıtın

1. Terminalde depo köküne gidin. Supabase CLI'da oturum açıp doğru projeyi bağlayın:

   ```sh
   supabase login
   supabase link --project-ref PROJE_REFERANSI
   ```

2. `.p8` dosyasının güvenli konumundan aşağıdaki komutları çalıştırın. `XXXX` alanlarını kendi değerlerinizle değiştirin. Webhook sırrını bir parola yöneticisine kaydedin; sonraki adımda aynı değer gerekir. Terminal çıktısını veya anahtarı ekiple sohbet içinde paylaşmayın.

   ```sh
   ACTION_PUSH_WEBHOOK_SECRET=$(openssl rand -hex 32)
   supabase secrets set \
     APNS_PRIVATE_KEY="$(cat /guvenli/konum/AuthKey_XXXX.p8)" \
     APNS_KEY_ID=KEY_ID_DEGERI \
     APNS_TEAM_ID=TEAM_ID_DEGERI \
     APNS_TOPIC=com.snipotter.app \
     ACTION_PUSH_WEBHOOK_SECRET="$ACTION_PUSH_WEBHOOK_SECRET"
   ```

   `APNS_PRIVATE_KEY` PEM içeriğidir; gerçek satır sonları veya `\n` kabul edilir. `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` Supabase Edge ortamında otomatik tanımlıdır; ayrıca set etmeyin. Service role anahtarını istemciye koymayın.

3. Function'ı dağıtın:

   ```sh
   supabase functions deploy send-action-push --no-verify-jwt
   ```

   `--no-verify-jwt` yalnız Supabase JWT kapısını kapatır. Endpoint kendi `x-webhook-secret` doğrulamasını yapar; sır yoksa veya yanlışsa 401 döner.

## 5. Database Webhook oluşturun

1. **Supabase Dashboard → Database → Webhooks → Create a new hook** yolunu açın.
2. **Name:** `send-action-push` yazın.
3. **Schema:** `public`, **Table:** `device_actions` seçin.
4. **Events:** yalnız **INSERT** işaretleyin.
5. **Type:** HTTP Request; **Method:** POST seçin.
6. **URL:** `https://PROJE_REFERANSI.supabase.co/functions/v1/send-action-push` yazın.
7. **HTTP Headers** alanına iki satır ekleyin:

   | Header | Değer |
   | --- | --- |
   | `Content-Type` | `application/json` |
   | `x-webhook-secret` | 4. adımda sakladığınız webhook sırrı |

8. Kaydedin. Standart webhook gövdesi `{type:'INSERT',schema:'public',table:'device_actions',record:{id:...}}` biçimindedir. Function tam kaydı yeniden veritabanından okur; süresi geçmiş/tüketilmiş kayıtları atlar. Güncel üye tokenlarına gönderir; gönderenin kendi kullanıcı kimliğine ait tokenlarını hariç tutar.

## 6. iPhone ve masaüstüyle deneyin

1. iPhone'da aynı çalışma alanına bağlı Snipotter'ı açın. **Ayarlar → Bildirimler** anahtarını açın ve sistem izin isteğini onaylayın.
2. `registerPush()` token ve ortam döndürür; uygulama bu kullanıcıya ait `push_tokens` kaydını oluşturur. İzin reddedildiyse **iOS Ayarlar → Bildirimler → Snipotter** ekranından açın, uygulamaya dönüp yeniden etkinleştirin.
3. Farklı cihaz kimliğiyle bağlı masaüstünde bir telefon kaydında **Telefona gönder** seçin. iPhone'da bildirim görünmeli; bildirime uzun basıldığında **Ara / Kopyala** düğmeleri görünmelidir.
4. Adreste **Haritada aç / Kopyala**, bağlantıda **Aç / Kopyala**, IBAN veya düz metinde yalnız **Kopyala** görünmelidir. IBAN hiçbir şekilde arama düğmesi göstermemelidir.
5. Düğmeye basınca uygulama öne gelir; actionId ile kayıt doğrulanır, ilgili işlem yapılır ve `consumed_at` güncellenir. Uygulama açıkken üst işlem şeridini de deneyin.
6. Bildirim anahtarını kapatınca o cihazın token kaydı silinmelidir. Çıkışta eski oturum kapanmadan token silinir. Hesap değiştirdikten sonra bildirimleri yeniden açıkça etkinleştirin.

## 7. Sorun giderme

| Belirti / APNs yanıtı | Kontrol / çözüm |
| --- | --- |
| Webhook 401 | Webhook header ve Edge `ACTION_PUSH_WEBHOOK_SECRET` aynı mı? Header adı `x-webhook-secret` olmalı. |
| `BadDeviceToken` | Tokenın ait olduğu Bundle ID ve ortamı kontrol edin. Debug tokenı sandbox, Release/TestFlight tokenı production endpoint'ine gitmelidir. Tokenı yeni kurulumdan yeniden kaydedin. |
| 403 `InvalidProviderToken` | Key ID, Team ID, `.p8` dosyası ve anahtarın iptal edilmemiş olduğunu kontrol edin. `APNS_TOPIC` uygulamanın Bundle ID'si olmalıdır. |
| Sandbox / production karışıklığı | Xcode Debug/Release, `APNS_ENVIRONMENT` ve `push_tokens.environment` değerlerini karşılaştırın. Ortam değiştiyse tokenı yeniden kaydedin. |
| 410 `Unregistered` | Function aynı token kaydını siler. Uygulamayı açıp bildirimleri yeniden etkinleştirin. |
| Bildirim görünmüyor | iOS bildirim izni, Odak modu, güncel workspace üyeliği, token kaydı ve webhook yanıtını kontrol edin. İşlem 10 dakika içinde kullanılmalıdır. |
| Webhook 500 / 502 | Edge ortam sırlarının varlığını, APNs yapılandırmasını ve ağ erişimini kontrol edin. Function hassas içerikleri loglamaz; yanıt başarı sayıları verir. |
| Hız sınırı hatası | Gönderen başına dakikada en fazla 10 işlem vardır; bir dakika bekleyin. |

## Davranış ve yerel doğrulama

Kategoriler `SNIPOTTER_PHONE`, `SNIPOTTER_ADDRESS`, `SNIPOTTER_URL`, `SNIPOTTER_COPY`'dir. Native düğme ile tür uyuşmazsa olay `open` olarak iletilir; arayüz türün izin vermediği düğmede işlem yapmadan şeridi gösterir ve kullanıcıya seçim bırakır. `onPushAction` `{actionId,kind,payload,button}` taşır; soğuk başlangıç olayı dinleyiciye kadar tutulur. UTF-8 metin 3000 baytı aşarsa APNs 4 KB sınırı için bildirim payload alanı boş gelir; tam içerik actionId ile veritabanından okunur. Kilit ekranı başlığı özel içeriği göstermez; özel payload APNs üzerinden taşınır.

Kayıt ömrü 10 dakikadır. Gönderen başına hız sınırı transaction advisory lock ile eşzamanlı insertleri de kapsar. APNs 410'da yalnız aynı token silinir. Diğer APNs hataları başarısız yanıt üretir; tekrarlar aynı collapse ID kullanır, tam bir kez teslim garantisi yoktur. Eski action kayıtları için ayrı saklama politikası planlanmalıdır.

```sh
node --experimental-strip-types --test supabase/functions/send-action-push/apns.test.ts
cd apps/web
npx tsc --noEmit
node scripts/verify-app-store.mjs
npm run ios:bundle
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

JWT testi bellekte geçici anahtar üretir ve açık anahtarla imzayı doğrular. Gerçek APNs smoke testi fiziksel cihaz, geçerli profil ve sunucu sırları gerektirir.
