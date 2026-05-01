#!/usr/bin/env node
/**
 * Generate Microsoft Store logos from SVG
 * Produces:
 *   store-logos/poster-720x1080.png (9:16)
 *   store-logos/poster-1440x2160.png (9:16)
 *   store-logos/box-1080x1080.png (1:1)
 *   store-logos/box-2160x2160.png (1:1)
 *   store-logos/tile-300x300.png (1:1)
 *   store-logos/tile-150x150.png (1:1)
 *   store-logos/tile-71x71.png (1:1)
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'snipotter-mark.svg');
const OUTPUT_DIR = path.join(ROOT, 'store-logos');

if (!fs.existsSync(SRC)) {
  console.error('Missing source SVG:', SRC);
  process.exit(1);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const svgBuffer = fs.readFileSync(SRC);

async function generateLogo(width, height, filename) {
  console.log(`Generating ${filename} (${width}x${height})...`);
  await sharp(svgBuffer, { density: 384 })
    .resize(width, height, { 
      fit: 'contain',
      background: { r: 11, g: 10, b: 15, alpha: 1 } // #0B0A0F
    })
    .png()
    .toFile(path.join(OUTPUT_DIR, filename));
}

async function main() {
  // 9:16 Poster art
  await generateLogo(720, 1080, 'poster-720x1080.png');
  await generateLogo(1440, 2160, 'poster-1440x2160.png');

  // 1:1 Box art
  await generateLogo(1080, 1080, 'box-1080x1080.png');
  await generateLogo(2160, 2160, 'box-2160x2160.png');

  // 1:1 App tile icons
  await generateLogo(300, 300, 'tile-300x300.png');
  await generateLogo(150, 150, 'tile-150x150.png');
  await generateLogo(71, 71, 'tile-71x71.png');

  console.log('Done. Generated files:');
  const files = fs.readdirSync(OUTPUT_DIR);
  for (const f of files) {
    const stat = fs.statSync(path.join(OUTPUT_DIR, f));
    console.log(`  store-logos/${f} (${stat.size} bytes)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
