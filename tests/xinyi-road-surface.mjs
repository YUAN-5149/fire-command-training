import assert from 'node:assert/strict';import fs from 'node:fs';
import {MOTO_BOX,stopAxis,groupStopLines,upstreamNormal,motoBoxes,worldUV,pointInRing,strip} from '../dist/xinyi-road-surface.js';

// 停止線中軸與合併：三段共線 3 m 停止線合併為 9 m、3 車道進口。
const seg=(x0,x1,z)=>[x0,z,x1,z,x1,z+.5,x0,z+.5];
const ax=stopAxis(seg(0,3,10));assert.ok(Math.abs(ax.len-3)<1e-9);assert.deepEqual(ax.a.map(v=>+v.toFixed(2)),[0,10.25]);
const g=groupStopLines([seg(0,3,10),seg(3,6,10),seg(6,9,10),seg(20,23,10)]);
assert.equal(g.length,2);const big=g.find(x=>x.lanes===3);assert.ok(Math.abs(big.width-9)<1e-9);
// 不共線（平行但錯開 2 m）不合併。
assert.equal(groupStopLines([seg(0,3,10),seg(3,6,12)]).length,2);

// 上游方向：路口在 z 較小一側（北），上游為南（+z）。
const inter=[[0,0,9,0,9,8,0,8]];const n=upstreamNormal(big,inter);assert.ok(n[1]>.99,'upstream points away from intersection');
assert.equal(upstreamNormal(big,[]),null);

// 合成路口：北側路口、南側 3 車道進口，產生 1 處停等區；單車道不加。
const lanes=[0,3,6].map(x=>[x,8,x+3,8,x+3,40,x,40]);
const data={lanes:{Driving:lanes},intersections:inter,markings:{stop:[seg(0,3,12),seg(3,6,12),seg(6,9,12),seg(30,33,12)]}};
const mb=motoBoxes(data);assert.equal(mb.boxes.length,1);assert.equal(mb.lines.length,3);assert.equal(mb.texts.length,1);
const t=mb.texts[0];assert.ok(t.z>12.25&&t.z<12.25+MOTO_BOX.depth,'text inside box, upstream of stop line');
assert.ok(Math.abs(t.heading)<1e-6||Math.abs(Math.abs(t.heading)-Math.PI)<1e-6);
// 字頭朝下游（北，-z）：heading 前方向量 (−sin h, −cos h) 應指向 -z。
assert.ok(Math.cos(t.heading)>.99,'text top faces the intersection');
// 汽車停止線在上游 depth 處，且整框在車道內。
const car=mb.lines[0];const cz=(car[1]+car[5])/2;assert.ok(Math.abs(cz-(12.25+MOTO_BOX.depth+MOTO_BOX.carStop/2))<1e-6);
assert.ok([0,4].every(i=>lanes.some(r=>pointInRing((car[i]+car[i+2])/2,(car[i+1]+car[i+3])/2,r))),'car stop line on lanes');
assert.equal(mb.skipped,1);

// 穿越道在停止線上游 0.3–4.3 m：停等區移到穿越道上游 0.5 m，另加機車停止線。
const cw=[-1,12.55,10,12.55,10,16.55,-1,16.55];const sh=motoBoxes(data,{crossings:[cw]});assert.equal(sh.boxes.length,1);assert.equal(sh.shifted,1);
assert.ok(Math.abs(sh.boxes[0].shift-(16.55-12.25+.5))<1e-6,'box starts upstream of the crossing');assert.equal(sh.lines.length,4);
const st=sh.texts[0];assert.ok(st.z>16.55+.5&&st.z<16.55+.5+MOTO_BOX.depth,'text clear of the crossing');
// 遠處、未橫跨進口的穿越道不影響。
assert.equal(motoBoxes(data,{crossings:[[40,12.5,50,12.5,50,16,40,16]]}).shifted,0);

// 世界座標 UV。
assert.deepEqual([...worldUV(new Float32Array([6,1,12,-3,0,3]),6)],[1,2,-.5,.5]);
assert.equal(strip([0,0],[10,0],.4).length,8);

// 實際資料：數量穩定、每處皆 ≥2 車道且不改原資料。
const real=JSON.parse(fs.readFileSync(new URL('../dist/assets/lanes-xinyi.json',import.meta.url)));const before=JSON.stringify(real.markings.stop);
const r=motoBoxes(real);assert.ok(r.boxes.length>=25&&r.boxes.length<=45,'moto boxes '+r.boxes.length);
assert.ok(r.boxes.every(b=>b.lanes>=2&&b.width>=MOTO_BOX.minWidth));assert.equal(JSON.stringify(real.markings.stop),before);
console.log('xinyi-road-surface: ok',r.boxes.length,'boxes');
