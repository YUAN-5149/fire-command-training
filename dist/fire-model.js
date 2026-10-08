import {resetFlashover,stepFlashover} from './flashover.js';
import {resetSpread,stepSpread,stepRearSpread} from './fire-spread.js';
// t² design fire + free-burning Heskestad height. Interventions and smoke are teaching proxies.
export const GROWTH={slow:{name:'慢速',alpha:1055/600**2},medium:{name:'中速',alpha:1055/300**2},fast:{name:'快速',alpha:1055/150**2},ultra:{name:'超快速',alpha:1055/75**2}};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function calculateFire({age,rate,maxKW,diameter,factor=1}){const alpha=GROWTH[rate].alpha,theoryKW=Math.min(maxKW,alpha*Math.max(0,age)**2),heatKW=clamp(theoryKW*factor,0,maxKW);return {alpha,theoryKW,heatKW,flameHeight:Math.max(0,.235*heatKW**.4-1.02*diameter)};}
export function refreshFire(s){Object.assign(s,calculateFire(s));s.growth=clamp(s.heatKW/5000);s.stage=s.water&&s.factor<.95?'射水抑制中':s.heatKW<1?'尚未明火成長':s.heatKW>=s.maxKW*.999?'已達設定上限':s.heatKW<1000?'初期燃燒':'火勢成長';return s;}
export function createFireState(){const s=refreshFire({age:120,rate:'medium',maxKW:5000,diameter:1,auto:true,speed:1,factor:1,growth:0,floors:[0,.03,.28,.04,.02],depths:[0,.1,.7,.2,.1],water:0,vent:0,trend:0});resetSpread(s);resetFlashover(s);return s;}
export function effectiveWater(units){return Math.min(2,units.filter(u=>u.task==='滅火'&&u.status==='執行中'&&['front','floor'].includes(u.location)).length);}
export function stepFire(s,dt,{vent=0,water=0}={}){dt=clamp(dt,0,1);vent=clamp(vent);water=clamp(water,0,2);const before=s.heatKW;if(s.auto)s.age=Math.min(1800,s.age+dt*s.speed);s.water=water;s.vent=vent;
// Deliberately uncalibrated tactical response; never a water-flow HRR calculation.
s.factor=clamp(s.factor+dt*(water?-.018*water*s.factor:.004*(1+.3*vent-s.factor)),0,1.3);refreshFire(s);s.trend=dt?(s.heatKW-before)/dt:0;
stepSpread(s,dt);stepRearSpread(s,dt);const old=[...s.floors],p=s.growth;
for(let f=0;f<5;f++){const local=f>=2?s.spreadCells.slice((f-2)*4,(f-1)*4).reduce((a,b)=>a+b,0)+s.rearCells.slice((f-2)*3,(f-1)*3).reduce((a,b)=>a+b,0):0;const source=(f===2?.013*p:f>2?.006*old[f-1]:f===1?.0007*old[2]:0)+.004*p*Math.max(0,local-(f===2?1:0)),clearance=(.002+.012*vent)*old[f];s.floors[f]=clamp(old[f]+dt*(source-clearance));s.depths[f]=clamp(s.depths[f]+dt*(source*3-(.001+.009*vent)*s.depths[f]),0,2.6);}
stepFlashover(s,dt);return s;}
