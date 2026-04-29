# Build Resources

Bu klasöre uygulama icon'ları konacak (electron-builder otomatik kullanır):

- `icon.icns` — macOS app icon (1024×1024 önerilir)
- `icon.ico` — Windows app icon
- `icon.png` — Linux + Windows tray fallback (512×512)
- `tray-icon.png` — System tray icon (Mac için 16×16 ya da 18×18, transparent)

İlk build'den önce bu icon'ları üret. Hızlı bir başlangıç için:

```bash
# https://www.electron.build/icons
# Bir 1024x1024 PNG'den hepsini üretmek için:
npx electron-icon-builder --input=./snipotter-logo.png --output=./build
```

Bu dosyalar yoksa `npm run dev` çalışır (default Electron icon'unu gösterir), ama paketleme için gereklidir.
