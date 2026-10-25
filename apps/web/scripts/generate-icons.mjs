/**
 * 从 design/logo.svg 生成全套应用图标：
 *   public/icons/icon-{48,96,144,192,512}.png
 *   public/icons/apple-touch-icon.png (180)
 *   public/favicon.ico (16/32/48)
 * 用法：node scripts/generate-icons.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const SIZES = [48, 96, 144, 192, 512];

const svg = await readFile('design/logo.svg');

for (const size of SIZES) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(`public/icons/icon-${size}.png`);
  console.log(`icon-${size}.png ✓`);
}

await sharp(svg, { density: 300 }).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
console.log('apple-touch-icon.png (180) ✓');

const icoSizes = [16, 32, 48];
const icoPngs = await Promise.all(
  icoSizes.map((s) => sharp(svg, { density: 300 }).resize(s, s).png().toBuffer())
);
await writeFile('public/favicon.ico', await pngToIco(icoPngs));
console.log('favicon.ico (16/32/48) ✓');
