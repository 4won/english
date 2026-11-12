import sharp from 'sharp';
for (const f of process.argv.slice(2)) {
  const img = sharp(f); const m = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i+1], data[i+2], data[i+3]]; };
  // corner pixel, first opaque/white pixel along top row and diagonal, ink bbox (non-white opaque)
  let diag = 0; while (diag < W/2) { const p = px(diag, diag); if (p[3] > 128 && p[0] > 200 && p[1] > 200 && p[2] > 200) break; diag++; }
  let x0=W,y0=H,x1=0,y1=0;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){const p=px(x,y); if(p[3]>128 && (p[0]<180||p[1]<180) && !(x<W*0.1&&y<H*0.1) ){ const inCorner = (x<W*.15||x>W*.85)&&(y<H*.15||y>H*.85); if(inCorner) continue; x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);} }
  let top=0; while (top < H/2) { const p = px(Math.floor(W/2), top); if (p[3] > 128 && p[0] > 200) break; top++; }
  console.log(f.split(/[\/]/).pop(), W+'x'+H, 'ch', info.channels, 'hasAlpha', m.hasAlpha, 'corner', px(0,0), 'diagInset', diag, 'topEdge', top, 'ink', [x0,y0,x1,y1].map(v=>(v/W).toFixed(3)).join(','));
}
