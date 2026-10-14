import assert from 'node:assert/strict';
import {stairRoute,samplePath,pathLength,cool,STAIR,stairY,stairTransition,stairSegments,buildingFloors,stackExchange,INTERIOR,ENV,EXPOSURE,seeded,makeFloorPlan,spaceOf,wallSegments,resolveCircle,makeEnv,stepEnv,backdraftRisk,openingOutcome,applyBackdraft,
 layerHeight,feltTemp,visibility,stepExposure,hoseRemaining,pathDoors,searchTime,ppvState,fireCap,thermalColor,connected} from '../dist/xinyi-street-interior-rules.js';

// 平面：同一 seed 重現；空間互不重疊並鋪滿 W×D；起火房間含立面中點；每個房間有門；受困者不在起火房間、不在家具上。
for(let seed=1;seed<=200;seed++){
 const p=makeFloorPlan(seeded(seed),{facadeWidth:10+seed%20,victims:1+seed%2}),q=makeFloorPlan(seeded(seed),{facadeWidth:10+seed%20,victims:1+seed%2});
 assert.deepEqual(p,q,'同 seed 同平面');
 assert(p.W>=14&&p.W<=24);
 const area=p.spaces.reduce((a,s)=>a+(s.x1-s.x0)*(s.z1-s.z0),0);assert(Math.abs(area-p.W*p.D)<1e-6,'空間鋪滿');
 const fire=p.spaces.find(s=>s.id===p.fire.space);assert(fire.z0===0&&fire.x0<=p.W/2&&fire.x1>=p.W/2,'起火房間臨立面中點');assert(p.fire.x>=fire.x0+1.4-1e-9&&p.fire.x<=fire.x1-1.4+1e-9,'火點在房間內、不在隔間牆上');
 assert(p.windows.find(w=>w.fire).space===fire.id);
 for(const s of p.spaces.filter(s=>s.kind==='room'))assert(p.doors.some(d=>d.a===s.id),'房間有門');
 for(const d of p.doors){if(d.locked)assert.equal(d.state,'closed','上鎖的門是關的');const s=p.spaces.find(x=>x.id===d.a);assert(d.x>=s.x0+.45&&d.x<=s.x1-.45,'門在房間牆段內');}
 assert(!p.doors.find(d=>d.a===fire.id).locked,'起火房間門不上鎖');
 for(const v of p.victims){assert.notEqual(v.space,fire.id);assert.equal(spaceOf(p,v.x,v.z).id,v.space);assert(!p.furniture.some(f=>f.space===v.space&&Math.abs(f.x-v.x)<f.w/2&&Math.abs(f.z-v.z)<f.d/2),'受困者不在家具上');}
 for(const f of p.furniture){const s=p.spaces.find(x=>x.id===f.space);assert(f.x-f.w/2>=s.x0&&f.x+f.w/2<=s.x1&&f.z-f.d/2>=s.z0&&f.z+f.d/2<=s.z1,'家具在房間內');}
 assert.equal(spaceOf(p,p.entry.x,p.entry.z).id,'stair');
}
// 碰撞：關閉的門擋住，開啟後可通過；外牆不能穿出。
{const p=makeFloorPlan(seeded(3),{facadeWidth:18});const d=p.doors.find(d=>d.id==='D0');d.state='closed';
 let pos={x:d.x,z:d.z+1};for(let i=0;i<40;i++)pos=resolveCircle(p,pos.x,pos.z-.1,.32,wallSegments(p));assert(pos.z>7,'關門擋住');
 d.state='open';pos={x:d.x,z:d.z+1};for(let i=0;i<40;i++)pos=resolveCircle(p,pos.x,pos.z-.1,.32,wallSegments(p));assert(pos.z<6.5,'開門可通過');
 pos={x:5,z:2};for(let i=0;i<40;i++)pos=resolveCircle(p,pos.x,pos.z-.1,.32,wallSegments(p));assert(pos.z>=.3,'外牆不能穿出');}
// 環境：通風良好的起火房間 — 火勢 0.9 有滾燃徵兆但未閃燃；火勢 1 且門關著時閃燃；無回燃風險。
{const p=makeFloorPlan(seeded(5),{facadeWidth:20});let e=makeEnv(p),ev=[];for(let i=0;i<600;i++)ev.push(...stepEnv(p,e,.5,{intensity:.9}).events);
 assert(ev.includes('rollover')&&!ev.includes('flashover'));assert(!backdraftRisk(e.spaces[p.fire.space]));
 e=makeEnv(p);ev=[];for(let i=0;i<600;i++)ev.push(...stepEnv(p,e,.5,{intensity:1}).events);assert(ev.includes('flashover'),'火勢 1 閃燃');
 // 火勢撲滅後閃燃狀態解除、溫度下降。
 for(let i=0;i<600;i++)stepEnv(p,e,.5,{intensity:0});assert(!e.flashed&&e.spaces[p.fire.space].T<200);}
