// 信義街景・大量傷患（MCI）檢傷與後送（訓練示意）。純函式，可在 Node 測試。
// 傷患組成、生命徵象、救護車抵達時間、載運規則與醫院皆為示意，非實際收治能力或派遣規定；
// 後送醫院請依救護派遣與緊急醫療應變中心（EMOC）指示。比對結果只列差異供講評，不評分。
import {makeVitals,startTriage} from './xinyi-street-triage.js?v=s21';

export const HOSPITALS=[
 {id:'A',name:'醫院 A',level:'severe',label:'重度級急救責任醫院（示意）'},
 {id:'B',name:'醫院 B',level:'moderate',label:'中度級（示意）'},
 {id:'C',name:'醫院 C',level:'general',label:'一般級（示意）'},
];
// 救護車：第一輛於大量傷患通報後 60 秒抵達，之後每 45 秒一輛（遊戲時間，示意）。
export const AMBULANCE={first:60,interval:45,stretcher:1,seated:2};
const PRIORITY={red:0,yellow:1,green:2,black:3};
export const priority=tag=>PRIORITY[tag]??9;

// 產生傷患：可行走 45%、重傷 30%、昏迷 20%、無呼吸 5%（暢通呼吸道後仍無呼吸，START 為黑）。
export function generateCasualties(n,rand=Math.random){
 const out=[];
 for(let i=0;i<n;i++){const r=rand(),sex=rand()<.5?'male':'female';
  let condition,vitals;
  if(r<.45){condition='well';vitals=makeVitals('well',rand);}
  else if(r<.75){condition='serious';vitals=makeVitals('serious',rand);}
  else if(r<.95){condition='unconscious';vitals=makeVitals('unconscious',rand);}
  else{condition='unconscious';vitals={walks:false,breathing:false,breathesAfterAirway:false,rr:0,radialPulse:false,capRefill:4,obeys:false,mechanisms:['smoke'],trauma:false};}
  out.push({id:'P'+String(i+1).padStart(2,'0'),sex,condition,vitals,weight:Math.round(sex==='male'?60+rand()*30:48+rand()*27),state:'waiting',triage:null});}
 return out;
}
const ambulatory=p=>p.vitals.walks;
// 依後送順序裝載一輛救護車：取順序中第一位可後送者（已檢傷、非黑、未後送），醫院以其為準；
// 再依順序補上同一醫院、仍有座位的傷患（擔架 1、坐姿 2）。回傳被載運者。
export function loadAmbulance(queue,{stretcher=AMBULANCE.stretcher,seated=AMBULANCE.seated}={}){
 const ready=queue.filter(p=>p.triage&&p.triage.tag!=='black'&&p.state!=='transported'&&p.hospital);
 if(!ready.length)return [];
 const first=ready[0],load=[first];let s=ambulatory(first)?0:1,c=ambulatory(first)?1:0;
 for(const p of ready.slice(1)){if(p.hospital!==first.hospital)continue;if(ambulatory(p)){if(c<seated){load.push(p);c++;}}else if(s<stretcher){load.push(p);s++;}if(s>=stretcher&&c>=seated)break;}
 return load;
}
// 參考比對（以 START 參考分類為準）：後送先後是否倒置、紅色是否送往非重度級、黑色是否列入後送、未檢傷者。
export function transportReference(patients,departures){
 const notes=[],order=[];for(const d of departures)for(const id of d.patients)order.push({id,time:d.time,hospital:d.hospital});
 const byId=Object.fromEntries(patients.map(p=>[p.id,p]));
 const ref=p=>startTriage(p.vitals).tag;
 const zh=t=>({red:'紅',yellow:'黃',green:'綠',black:'黑'})[t];
 // 先後倒置：每位傷患列出比他先後送、但 START 參考較不優先的傷患。
 for(let j=0;j<order.length;j++){const b=byId[order[j].id],earlier=order.slice(0,j).filter(o=>o.time<order[j].time&&priority(ref(byId[o.id]))>priority(ref(b))).map(o=>`${o.id}（${zh(ref(byId[o.id]))}）`);
  if(earlier.length)notes.push({kind:'order',text:`${b.id}（START ${zh(ref(b))}）晚於 ${earlier.join('、')} 後送`});}
 for(const o of order){const p=byId[o.id],h=HOSPITALS.find(x=>x.id===o.hospital);if(ref(p)==='red'&&h?.level!=='severe')notes.push({kind:'hospital',text:`${p.id}（START 紅）送往 ${h?.name??'—'}（${h?.label??''}）`});}
 const waiting=patients.filter(p=>p.state!=='transported');
 const untriaged=waiting.filter(p=>!p.triage);if(untriaged.length)notes.push({kind:'untriaged',text:`尚未檢傷 ${untriaged.length} 人：${untriaged.map(p=>p.id).join('、')}`});
 const left=waiting.filter(p=>p.triage&&ref(p)!=='black');if(left.length)notes.push({kind:'waiting',text:`尚未後送 ${left.length} 人：${left.map(p=>p.id).join('、')}`});
 const agree=patients.filter(p=>p.triage).filter(p=>p.triage.tag===ref(p)).length;
 return {notes,agree,triaged:patients.filter(p=>p.triage).length,transported:order.length};
}
// 預設後送順序（使用者可調整）：依使用者的檢傷分類（紅→黃→綠），同色依檢傷先後。
export function defaultOrder(patients){return [...patients].filter(p=>p.triage).sort((a,b)=>priority(a.triage.tag)-priority(b.triage.tag)||a.triage.time-b.triage.time).map(p=>p.id);}
export const mciComplete=patients=>patients.every(p=>p.state==='transported'||(p.triage&&p.triage.tag==='black'));
