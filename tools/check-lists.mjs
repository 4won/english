import fs from 'fs';
import path from 'path';
const root = path.resolve(import.meta.dirname, '..');
const files = [['beginner','tools/beginner-list.txt'],...['elementary','intermediate','upper','advanced'].map(l=>[l,`data-src/lists/words-${l}.txt`])];
const seen = new Map(); let bad = 0;
const stem = w => w.replace(/(ing|ed|es|s|er|ly)$/,'');
const stems = new Map();
for (const [lv,f] of files) {
  if (!fs.existsSync(path.join(root,f))) { console.log('missing',f); bad++; continue; }
  const lines = fs.readFileSync(path.join(root,f),'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length!==30) { console.log(lv,'lines',lines.length); bad++; }
  lines.forEach((ln,i)=>{
    const [ch,rest]=ln.split('|'); if(+ch!==i+1){console.log(lv,'chnum',ln.slice(0,10));bad++;}
    const ws=rest.split(',').map(s=>s.trim());
    if(ws.length!==20){console.log(lv,'ch',ch,'count',ws.length);bad++;}
    for(const w of ws){
      if(!/^[a-zA-Z]+$/.test(w)){console.log(lv,ch,'badword',w);bad++;}
      const k=w.toLowerCase();
      if(seen.has(k)){console.log('DUP',k,seen.get(k),'/',lv+':'+ch);bad++;} else seen.set(k,lv+':'+ch);
      const s=stem(k); if(s.length>3){ if(stems.has(s)&&stems.get(s)!==k) console.log('stem?',k,stems.get(s)); else stems.set(s,k);}
    }
  });
}
console.log('total words',seen.size,'problems',bad);
process.exit(bad?1:0);
