// 逐街精修第 1 步：列出某條路沿線的官方量體（牆面中點離道路中心線 maxDist 公尺內），並標出尚未精修者。
//
//   node scripts/list-street.mjs <路名> [maxDist=70] [out.json]
//
// 輸出每棟：id、中心（cx 東、cy 北，公尺，原點同 xinyi-street-world.js）、離路距離 d、高度 h、臨路牆長 front、
// 分類外觀 [style, levels, shop, colour]；已在 building-overrides-xinyi.json 精修過的會標 done。
import fs from 'node:fs';
const read=f=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+f,import.meta.url)));
const [name,maxArg,out]=process.argv.slice(2);
if(!name){console.error('usage: node scripts/list-street.mjs <路名> [maxDist] [out.json]');process.exit(1);}
const maxDist=+maxArg||70;
const streets=read('streets-xinyi.json'),district=read('district-xinyi.json'),styles=read('building-styles-xinyi.json').buildings;
const ov=read('building-overrides-xinyi.json'),done=new Set(ov.streets.flatMap(s=>s.buildings.flatMap(b=>b.ids)));
const LON=100850,LAT=110574,O=[121.5654,25.0338],P=([lon,lat])=>[(lon-O[0])*LON,(lat-O[1])*LAT];
const road=streets.features.filter(f=>f.kind==='road'&&f.tags.name===name).flatMap(f=>f.paths).map(p=>p.map(P));
if(!road.length){console.error('no road named '+name);process.exit(1);}
const segs=road.flatMap(a=>a.slice(1).map((p,i)=>[a[i],p]));
const dist=(x,y)=>Math.min(...segs.map(([a,b])=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t);}));
const pts=road.flat();
console.log(name,'x',Math.round(Math.min(...pts.map(p=>p[0]))),'…',Math.round(Math.max(...pts.map(p=>p[0]))),'y',Math.round(Math.min(...pts.map(p=>p[1]))),'…',Math.round(Math.max(...pts.map(p=>p[1]))));
const list=[];
for(const b of district.buildings){if(!b.walls.length)continue;
 let best=1e9,bw=null;for(const w of b.walls){if(w.w<4)continue;const m=P([(w.a[0]+w.b[0])/2,(w.a[1]+w.b[1])/2]);const d=dist(m[0],m[1]);if(d<best){best=d;bw=w;}}
 if(best>maxDist)continue;
 const c=b.walls.map(w=>P(w.a));
 list.push({id:b.id,cx:Math.round(c.reduce((s,p)=>s+p[0],0)/c.length),cy:Math.round(c.reduce((s,p)=>s+p[1],0)/c.length),d:Math.round(best),
  h:Math.round(Math.max(...b.walls.map(w=>w.h))),front:Math.round(bw.w),style:styles[b.id],done:done.has(b.id)});}
list.sort((a,b)=>b.cy-a.cy||a.cx-b.cx);
if(out)fs.writeFileSync(out,JSON.stringify(list));
console.log('buildings',list.length,'not refined',list.filter(b=>!b.done).length);
for(const b of list)if(!b.done&&b.h>8)console.log(b.id,b.cx,b.cy,'d'+b.d,'h'+b.h,'f'+b.front,(b.style||[]).join('/'));
