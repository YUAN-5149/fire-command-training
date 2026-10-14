// 大量傷患：傷患產生、救護車裝載規則（順序、醫院、擔架／坐姿名額、黑色不後送）、參考比對與完成判定。
import assert from 'node:assert/strict';
import {generateCasualties,loadAmbulance,transportReference,defaultOrder,mciComplete,priority,HOSPITALS} from '../dist/xinyi-street-mci.js';
import {startTriage} from '../dist/xinyi-street-triage.js';

let seed=11;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
const many=generateCasualties(400,rand),tags=many.map(p=>startTriage(p.vitals).tag),share=t=>tags.filter(x=>x===t).length/tags.length;
assert(share('green')>.35&&share('green')<.55,'可行走約 45%');assert(share('black')>.01&&share('black')<.1,'無呼吸約 5%');assert(share('red')>.15);assert(share('yellow')>.05);
assert(new Set(many.map(p=>p.id)).size===400);
for(const p of many){assert(['male','female'].includes(p.sex));assert(p.weight>=48&&p.weight<=90);assert.equal(p.state,'waiting');}

// 手動組一組傷患
const mk=(id,tag,walks)=>({id,state:'waiting',vitals:{walks,breathing:tag!=='black',breathesAfterAirway:tag!=='black',rr:tag==='red'?34:20,radialPulse:true,capRefill:1.5,obeys:tag!=='red',mechanisms:['smoke']},triage:{tag,time:0},hospital:null});
const P=[mk('P1','green',true),mk('P2','red',false),mk('P3','yellow',false),mk('P4','green',true),mk('P5','black',false),mk('P6','green',true),mk('P7','red',false)];
P.forEach((p,i)=>p.triage.time=i);
assert.deepEqual(defaultOrder(P),['P2','P7','P3','P1','P4','P6','P5'],'預設：紅→黃→綠→黑，同色依檢傷先後');
// 未指定醫院者不能裝載
assert.deepEqual(loadAmbulance(P.map(p=>p)),[]);
for(const p of P)p.hospital='A';P[2].hospital='B';
const byOrder=ids=>ids.map(id=>P.find(p=>p.id===id));
// 第一輛：P2（紅、擔架）＋同醫院坐姿 2 位（P1、P4），P7 紅色需擔架但名額已滿
let load=loadAmbulance(byOrder(defaultOrder(P)));assert.deepEqual(load.map(p=>p.id),['P2','P1','P4']);load.forEach(p=>p.state='transported');
// 第二輛：P7（紅）＋P6（綠，同醫院）；P3 為醫院 B 不同車
load=loadAmbulance(byOrder(defaultOrder(P)));assert.deepEqual(load.map(p=>p.id),['P7','P6']);load.forEach(p=>p.state='transported');
load=loadAmbulance(byOrder(defaultOrder(P)));assert.deepEqual(load.map(p=>p.id),['P3']);load.forEach(p=>p.state='transported');
// 只剩黑色：不後送，視為完成
assert.deepEqual(loadAmbulance(byOrder(defaultOrder(P))),[]);assert(mciComplete(P));
// 第一位為可行走者時，坐姿名額先算他
{const Q=[mk('Q1','green',true),mk('Q2','green',true),mk('Q3','green',true),mk('Q4','yellow',false)];Q.forEach(p=>p.hospital='C');assert.deepEqual(loadAmbulance(Q).map(p=>p.id),['Q1','Q2','Q4']);}

// 參考比對：倒置（綠先於紅）、紅送非重度級、未檢傷與未後送
{const R=[mk('R1','green',true),mk('R2','red',false),mk('R3','yellow',false)];R.push({...mk('R4','green',true),triage:null});
 const deps=[{time:10,hospital:'C',patients:['R1']},{time:20,hospital:'B',patients:['R2']}];R[0].state=R[1].state='transported';
 const ref=transportReference(R,deps);
 assert(ref.notes.some(n=>n.kind==='order'&&n.text.startsWith('R2')),'紅色晚於綠色後送');assert(ref.notes.some(n=>n.kind==='hospital'&&n.text.includes('R2')),'紅色送往非重度級');
 assert(ref.notes.some(n=>n.kind==='untriaged'&&n.text.includes('R4')));assert(ref.notes.some(n=>n.kind==='waiting'&&n.text.includes('R3')));
 assert.equal(ref.transported,2);assert.equal(ref.triaged,3);assert.equal(ref.agree,3);
 assert(!mciComplete(R));}
// 正確順序與醫院：無倒置、無醫院註記
{const S=[mk('S1','red',false),mk('S2','yellow',false),mk('S3','green',true)];S.forEach(p=>p.state='transported');
 const ref=transportReference(S,[{time:1,hospital:'A',patients:['S1']},{time:2,hospital:'B',patients:['S2']},{time:3,hospital:'C',patients:['S3']}]);assert.deepEqual(ref.notes,[]);}
assert(priority('red')<priority('yellow')&&priority('yellow')<priority('green')&&priority('green')<priority('black'));
assert.equal(HOSPITALS.filter(h=>h.level==='severe').length,1);
console.log('xinyi-street-mci: ok');