// 通風受限（窗未破）：含氧下降、火勢上限降低、未燃氣體累積 → 約 70 秒後出現回燃風險。
{const p=makeFloorPlan(seeded(7),{facadeWidth:16,closed:true}),e=makeEnv(p);let t=null;
 for(let i=0;i<400;i++){stepEnv(p,e,.5,{intensity:Math.min(.9,fireCap(e,p))});if(t===null&&backdraftRisk(e.spaces[p.fire.space]))t=i/2;}
 assert(t!==null&&t>30&&t<150,'回燃風險時間 '+t);assert(fireCap(e,p)<.5,'火勢上限降低');
 const f=e.spaces[p.fire.space];assert.equal(openingOutcome(f,'ajar'),'warning');assert.equal(openingOutcome(f,'open'),'backdraft');assert.equal(openingOutcome({T:200,o2:.21,fuel:0,smoke:0},'open'),'safe');
 // 氣體冷卻：水霧降溫並減少未燃氣體，回燃風險解除。
 const g={...f};const p2={...p};let k=0;while(backdraftRisk(e.spaces[p.fire.space])&&k<100){stepEnv(p,e,.5,{intensity:Math.min(.9,fireCap(e,p)),cooling:{space:p.fire.space,rate:1.3}});k++;}
 assert(k<40,'冷卻後解除 '+k);applyBackdraft(g);assert(g.fuel===0&&g.T>=700);}
// 正壓送風：樓梯間門未開／沒有排氣口時無效；開窗並連通後有效，排煙。
{const p=makeFloorPlan(seeded(9),{facadeWidth:18});for(const d of p.doors){d.locked=false;d.state='closed';}
 assert.equal(ppvState(p,true).effective,false);p.doors.find(d=>d.id==='D0').state='open';assert.match(ppvState(p,true).reason,/排氣/);
 const room=p.spaces.find(s=>s.kind==='room'&&s.id!==p.fire.space);p.doors.find(d=>d.a===room.id).state='open';p.windows.find(w=>w.space===room.id).state='open';
 const r=ppvState(p,true);assert(r.effective&&!r.intoFire);const e=makeEnv(p);e.spaces[room.id].smoke=.8;e.spaces.corridor.smoke=.8;
 for(let i=0;i<40;i++)stepEnv(p,e,.5,{intensity:0,fanOn:true});assert(e.spaces[room.id].smoke<.2&&e.spaces.corridor.smoke<.2,'送風排煙');
 p.doors.find(d=>d.a===p.fire.space).state='open';assert(ppvState(p,true).intoFire,'送風範圍含起火房間');assert(connected(p,'stair').has(p.fire.space));}
// 煙層、體感溫度、能見度、熱暴露。
{const e={T:400,smoke:.6,o2:.2,fuel:0};assert(Math.abs(layerHeight(e)-INTERIOR.ceiling*.4)<1e-9);
 assert.equal(feltTemp(e,INTERIOR.eyeStand),400);assert(feltTemp(e,INTERIOR.eyeCrouch)<150,'蹲低在煙層下');
 assert(visibility(e,INTERIOR.eyeStand)<visibility(e,INTERIOR.eyeCrouch));assert.equal(visibility(e,1.6,true),15);
 let x=0;for(let i=0;i<10;i++)x=stepExposure(x,400,1);assert(x>40&&x<50,"400 °C 約 21 秒達上限");for(let i=0;i<12;i++)x=stepExposure(x,400,1);assert.equal(x,EXPOSURE.retreat);for(let i=0;i<5;i++)x=stepExposure(x,60,1);assert.equal(x,EXPOSURE.retreat-30);}
// 水線：45 m −（車到入口 14 m）−（3 樓 2 層樓梯 10 m）＝ 21 m；延長水帶 +20 m。
assert.equal(hoseRemaining({total:45,outside:14,floor:3}),21);assert.equal(hoseRemaining({total:45,extension:20,outside:14,floor:5}),31);
// 隊員路徑：上鎖未破壞的門回報 blocked；破壞後可通過。
{const p=makeFloorPlan(seeded(11),{facadeWidth:18});const d=p.doors.find(d=>d.id==='D0');d.locked=true;d.forced=false;const r=pathDoors(p,'stair','F1');assert.equal(r.doors,null);assert.equal(r.blocked.id,'D0');
 d.forced=true;for(const x of p.doors)if(x!==d)x.locked=false;const r2=pathDoors(p,'stair','F1');assert.deepEqual(r2.doors.map(x=>x.id),['D0','DF1']);}
