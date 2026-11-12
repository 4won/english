// Builds the app icons from the owner's book + signature logo, matched to 4WON'S PLANNER's icons:
// the artwork fills 67.4% of the width, centred where the planner's is (49.9%, 49.3%), on a white
// tile whose corners are cut at a 20% radius (the planner's 102px at 512) so it reads as a rounded
// app tile on PC too. Maskable and Apple icons stay square, because the OS cuts their corners.
//   node tools/logo/build-icons.mjs <source image>
import sharp from 'sharp';

const src = process.argv[2];
const OUT = 'docs/icons';
const ART_W = 0.674, CX = 0.499, CY = 0.493, RADIUS = 0.2;

// The source is a white rounded tile on black. Its artwork spans 14.3–86.0% across and
// 23.0–78.8% down; this square sits inside the white tile, clear of the black corners.
const meta = await sharp(src).metadata();
const N = meta.width;
const crop = { left: Math.round(N * 0.12), top: Math.round(N * 0.12), width: Math.round(N * 0.76), height: Math.round(N * 0.76) };
const art = { x0: 0.143 * N - crop.left, x1: 0.860 * N - crop.left, y0: 0.230 * N - crop.top, y1: 0.788 * N - crop.top };
// The scan's "white" is slightly grey; lift near-white pixels to pure white so no box shows on the tile.
const raw = await sharp(src).extract(crop).flatten({ background: '#fff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const d = raw.data;
for (let i = 0; i < d.length; i += 3) {
  const lo = Math.min(d[i], d[i + 1], d[i + 2]);
  if (lo >= 228) d[i] = d[i + 1] = d[i + 2] = 255;
}
const cropped = await sharp(d, { raw: raw.info }).png().toBuffer();

async function tile(size, rounded) {
  const k = (ART_W * size) / (art.x1 - art.x0);
  const w = Math.round(crop.width * k);
  const left = Math.round(CX * size - ((art.x0 + art.x1) / 2) * k);
  const top = Math.round(CY * size - ((art.y0 + art.y1) / 2) * k);
  const scaled = await sharp(cropped).resize(w, w, { kernel: 'lanczos3' }).png().toBuffer();
  let img = sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } }).composite([{ input: scaled, left, top }]);
  if (!rounded) return img.flatten({ background: '#fff' }).png();
  const r = RADIUS * size;
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`);
  return sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]).png();
}

await (await tile(512, true)).toFile(`${OUT}/icon-512.png`);
await (await tile(192, true)).toFile(`${OUT}/icon-192.png`);
await (await tile(512, false)).toFile(`${OUT}/maskable-512.png`);
await (await tile(180, false)).toFile(`${OUT}/apple-touch-icon-v2.png`);
console.log('ok');
