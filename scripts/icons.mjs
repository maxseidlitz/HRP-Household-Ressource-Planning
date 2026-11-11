import sharp from "sharp";
import { readFileSync } from "node:fs";
// Erzeugt die PNG-Icons für PWA und iOS aus src/app/icon.svg (npm run icons).
const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const svg = readFileSync(`${root}/src/app/icon.svg`);
const out = (n) => `${root}/public/icons/${n}`;
for (const size of [192, 512])
  await sharp(svg, { density: 512 })
    .resize(size, size)
    .png()
    .toFile(out(`icon-${size}.png`));
await sharp(svg, { density: 512 })
  .resize(180, 180)
  .flatten({ background: "#0a84ff" })
  .png()
  .toFile(out("apple-touch-icon.png"));
// Maskable: Verlauf randlos, Motiv auf 80 % verkleinert (sichere Zone)
const maskable = svg
  .toString()
  .replace('rx="15"', 'rx="0"')
  .replace("</defs>", '</defs><g id="bg">')
  .replace(
    /(<rect width="64"[^>]*\/>)/,
    '$1</g><g transform="translate(6.4 6.4) scale(0.8)">',
  )
  .replace("</svg>", "</g></svg>");
await sharp(Buffer.from(maskable), { density: 512 })
  .resize(512, 512)
  .png()
  .toFile(out("maskable-512.png"));
// Badge (Android-Statusleiste): weiße Silhouette auf transparent
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 10 54 30v21a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V30Z" fill="#fff"/></svg>`;
await sharp(Buffer.from(badge), { density: 512 })
  .resize(96, 96)
  .png()
  .toFile(out("badge-96.png"));
