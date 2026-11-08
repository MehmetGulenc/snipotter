# Snipotter — Sürüm Denetimi Raporu (App Store hazırlığı)

Tarih: 2026-11-08 · Hazırlayan: Sürüm Denetimi Uzmanı (kod değiştirilmedi, git yazma komutu çalıştırılmadı).
Not: Diğer iki mühendis aynı anda `electron/`, `build/` ve `apps/web` üzerinde çalışıyor; aşağıdaki sonuçlar çalıştırma anındaki çalışma ağacını yansıtır. Çalıştırma öncesi `git diff` ve `git status` yalnızca okuma amaçlı kaydedildi (`/tmp/snipotter_baseline.diff`, `/tmp/status_baseline.txt`; stash kullanılmadı).

## 1. Commit'lenmemiş değişiklikler

`git diff --stat`: 17 izlenen dosya, +470 / −282 satır.

| Alan | Dosyalar | Özet |
|---|---|---|
| Electron ana süreç | `electron/main/clipboard.ts` (68), `index.ts` (59), `supabase.ts` (25), `electron/preload/index.ts` (3) | Dosya panosu (macOS NSPasteboard), kuyruklu Supabase yazımı, preload API |
| Renderer | `src/App.tsx`, `components/{ClipboardCard,NoteCard,QuickPaste,Sidebar,TiptapEditor,Topbar}.tsx`, `pages/{Library,Notes,Settings}.tsx`, `styles/globals.css` | Kütüphane tercihleri, UI düzenlemeleri, not kartı |
| Diğer | `package-lock.json`, `.claude/settings.local.json` | Kilit dosyası, yerel ayar |

İzlenmeyen (untracked) önemli öğeler:
- **`apps/web/ios/` tamamen izlenmiyor** → iOS Xcode projesi git'te yok; gönderimden önce commit edilmeli (Pods/build çıktıları `.gitignore` ile dışlanmalı).
- `apps/web/patches/` (patch-package yamaları), `shared/keyedQueue.ts`, `shared/macFileClipboard.ts`, `src/lib/libraryPrefs.ts`, `scripts/tests/*.test.cjs` (5 test), `scripts/gen-*.py`, `workers/heartbeat/package-lock.json`.
- Araç klasörleri (`.antigravitycli/`, `.codex/`, `.multiagents/`, `.mcp.json`, `.claude/worktrees/`) → commit'e girmemeli, `.gitignore`'a eklenmeli.

**Yarım iş değerlendirmesi:** Yeni dosyalar (`keyedQueue.ts`, `macFileClipboard.ts`, `libraryPrefs.ts`) izlenen dosyalarca import ediliyor ve 27 testle kapsanıyor; derleme/tip hataları yok. Belirgin bir yarım kalmış özellik görülmedi. Riskler: (a) yeni dosyalar henüz `git add` edilmedi — commit'te unutulursa derleme kırılır; (b) `shared/macFileClipboard.ts` macOS'e özel `osascript`/AppKit kullanıyor (bkz. MAS riski).

## 2. Komut çıktıları

| Komut (dizin) | Sonuç |
|---|---|
| `npm run typecheck` (kök; `tsc --noEmit` node + web) | **PASS** — exit 0, 0 `error TS` |
| `npx eslint . --ext .ts,.tsx` (kök, `--fix` yok) | **FAIL (yapılandırma)** — ESLint 9.39.4 `eslint.config.js` bulamıyor ("couldn't find an eslint.config.(js\|mjs\|cjs) file"). `package.json` `eslint ^9.12.0` ama repoda flat config ya da `.eslintrc` yok. Kod hatası değil, mevcut repo sorunu; lint fiilen hiç çalışmıyor. `npm run lint` ayrıca `--fix` içerdiği için çalıştırılmadı. |
| `npm run build` (`apps/web`; `next build`, Next 14.2.35) | **PASS** — exit 0; "Compiled successfully", 4/4 statik sayfa; `/` 230 kB (First Load 318 kB), `/_not-found` 873 B |
| `apps/web` testleri | **Yok** — `apps/web/package.json` içinde `test` script'i ve test dosyası yok. `next lint` (apps/web) etkileşimli kurulum gerektirdiği için çalıştırılmadı |
| `node scripts/tests/<dosya>.test.cjs` (kök, 5 dosya, `node:test`) | **PASS — 27 pass / 0 fail** |

Test dökümü: clipboard-refresh 2, keyed-queue 3, library-prefs 7, mac-file-clipboard 10, ui-render 5 → toplam 27/27.

## 3. Sürüm tutarsızlığı

| Yer | Değer |
|---|---|
| Kök `package.json` (Electron masaüstü) | `0.7.1` (son commit `chore(release): v0.7.1`) |
| `apps/web/package.json` | `0.5.3` |
| iOS `project.pbxproj` | `MARKETING_VERSION = 1.0` denetim başında; #148 sonrası `0.5.3` (build `1`) (`apps/web/ios/App/App.xcodeproj/project.pbxproj:316-345`) |

Öneri: Ayrı ürünler olarak yönetilecekse (masaüstü 0.7.1, iOS 0.5.3; ilk mağaza sürümü için `1.0.0` düşünülebilir) bu bilinçli bir karar olarak belgelenmeli. iOS için `CFBundleShortVersionString` kullanıcıya görünen sürümdür (ör. `1.0.0`), `CFBundleVersion` her yüklemede artmalıdır. MAS için kök `package.json` sürümü (`0.7.1`) `CFBundleShortVersionString` olur; Apple üç parçalı sayısal biçim ister, `0.7.1` geçerlidir ancak MAS'ın ilk sürümü olarak `1.0.0` daha uygun görünür. Aynı Bundle ID'yi paylaşan iOS ve macOS uygulamaları (universal purchase) sürüm numaralarını bağımsız tutabilir.

## 4. Diğer bulgular (sürümü etkileyen)

1. `apps/web/ios/` git'te yok (yukarıda).
2. iOS `DEVELOPMENT_TEAM = 3PDY9R5UKT` projeye yazılı (`project.pbxproj:221,284`), `IPHONEOS_DEPLOYMENT_TARGET = 15.0`.
3. Denetim anında `apps/web/src/lib/mobile.ts:108-118` iOS'ta da otomatik pano okuyordu; iOS mühendisi kaldırdı (`mobile.ts:180`, yalnızca kullanıcı eylemi).
4. `PrivacyInfo.xcprivacy` denetim anında yoktu; sonradan eklendi (`apps/web/ios/App/App/PrivacyInfo.xcprivacy`).
5. ESLint yapılandırması eksik (yukarıda).
6. `apps/web/.env.production` repoda (yalnızca public anon anahtarı — tasarım gereği kabul edilebilir).
