// GIS 部署頁與信義街景共用的部署資料（同一網站、同一瀏覽器的 localStorage）。
// 只存在使用者這台裝置；無法存取 localStorage 時兩頁仍各自運作，只是不同步。
export const GEO_UNITS=[{id:'engine1',name:'第一車組・水箱車',model:'engine',crew:['leader','crew','crew','crew']},{id:'engine2',name:'第二車組・水箱車',model:'engine',crew:['squad','crew','crew','crew']},{id:'engine3',name:'第三車組・水箱車',model:'engine',crew:['squad','crew','crew','crew']},{id:'ambulance',name:'第四車組・救護車',model:'ambulance',crew:['crew','crew']},{id:'aerial',name:'雲梯車・待命',model:'aerial',crew:['crew','crew']},{id:'commander',name:'中隊長',model:'commander',crew:[]}];
// 人員模型鍵 → 制服階級（深藍隊員；小隊長一圈、分隊長兩圈紅帶；中隊長黃色）。
export const CREW_RANK={crew:'隊員',squad:'小隊長',leader:'分隊長',commander:'中隊長'};
export const storeKey=place=>'fireDeployment:'+place;

export function loadDeployment(place,storage=globalThis.localStorage){
 try{const v=JSON.parse(storage?.getItem(storeKey(place))||'null');if(!v||typeof v!=='object')return null;
  return {items:v.items&&typeof v.items==='object'?v.items:{},logs:Array.isArray(v.logs)?v.logs:[],target:v.target??null,entrance:v.entrance??null,savedAt:v.savedAt??null,source:v.source??null};}catch{return null;}
}
export function saveDeployment(place,state,source,storage=globalThis.localStorage){
 try{storage?.setItem(storeKey(place),JSON.stringify({items:state.items,logs:state.logs.slice(0,200),target:state.target,entrance:state.entrance,savedAt:new Date().toISOString(),source}));return true;}catch{return false;}
}

// 車頭朝向：GIS 為自北順時針度數（0 北、90 東）；街景為繞 Y 軸弧度，前方向量 (−sin h, −cos h)，x 東、z 南。
export const gisToStreetHeading=deg=>-deg*Math.PI/180;
export const streetToGisHeading=h=>((-h*180/Math.PI)%360+360)%360;
// 由前方向量（x 東、z 南）求 GIS 朝向。
export const forwardToGisHeading=(fx,fz)=>((Math.atan2(fx,-fz)*180/Math.PI)%360+360)%360;

// 與 GIS 部署頁相同的人員排列：以車組朝向旋轉 2×2 格（0.9 m），回傳東、北位移（公尺）。
export function crewOffsets(heading,count){
 const a=heading*Math.PI/180;
 return Array.from({length:count},(_,i)=>{const x=(i%2-.5)*.9,y=(Math.floor(i/2)-.5)*.9;return [x*Math.cos(a)+y*Math.sin(a),-x*Math.sin(a)+y*Math.cos(a)];});
}
