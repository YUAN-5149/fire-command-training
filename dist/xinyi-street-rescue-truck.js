// 信義街景・救助器材車「信義71」（訓練示意）：臺北市消防局 71 車，後置曲臂式吊臂（HIAB 071 級）、照明燈塔、
// 油壓破壞器材。派遣火警後自信義分隊車庫前出口出勤，沿駕駛路網到火場附近順向停車，停妥後依序作業：
// 支撐腳橫樑外伸 → 滑柱著地 → 燈塔升起、燈頭轉向車尾 → 內臂抬起 → 外臂翻開 → 迴轉朝向火場 → 伸臂 → 放索。
// 吊臂只從車尾一側迴轉（0° 駕駛側 … 180° 乘客側），不越過車身。
// 與水庫車共用同一套出勤、行駛、停車與避讓邏輯（createTanker 的 spec 參數），不載水、不補水。
// 出勤時間、車速、停車點、展開時間皆為示意，不是實際派遣規定或車輛性能。
import {createTanker} from './xinyi-street-tanker.js?v=survey-20261025';
import {rigRescueCrane} from './imported-rescue-truck.js?v=rescue-20261116';

export const RESCUE_TRUCK={name:'信義71',label:'信義71 救助器材車',capacity:0,turnout:45,speed:10,refill:0,range:0,
 tyreRadius:.545,stagingMin:12,stagingMax:45,spacing:11,pitchHalf:2.08,color:'#7ee0a1',tagY:4.3,
 dispatchText:'派遣出勤（救助支援）',arriveText:'抵達現場，架設支撐腳',
 deployTime:30,
 // 車長約 7.7 m：三個碰撞圓
 circles:[-2.6,0,2.6],radius:1.3};

// 吊臂迴轉角：收車時內臂朝駕駛側（車輛區域 Blender -Y），+90° 朝車尾。heading h 時，
// 車尾的世界方向為 (sin h, cos h)、乘客側為 (cos h, -sin h)；只在車尾半圈 [0, π] 內取最接近目標的角度。
export function craneSlewToward(v,tx,tz){
 const wx=tx-v.x,wz=tz-v.z,back=wx*Math.sin(v.heading)+wz*Math.cos(v.heading),right=wx*Math.cos(v.heading)-wz*Math.sin(v.heading);
 const a=Math.atan2(back,-right);return a<0?(a<-Math.PI/2?Math.PI:0):a;
}

export function createRescueTruck(opts){
 const kit=createTanker({...opts,spec:RESCUE_TRUCK}),v=kit.vehicle,crane=rigRescueCrane(v.model);
 const stowed=()=>({state:'stowed',t:0,slew:Math.PI/2});v.crane=stowed();let site=null;
 const dispatch=kit.dispatch,hide=kit.hide,update=kit.update;
 kit.dispatch=(s,o)=>{site=s;v.crane=stowed();crane?.set(0);return dispatch(s,o);};
 kit.hide=()=>{v.crane=stowed();crane?.set(0);hide();};
 kit.update=(dt,ctx)=>{const moved=update(dt,ctx),c=v.crane;
  if(v.state==='parked'&&c.state==='stowed'){c.state='deploying';c.t=0;c.slew=site?craneSlewToward(v,site.x,site.z):Math.PI/2;}
  if(c.state==='deploying'){c.t+=dt;crane?.set(c.t/RESCUE_TRUCK.deployTime,c.slew);
   if(c.t>=RESCUE_TRUCK.deployTime){c.state='ready';v.log.push({t:ctx.now,text:'支撐腳著地、吊臂與照明就位'});ctx.note?.(`${RESCUE_TRUCK.label}支撐腳著地，吊臂與照明燈塔就位`);}}
  return moved;};
 kit.crane=crane;return kit;
}
