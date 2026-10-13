// 火場作業規則：水箱與補水、氣量與換瓶、瞄子模式射程與錐角、多火點目標、延燒；傷患等候惡化。
import assert from 'node:assert/strict';
import {WATER,NOZZLE,AIR,SPREAD,stepWater,stepAir,inHazard,sprayTarget,stepSpread,upperSite,allOut} from '../dist/xinyi-street-ops.js';
import {deteriorate,startTriage,DETERIORATE} from '../dist/xinyi-street-triage.js';

// 水箱：直線水柱 6 L/s 約 333 秒用完；水霧較耗水；接消防栓會補到滿、不超過容量
{let w=WATER.tank,t=0;while(!stepWater(w,1,{spraying:true}).empty){w=stepWater(w,1,{spraying:true}).water;t++;}assert(t>=330&&t<=334,String(t));
 assert(stepWater(1000,10,{spraying:true,mode:'fog'}).water<stepWater(1000,10,{spraying:true}).water);
 assert.equal(stepWater(1990,10,{supplied:true}).water,WATER.tank);assert(stepWater(500,10,{spraying:true,supplied:true}).water>500,'補水大於用水');}
// 氣量：危害區內耗氣、低於 55 bar 警告、0 為用盡；在消防車旁、危害區外停留 4 秒換瓶
{let s={air:AIR.full,swapTimer:0},t=0;while(!s.empty){s=stepAir(s.air,1,{inHazard:true});t++;}assert(t>=270&&t<=274,String(t));
 assert(stepAir(50,0,{inHazard:true}).warn);assert(!stepAir(200,1,{}).warn);
 let r=stepAir(40,1,{atEngine:true});assert(!r.swapped&&r.air===40&&r.swapTimer===1);r=stepAir(40,1,{atEngine:true,inHazard:true});assert(!r.swapped&&r.air<40,'換好前仍耗氣');r=stepAir(40,1,{atEngine:true,swapTimer:3.5});assert(r.swapped&&r.air===AIR.full);
 assert(stepAir(40,1,{atEngine:true,inHazard:true,swapTimer:3.9}).swapped,'車旁即使在危害範圍內也可換瓶');assert(stepAir(40,1,{inHazard:true,swapTimer:3.9}).air<40);}
// 危害區
{const fires=[{site:{x:0,z:0},intensity:.5},{site:{x:100,z:0},intensity:0}];assert(inHazard(10,10,fires));assert(!inHazard(100,1,fires),'已熄滅火點不算');assert(!inHazard(30,0,fires));}
// 瞄子：水柱射程長、錐角窄；水霧射程短、錐角寬
{const f=[{site:{x:0,z:-18,y:1.2},intensity:.5}];assert(sprayTarget({x:0,z:0,y:1.2},0,f,'stream').hit);assert(!sprayTarget({x:0,z:0,y:1.2},0,f,'fog').hit,'水霧 12 m 打不到 18 m');
 const g=[{site:{x:4,z:-8,y:1.2},intensity:.5}];assert(!sprayTarget({x:0,z:0,y:1.2},0,g,'stream').hit,'偏 26° 水柱打不到');assert(sprayTarget({x:0,z:0,y:1.2},0,g,'fog').hit,'水霧錐角較寬');
 assert(NOZZLE.fog.knockdown>NOZZLE.stream.knockdown);}
// 多火點：取射程與錐角內最近者；上一樓火點高度計入距離
{const base={x:0,z:-10,y:5,floor:2,base:0},fires=[{site:base,intensity:.6},{site:upperSite(base),intensity:.4}];
 assert.equal(sprayTarget({x:0,z:0,y:1.2},0,fires).fire,fires[0]);fires[0].intensity=0;assert.equal(sprayTarget({x:0,z:0,y:1.2},0,fires).fire,fires[1],'下層熄滅後打上層');
 assert.equal(upperSite(base).floor,3);assert(Math.abs(upperSite(base).y-8.4)<1e-9);assert(!allOut(fires));fires[1].intensity=0;assert(allOut(fires));}
// 延燒：火勢 ≥ 0.85 持續 45 秒才延燒；降下來計時倒退；超過量體高度不延燒
{const fire={site:{floor:3,base:0},intensity:.9};let s={timer:0};for(let i=0;i<44;i++)s=stepSpread(fire,1,s.timer,{buildingTop:30});assert(!s.spread);s=stepSpread(fire,1,s.timer,{buildingTop:30});assert(s.spread);
 assert(!stepSpread(fire,1,60,{buildingTop:12}).spread,'4 樓以上沒有量體不延燒');fire.intensity=.5;assert(stepSpread(fire,1,40).timer<40);}
// 傷患惡化：時限前不惡化；黃色 → 出現休克徵象（START 紅）；相應處置延後；可行走與無呼吸者不套用
{const yellow={walks:false,breathing:true,rr:22,radialPulse:true,capRefill:1.8,obeys:true,mechanisms:['laceration'],trauma:true};
 assert.equal(startTriage(yellow).tag,'yellow');assert.equal(deteriorate(yellow,DETERIORATE.base-1),null);
 const d=deteriorate(yellow,DETERIORATE.base);assert(d&&d.note.includes('休克'));assert.equal(startTriage(d.vitals).tag,'red','惡化後 START 為紅');
 assert.equal(deteriorate(yellow,DETERIORATE.base+60,['pressure']),null,'直接加壓止血可延後');assert(deteriorate(yellow,DETERIORATE.base+DETERIORATE.perAid,['pressure']));
 const red={walks:false,breathing:true,rr:14,radialPulse:true,capRefill:1.8,obeys:false,mechanisms:['smoke'],trauma:false};
 assert(deteriorate(red,DETERIORATE.base).vitals.rr>30);assert.equal(deteriorate(red,DETERIORATE.base+100,['oxygen','headTilt']),null,'給氧與暢通呼吸道可延後');
 assert.equal(deteriorate({...yellow,walks:true},999),null);assert.equal(deteriorate({...red,breathing:false,breathesAfterAirway:false},999),null);}
console.log('xinyi-street-ops: ok');
