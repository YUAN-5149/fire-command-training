import assert from 'node:assert/strict';import fs from 'node:fs';
import {makeUnitFloorPlan,makeFloorPlan,seeded,pathDoors,wallSegments,spaceOf,fireDoor,doorPoint,windowPoint,makeEnv,stepEnv,resolveCircle,STAIR,INTERIOR} from '../dist/xinyi-street-interior-rules.js';

const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/roomform-pp4-floor.json',import.meta.url)));
// 資料：ROOMFORM 11 個房間＋樓梯間與梯廳；樓梯間沿用既有幾何（x 0–3.5、z 7–12），平面 18×12 m。
assert.equal(data.W,18);assert.equal(data.D,12);
for(const id of ['living','dining','kitchen','foyer','hall','master','mbath','study','kids','bath','service','balcony','stair','corridor','lobby'])assert.ok(data.spaces.some(s=>s.id===id),id);
const stair=data.spaces.find(s=>s.id==='stair');assert.deepEqual([stair.x0,stair.x1,stair.z0,stair.z1],[0,3.5,7,12]);assert.equal(STAIR.landing,12);
assert.ok(data.doors.some(d=>d.id==='D0'&&d.a==='stair'&&d.b==='corridor'));
assert.ok(data.source.sha256.length===64&&/roomform/.test(data.source.url));
// 房間不重疊、在平面範圍內。
for(const a of data.spaces){assert.ok(a.x0>=0&&a.x1<=data.W&&a.z0>=0&&a.z1<=data.D,a.id);for(const b of data.spaces)if(a!==b){const ox=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0),oz=Math.min(a.z1,b.z1)-Math.max(a.z0,b.z0);assert.ok(!(ox>.02&&oz>.02),a.id+'/'+b.id);}}
// 起火房間都在臨街側（z 小），與街景起火窗口一致。
for(const [id,f] of Object.entries(data.fire)){const s=data.spaces.find(s=>s.id===id);assert.ok(f.x>s.x0&&f.x<s.x1&&f.z>s.z0&&f.z<s.z1,id);assert.ok(s.z0<2,id+' on street side');}

for(const fireRoom of ['living','master'])for(const seed of [1,2,3,4,5]){
 const p=makeUnitFloorPlan(seeded(seed),data,{floor:9,victims:2,fireRoom});assert.equal(p.fire.space,fireRoom);assert.equal(p.layout,'roomform');
 // 起火房間有對外窗、進攻門存在；大門可破壞後到達所有可搜索房間。
 assert.equal(p.windows.filter(w=>w.fire).length,1);assert.equal(p.windows.find(w=>w.fire).space,fireRoom);
 const fd=fireDoor(p);assert.ok(fd&&(fd.a===fireRoom||fd.b===fireRoom));
 for(const d of p.doors)d.forced=true;
 for(const s of p.spaces.filter(s=>s.kind!=='outdoor'))assert.ok(pathDoors(p,'stair',s.id).doors,'path to '+s.id);
 // 受困者不在起火房間、不在家具上，位置在所屬房間內。
 assert.equal(p.victims.length,2);for(const v of p.victims){assert.notEqual(v.space,fireRoom);assert.equal(spaceOf(p,v.x,v.z)?.id,v.space);}
 // 開放式連通恆開、不上鎖；欄杆窗恆開。
 assert.ok(p.doors.filter(d=>d.opening).every(d=>d.state==='open'&&!d.locked));assert.ok(p.windows.filter(w=>w.kind==='railing').every(w=>w.state==='open'));
 // 門兩側的接近點分別落在門兩側的空間。
 for(const d of p.doors){for(const id of [d.a,d.b]){const q=doorPoint(p,d,id,.4);assert.equal(spaceOf(p,q.x,q.z)?.id,id,d.id+' side '+id);}}
 for(const w of p.windows){const q=windowPoint(w,.5);assert.equal(spaceOf(p,q.x,q.z)?.id,w.space,w.id);}
}
// 牆段：關門時門洞有門扇線段；開門後門洞可通過。
const p=makeUnitFloorPlan(seeded(7),data,{fireRoom:'master'});const dk=p.doors.find(d=>d.id==='Dkids');dk.locked=false;
dk.state='closed';const closed=wallSegments(p);dk.state='open';const open=wallSegments(p);assert.equal(closed.length,open.length+1);
// 逐步行走（每步 5 cm，同遊戲每幀移動量級）：從走道往兒童房方向走 1.2 m。
const walk=segs=>{let q=doorPoint(p,dk,'hall',.6);const dir=Math.sign(doorPoint(p,dk,'kids',.6).x-q.x);for(let i=0;i<24;i++)q=resolveCircle(p,q.x+dir*.05,q.z,.32,segs);return {q,dir};};
const o=walk(open);assert.ok((o.q.x-dk.x)*o.dir>0,'walk through open south-north door');
const c=walk(closed);assert.ok((c.q.x-dk.x)*c.dir<0,'closed door blocks');
// 大門在梯廳與玄關之間的南北向牆上。
const de=p.doors.find(d=>d.id==='Dentry');assert.equal(de.axis,'z');assert.equal(spaceOf(p,de.x-.4,de.z).id,'lobby');assert.equal(spaceOf(p,de.x+.4,de.z).id,'foyer');

// 熱：關門的主臥火可達閃燃門檻；客廳開放式空間落地門未破時亦可（示意）。
const heat=(room,closed)=>{const q=makeUnitFloorPlan(seeded(1),data,{fireRoom:room,closed}),e=makeEnv(q);let flash=false;for(let t=0;t<600;t++)if(stepEnv(q,e,1,{intensity:1}).events.includes('flashover'))flash=true;return flash;};
assert.ok(heat('master',false));assert.ok(heat('living',true));
// 舊示意平面不受影響。
const g=makeFloorPlan(seeded(1));assert.ok(!g.walls&&!g.layout);assert.equal(wallSegments(g).length>4,true);
console.log('xinyi-street-roomform: ok');