assert(searchTime({x0:0,x1:6,z0:0,z1:5})===18&&searchTime({x0:0,x1:2,z0:0,z1:2})===6);
// 熱顯像色彩：低溫灰階、高溫轉黃紅。
{const a=thermalColor(20),b=thermalColor(150),c=thermalColor(600);assert(a[0]===a[1]&&a[0]<b[0]);assert(c[2]===0&&c[1]<1);}
// 樓梯：高度連續（下一層第二段頂端 = 本層地面高度 + 樓高），上下行轉換。
{const FH=INTERIOR.floorHeight;assert.equal(stairY('f1',STAIR.zLow),0);assert(Math.abs(stairY('f1',STAIR.zHigh)-FH/2)<1e-9);assert.equal(stairY('landing',11.5),FH/2);assert(Math.abs(stairY('f2',STAIR.zLow)-FH)<1e-9);
 for(let z=STAIR.zLow;z<=STAIR.zHigh;z+=.1){assert(stairY('f1',z)<=FH/2+1e-9&&stairY('f2',z)>=FH/2-1e-9);}
 // 上樓：樓梯口 → 第一段 → 平台 → 第二段 → 上一層樓梯口。
 let s='floor',lv=3;const go=(x,z,o)=>{const t=stairTransition(s,x,z,o);s=t.seg;lv+=t.dLv;return t;};
 go(2.6,8.6,{up:true,down:true});assert.equal(s,'f1');go(2.6,11.3,{up:true,down:true});assert.equal(s,'landing');go(1,10.8,{up:true,down:true});assert.equal(s,'f2');go(1,8.2,{up:true,down:true});assert.deepEqual([s,lv],['floor',4]);
 // 下樓：樓梯口左側 → 下一層第二段，高度連續。
 go(1,8.6,{up:true,down:true});assert.deepEqual([s,lv],['f2',3]);assert(Math.abs(stairY('f2',8.6)-(FH-.2/STAIR.run*FH/2))<1e-9);
 // 最低層沒有下行、最高層沒有上行：停在樓板上；平台側不能直接跨到樓梯井。
 s='floor';lv=1;go(1,8.6,{up:true,down:false});assert.deepEqual([s,lv],['floor',1]);s='floor';go(2.6,8.6,{up:false,down:true});assert.equal(s,'floor');
 s='floor';go(2.6,11.5,{up:true,down:true});assert.equal(s,'floor','只有樓梯口那一側能上梯段');
 assert.equal(stairSegments('floor',{up:false,down:true}).length,2);assert.equal(stairSegments('f1',{up:true,down:true}).length,1);}
// 模型樓層：1 樓到起火層上一層，不超過量體高度。
assert.deepEqual(buildingFloors(3,20),[1,2,3,4]);assert.deepEqual(buildingFloors(5,17),[1,2,3,4,5]);assert.deepEqual(buildingFloors(2,40),[1,2,3]);
// 樓梯間煙囪效應：煙與熱只往上層流。
{const a={T:300,smoke:.8},b={T:20,smoke:0};stackExchange(a,b,1);assert(b.smoke>0&&b.T>20&&a.smoke<.8);const c={T:20,smoke:0},d={T:300,smoke:.8};stackExchange(c,d,1);assert.equal(c.smoke,0);}
// 樓梯路線：1 樓 → 3 樓沿梯段，高度單調上升、終點在 3 樓樓梯口；反向相同；取樣在折線上。
{const FH=INTERIOR.floorHeight,r=stairRoute(1,3);assert.deepEqual(r.at(-1),{x:1.2,z:7.9,y:2*FH});for(let i=1;i<r.length;i++)assert(r[i].y>=r[i-1].y-1e-9);
 for(const p of r)if(p.z>STAIR.zLow+1e-9&&p.z<STAIR.zHigh-1e-9)assert(false,'路線點不在梯段中間');
 const d=stairRoute(3,1);assert.deepEqual(d[0],r.at(-1));assert.deepEqual(d.at(-1),r[0]);assert(Math.abs(pathLength(r)-pathLength(d))<1e-9);
 const q=samplePath(r,pathLength(r)/2);assert(q.y>0&&q.y<2*FH);assert.deepEqual(samplePath(r,1e9).y,2*FH);assert.equal(stairRoute(2,2).length,1);}
// 冷卻：降溫、減少未燃氣體、煙略增；不低於常溫。
{const e={T:400,smoke:.5,o2:.15,fuel:.6};cool(e,1,1);assert(e.T===330&&Math.abs(e.fuel-.42)<1e-9&&e.smoke>.5);for(let i=0;i<20;i++)cool(e,1,1);assert.equal(e.T,ENV.ambient);
 // stepEnv 接受多個冷卻來源（中隊長＋隊員）。
 const p=makeFloorPlan(seeded(2),{facadeWidth:18}),a=makeEnv(p),b=makeEnv(p);a.spaces.F1.T=b.spaces.F1.T=400;stepEnv(p,a,1,{cooling:{space:'F1',rate:1}});stepEnv(p,b,1,{cooling:[{space:'F1',rate:1},{space:'F1',rate:1}]});assert(b.spaces.F1.T<a.spaces.F1.T);}
console.log('xinyi-street-interior: ok');
