// 信義街景・傷患檢傷與急救處置（訓練示意）。
// 檢傷依 START 簡易檢傷分類流程（可否行走 → 呼吸 → 呼吸次數 → 循環 → 意識）；生命徵象為依狀況隨機產生的示意值。
// 急救處置的「常見做法參考」僅供討論，不是醫療判斷或評分，請依單位 EMT 標準與教官講評。純函式，可在 Node 測試。
export const TAGS={green:{label:'綠（輕傷）',color:'#3fb950'},yellow:{label:'黃（中度，可延後）',color:'#e3b341'},red:{label:'紅（立即）',color:'#f85149'},black:{label:'黑（死亡／無呼吸）',color:'#30363d'}};
export const MECHANISMS={smoke:'吸入濃煙',fall:'疑似跌倒、頭頸部撞擊',burn:'手臂燒燙傷',laceration:'前臂撕裂傷出血'};
export const FIRST_AID=[
 {id:'jawThrust',label:'暢通呼吸道（推下顎法）'},
 {id:'headTilt',label:'暢通呼吸道（壓額抬下巴）'},
 {id:'collar',label:'頸圈固定、頸椎保護'},
 {id:'oxygen',label:'給予氧氣'},
 {id:'pressure',label:'直接加壓止血'},
 {id:'cool',label:'燒燙傷沖水降溫、覆蓋'},
 {id:'recovery',label:'復甦姿勢（無頸椎疑慮時）'},
 {id:'warm',label:'保暖'},
 {id:'cpr',label:'CPR／AED'},
];

// 依狀況產生示意生命徵象與受傷機轉。rand 可注入以便測試。
export function makeVitals(condition,rand=Math.random){
 const pick=a=>a[Math.floor(rand()*a.length)],between=(a,b)=>Math.round(a+rand()*(b-a));
 if(condition==='well')return {walks:true,breathing:true,rr:between(16,24),radialPulse:true,capRefill:1.5,obeys:true,mechanisms:['smoke'],trauma:false};
 if(condition==='serious'){const m=pick([['fall'],['burn','smoke'],['laceration']]),shock=rand()<.4;
  return {walks:false,breathing:true,rr:between(20,28),radialPulse:!shock,capRefill:shock?3:1.8,obeys:true,mechanisms:m,trauma:m.includes('fall')||m.includes('laceration')};}
 // 昏迷：多為吸入濃煙，部分合併跌倒撞擊；呼吸道阻塞時需先暢通呼吸道才有呼吸。
 const fall=rand()<.5,obstructed=rand()<.3;
 return {walks:false,breathing:!obstructed,breathesAfterAirway:true,rr:between(8,32),radialPulse:rand()<.7,capRefill:rand()<.5?2.5:1.8,obeys:false,mechanisms:fall?['smoke','fall']:['smoke'],trauma:fall};
}

// START：回傳分類與依據（每一步的判斷）。
export function startTriage(v){
 const steps=[];
 if(v.walks){steps.push('可自行行走');return {tag:'green',steps};}
 steps.push('無法行走');
 if(!v.breathing){steps.push('無自發呼吸');if(!v.breathesAfterAirway){steps.push('暢通呼吸道後仍無呼吸');return {tag:'black',steps};}steps.push('暢通呼吸道後恢復呼吸');return {tag:'red',steps};}
 if(v.rr>30){steps.push(`呼吸 ${v.rr} 次／分（> 30）`);return {tag:'red',steps};}
 steps.push(`呼吸 ${v.rr} 次／分（≤ 30）`);
 if(!v.radialPulse||v.capRefill>2){steps.push(v.radialPulse?`微血管充填 ${v.capRefill} 秒（> 2）`:'摸不到橈動脈脈搏');return {tag:'red',steps};}
 steps.push('循環尚可');
 if(!v.obeys){steps.push('無法遵從簡單指令');return {tag:'red',steps};}
 steps.push('可遵從簡單指令');return {tag:'yellow',steps};
}

// 常見做法參考（非醫療判斷）：依發現列出可討論的處置與理由。
export function aidReference(v){
 const out=[],add=(id,why)=>out.push({id,why});
 if(!v.breathing||!v.obeys)add(v.trauma?'jawThrust':'headTilt',v.trauma?'意識不清且疑似頭頸部撞擊：以推下顎法暢通呼吸道，避免頸部過度移動':'意識不清：維持呼吸道暢通');
 if(v.trauma&&(v.mechanisms.includes('fall')))add('collar','頭頸部撞擊機轉：頸椎保護');
 if(v.mechanisms.includes('smoke'))add('oxygen','吸入濃煙：給予氧氣，留意一氧化碳中毒');
 if(v.mechanisms.includes('laceration'))add('pressure','出血：直接加壓止血');
 if(v.mechanisms.includes('burn'))add('cool','燒燙傷：沖水降溫後覆蓋');
 if(!v.obeys&&v.breathing&&!v.trauma)add('recovery','有呼吸、意識不清且無頸椎疑慮：可考慮復甦姿勢');
 if(!v.walks)add('warm','保暖、持續監測');
 if(!v.breathing&&!v.breathesAfterAirway)add('cpr','無呼吸：依單位流程評估 CPR／AED');
 return out;
}
// 比對學員選擇與參考（只列出差異，不給分）。
export function compareAid(chosen,reference){
 const ref=new Set(reference.map(r=>r.id)),pick=new Set(chosen);
 return {matched:[...pick].filter(id=>ref.has(id)),missing:reference.filter(r=>!pick.has(r.id)),extra:[...pick].filter(id=>!ref.has(id))};
}
// 頸圈：機轉含頭頸部撞擊時於籃架上預防性固定（示意）。
export const needsCollar=v=>!!v?.trauma&&v.mechanisms.includes('fall');

// 等候惡化（示意，一位傷患最多惡化一次）：不可行走且未後送者，等候超過時限後生命徵象變差；
// 相應的處置（給氧、止血、沖水降溫、暢通呼吸道）可延後惡化。回傳 {vitals, note} 或 null（尚未惡化）。
export const DETERIORATE={base:180,perAid:90};
export function deteriorate(v,waited,aid=[]){
 if(v.walks||!v.breathing&&!v.breathesAfterAirway)return null;
 const helps={smoke:'oxygen',laceration:'pressure',burn:'cool'},airway=['jawThrust','headTilt'];
 let delay=DETERIORATE.base;for(const m of v.mechanisms)if(aid.includes(helps[m]))delay+=DETERIORATE.perAid;if(!v.obeys&&aid.some(a=>airway.includes(a)))delay+=DETERIORATE.perAid;
 if(waited<delay)return null;
 if(v.obeys&&v.radialPulse&&v.capRefill<=2)return {vitals:{...v,radialPulse:false,capRefill:3.2,rr:Math.min(34,v.rr+6)},note:'出現休克徵象（摸不到橈動脈、微血管充填變慢）'};
 if(v.obeys)return {vitals:{...v,obeys:false},note:'意識變差，無法遵從指令'};
 return {vitals:{...v,rr:Math.max(v.rr,32)},note:'呼吸變快（> 30 次／分）'};
}
