// 信義街景・排煙車「劍潭76」（訓練示意）：臺北市消防局 76 車，Fire Wolf 型霧化排煙機（Z 字形伸縮臂）。
// 派遣火警後自信義分隊車庫前出口出勤（示意；實際由劍潭分隊支援），沿駕駛路網到火場附近順向停車，
// 停妥後展開排煙機：起臂 65°（同時調平）→ 伸臂 0.55 m → 旋轉朝向火場 → 葉輪起轉，送風排煙。
// 與水庫車共用同一套出勤、行駛、停車與避讓邏輯（createTanker 的 spec 參數），不載水、不補水。
// 出勤時間、車速、停車點、展開時間皆為示意，不是實際派遣規定或車輛性能。
import {createTanker} from './xinyi-street-tanker.js?v=survey-20261025';
import {rigSmokeFan,FAN} from './imported-smoke-truck.js?v=smoke-20261116';

export const SMOKE_TRUCK={name:'劍潭76',label:'劍潭76 排煙車',capacity:0,turnout:40,speed:10,refill:0,range:0,
 tyreRadius:.545,stagingMin:15,stagingMax:50,spacing:11,pitchHalf:2.08,color:'#ff9c46',tagY:4.2,
 dispatchText:'派遣出勤（排煙支援）',arriveText:'抵達現場，準備展開排煙機',
 deployTime:14,spinUp:5,
 // 車長 7.4 m：三個碰撞圓
 circles:[-2.4,0,2.4],radius:1.3};

// 排煙機朝向：起臂後出風口朝車尾（車輛區域 +X），heading h 時車尾的世界方向為 (sin h, cos h)。
// 回傳讓出風口指向 (tx,tz) 的旋轉角，限制在 ±FAN.slewMax。
export function slewToward(v,tx,tz){
 let a=Math.atan2(tx-v.x,tz-v.z)-v.heading;a=Math.atan2(Math.sin(a),Math.cos(a));
 return Math.max(-FAN.slewMax,Math.min(FAN.slewMax,a));
}

export function createSmokeTruck(opts){
 const kit=createTanker({...opts,spec:SMOKE_TRUCK}),v=kit.vehicle,fan=rigSmokeFan(v.model);
 v.fan={state:'stowed',t:0,slew:0,level:0};let site=null;
 const dispatch=kit.dispatch,hide=kit.hide,update=kit.update;
 kit.dispatch=(s,o)=>{site=s;v.fan={state:'stowed',t:0,slew:0,level:0};fan?.set(0);return dispatch(s,o);};
 kit.hide=()=>{v.fan={state:'stowed',t:0,slew:0,level:0};fan?.set(0);hide();};
 kit.update=(dt,ctx)=>{const moved=update(dt,ctx),f=v.fan;
  if(v.state==='parked'&&f.state==='stowed'){f.state='deploying';f.t=0;f.slew=site?slewToward(v,site.x,site.z):0;}
  if(f.state==='deploying'){f.t+=dt;fan?.set(f.t/SMOKE_TRUCK.deployTime,f.slew);
   if(f.t>=SMOKE_TRUCK.deployTime){f.state='running';f.t=0;v.log.push({t:ctx.now,text:'排煙機展開完成，啟動送風排煙'});ctx.note?.(`${SMOKE_TRUCK.label}排煙機展開完成，開始送風排煙`);}}
  if(f.state==='running'){f.t+=dt;f.level=Math.min(1,f.t/SMOKE_TRUCK.spinUp);}
  if(f.level>0)fan?.spinUp(dt,f.level);
  return moved;};
 kit.fan=fan;return kit;
}
