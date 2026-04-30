#!/usr/bin/env node
/**
 * Generate app icons from gemini-svg.svg
 * Produces:
 *   build/icon.iconset/* (mac sources)
 *   build/icon.icns (mac)
 *   build/icon.png (linux/win 512x512)
 *   build/icon.ico (win — single PNG fallback)
 *   build/tray-icon.png (system tray 32x32)
 *   build/tray-icon@2x.png (retina 64x64)
 *   build/appx-assets/* (Microsoft Store icons)
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'gemini-svg.svg');
const BUILD = path.join(ROOT, 'build');
const ICONSET = path.join(BUILD, 'icon.iconset');
const APPX_ASSETS = path.join(BUILD, 'appx-assets');

if (!fs.existsSync(SRC)) {
  console.error('Missing source SVG:', SRC);
  process.exit(1);
}

fs.mkdirSync(ICONSET, { recursive: true });
const svgBuffer = fs.readFileSync(SRC);

// macOS iconset sizes (filename → pixel size)
const macSizes = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

async function render(size, outPath) {
  await sharp(svgBuffer, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
}

(async () => {
  // iconutil ships only with Xcode CLT, so .icns generation is Mac-only.
  // Linux/Windows runners use icon.png and icon.ico instead — electron-builder
  // skips icon.icns when building for those targets.
  const isMac = process.platform === 'darwin';

  if (isMac) {
    console.log('Generating macOS iconset...');
    for (const [name, size] of macSizes) {
      await render(size, path.join(ICONSET, name));
    }

    console.log('Building icon.icns...');
    execSync(`iconutil -c icns "${ICONSET}" -o "${path.join(BUILD, 'icon.icns')}"`);
  } else {
    console.log('Skipping macOS iconset/.icns (non-darwin host).');
  }

  console.log('Generating icon.png (512x512) for linux/win...');
  await render(512, path.join(BUILD, 'icon.png'));

  console.log('Generating tray icons...');
  // Tray icons: macOS expects template style; for now use full color
  await render(32, path.join(BUILD, 'tray-icon.png'));
  await render(64, path.join(BUILD, 'tray-icon@2x.png'));

  console.log('Generating Windows icon.ico...');
  // Simplest: write 256x256 PNG; electron-builder will accept it
  await render(256, path.join(BUILD, 'icon.ico'));

  console.log('Generating Microsoft Store icons...');
  fs.mkdirSync(APPX_ASSETS, { recursive: true });

  // Store icons (filename → pixel size)
  const appxSizes = [
    ['StoreLogo.png', 50],
    ['SmallTile.png', 71],
    ['Tile150x150.png', 150],
    ['Wide310x150.png', 310],
    ['LargeTile.png', 310],
    ['SplashScreen.png', 620],
  ];

  for (const [name, size] of appxSizes) {
    await render(size, path.join(APPX_ASSETS, name));
  }

  // Wide310x150 needs to be rectangular (310x150), others are square
  await sharp(svgBuffer, { density: 384 })
    .resize(310, 150, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(APPX_ASSETS, 'Wide310x150.png'));

  // SplashScreen is rectangular (620x300)
  await sharp(svgBuffer, { density: 384 })
    .resize(620, 300, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(APPX_ASSETS, 'SplashScreen.png'));

  // Cleanup iconset (optional — keep for re-use)
  console.log('Done.');
  console.log('Outputs:');
  for (const f of fs.readdirSync(BUILD)) {
    const stat = fs.statSync(path.join(BUILD, f));
    if (stat.isFile()) console.log('  build/' + f, '(' + stat.size + ' bytes)');
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
