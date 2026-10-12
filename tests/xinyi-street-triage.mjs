// START 檢傷流程、示意生命徵象、急救處置參考與比對。
import assert from 'node:assert/strict';
import {startTriage,makeVitals,aidReference,compareAid,needsCollar,FIRST_AID,TAGS} from '../dist/xinyi-street-triage.js';

const base={walks:false,breathing:true,breathesAfterAirway:true,rr:20,radialPulse:true,capRefill:1.5,obeys:true,mechanisms:['smoke'],trauma:false};
assert.equal(startTriage({...base,walks:true}).tag,'green','可行走 → 綠');
assert.equal(startTriage({...base,breathing:false,breathesAfterAirway:false}).tag,'black','暢通呼吸道後仍無呼吸 → 黑');
assert.equal(startTriage({...base,breathing:false,breathesAfterAirway:true}).tag,'red','暢通呼吸道後恢復 → 紅');
assert.equal(startTriage({...base,rr:34}).tag,'red','呼吸 > 30 → 紅');
assert.equal(startTriage({...base,rr:30}).tag,'yellow','呼吸 = 30 不算 > 30');
assert.equal(startTriage({...base,radialPulse:false}).tag,'red','無橈動脈 → 紅');
assert.equal(startTriage({...base,capRefill:2.5}).tag,'red','微血管充填 > 2 秒 → 紅');
assert.equal(startTriage({...base,capRefill:2}).tag,'yellow','= 2 秒不算 > 2');
assert.equal(startTriage({...base,obeys:false}).tag,'red','無法遵從指令 → 紅');
assert.equal(startTriage(base).tag,'yellow','其餘 → 黃');
assert.deepEqual(startTriage({...base,rr:34}).steps,['無法行走','呼吸 34 次／分（> 30）']);

// 示意生命徵象：可行走者為綠；昏迷者無法遵從指令（紅，若暢通呼吸道後有呼吸）；重傷者不可行走且可遵從指令（黃或紅）。
let seed=3;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
for(let i=0;i<200;i++){
 assert.equal(startTriage(makeVitals('well',rand)).tag,'green');
 const u=makeVitals('unconscious',rand);assert.equal(startTriage(u).tag,'red');assert.equal(u.obeys,false);
 const s=makeVitals('serious',rand);assert(['yellow','red'].includes(startTriage(s).tag));assert(!s.walks&&s.obeys);
 assert.equal(needsCollar(u),u.mechanisms.includes('fall'));
}
// 參考處置：昏迷合併撞擊 → 推下顎、頸圈、給氧、保暖；不建議復甦姿勢與壓額抬下巴。
{const v={...base,obeys:false,mechanisms:['smoke','fall'],trauma:true},ids=aidReference(v).map(r=>r.id);
 assert.deepEqual(ids.sort(),['collar','jawThrust','oxygen','warm'].sort());}
{const v={...base,obeys:false},ids=aidReference(v).map(r=>r.id);assert(ids.includes('headTilt')&&ids.includes('recovery')&&ids.includes('oxygen'));assert(!ids.includes('collar'));}
{const v={...base,mechanisms:['laceration'],trauma:true},ids=aidReference(v).map(r=>r.id);assert(ids.includes('pressure')&&!ids.includes('jawThrust'));}
{const v={...base,mechanisms:['burn','smoke']},ids=aidReference(v).map(r=>r.id);assert(ids.includes('cool')&&ids.includes('oxygen'));}
{const v={...base,breathing:false,breathesAfterAirway:false},ids=aidReference(v).map(r=>r.id);assert(ids.includes('cpr'));}
// 比對：列出相同、未選與額外選擇
{const ref=aidReference({...base,obeys:false,mechanisms:['smoke','fall'],trauma:true}),c=compareAid(['jawThrust','recovery'],ref);
 assert.deepEqual(c.matched,['jawThrust']);assert.deepEqual(c.missing.map(m=>m.id).sort(),['collar','oxygen','warm']);assert.deepEqual(c.extra,['recovery']);}
// 參考處置的代號都在選單中；四種檢傷卡都有顏色
for(const r of aidReference({...base,breathing:false,breathesAfterAirway:false,obeys:false,mechanisms:['smoke','fall','burn','laceration'],trauma:true}))assert(FIRST_AID.some(f=>f.id===r.id),r.id);
for(const t of ['green','yellow','red','black'])assert(TAGS[t].color&&TAGS[t].label);
console.log('xinyi-street-triage: ok');
