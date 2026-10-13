// 信義街景・火場作業規則（訓練示意）：水箱水量與消防栓補水、空氣呼吸器氣量、瞄子水柱／水霧、多樓層火點與延燒。
// 玩法參考一般消防模擬遊戲的作業循環（供水 → 進攻 → 氣量管理），未使用任何遊戲的程式或素材。
// 所有數值皆為遊戲化示意，非實際水箱容量、流量、氣瓶規格或火場物理；不得作為裝備或戰術依據。純函式，可在 Node 測試。

export const WATER={tank:2000,refill:30};            // 水箱 2,000 L；接上消防栓後每秒補 30 L（示意）
export const NOZZLE={
 stream:{label:'直線水柱',reach:22,cone:.30,knockdown:.075,flow:6},   // L/s
 fog:{label:'水霧',reach:12,cone:.62,knockdown:.11,flow:7.5},
};
export const AIR={full:300,use:1.1,warn:55,reserve:30,hazard:25,refillTime:4,swapBelow:270}; // bar；火點 25 m 內耗氣，每秒 1.1 bar（示意）
export const SPREAD={threshold:.85,after:45,upperStart:.4};          // 火勢 ≥ 0.85 持續 45 秒延燒上一樓（示意）
export const SUPPLY={length:80};                                    // 供水水帶 80 m（示意）

// 水箱：射水時依瞄子流量扣水；有消防栓供水時補水，不超過容量。回傳 {water, empty}
export function stepWater(water,dt,{spraying=false,mode='stream',supplied=false}={}){
 let w=water;if(spraying)w-=NOZZLE[mode].flow*dt;if(supplied)w+=WATER.refill*dt;w=Math.max(0,Math.min(WATER.tank,w));return {water:w,empty:w<=0};
}
// 空氣呼吸器：在危害區（任一燃燒中火點水平 25 m 內）每秒耗氣；在消防車旁（備用氣瓶放置處）停止射水並停留 refillTime 秒即更換氣瓶（氣量低於 swapBelow 才更換）。
// 消防車可能停在危害區範圍內，因此換瓶不要求離開危害區，但換好之前仍持續耗氣（示意）。
export function stepAir(air,dt,{inHazard=false,atEngine=false,swapTimer=0}={}){
 const a=inHazard?Math.max(0,air-AIR.use*dt):air;
 if(atEngine&&a<AIR.swapBelow){const s=swapTimer+dt;if(s>=AIR.refillTime)return {air:AIR.full,swapTimer:0,warn:false,empty:false,swapped:true};return {air:a,swapTimer:s,warn:a<=AIR.warn,empty:a<=0,swapped:false};}
 return {air:a,swapTimer:0,warn:a<=AIR.warn,empty:a<=0,swapped:false};
}
// 危害區：任一燃燒中火點水平距離 ≤ AIR.hazard
export const inHazard=(x,z,fires)=>fires.some(f=>f.intensity>0&&Math.hypot(x-f.site.x,z-f.site.z)<=AIR.hazard);

// 射水目標：在瞄子射程與錐角內、燃燒中的火點中，取最近者（立體距離，含樓層高度）。
export function sprayTarget(player,aimYaw,fires,mode='stream'){
 const n=NOZZLE[mode];let best=null;
 for(const f of fires){if(!(f.intensity>0))continue;const dx=f.site.x-player.x,dz=f.site.z-player.z,flat=Math.hypot(dx,dz),dist=Math.hypot(flat,(f.site.y??0)-(player.y??1.2));
  const want=Math.atan2(-dx,-dz),diff=Math.abs(Math.atan2(Math.sin(want-aimYaw),Math.cos(want-aimYaw)));
  const r={fire:f,dist,flat,diff,hit:dist<=n.reach&&diff<=n.cone};if(r.hit&&(!best||!best.hit||dist<best.dist))best=r;else if(!best||(!best.hit&&dist<best.dist))best=r;}
 return best;
}
// 延燒：主要火點火勢持續偏高時，蔓延到上一樓（量體高度內）。回傳 {timer, spread}
export function stepSpread(fire,dt,timer,{buildingTop=Infinity,floorHeight=3.4}={}){
 if(fire.intensity>=SPREAD.threshold){const t=timer+dt;const canGo=(fire.site.base??0)+(fire.site.floor+1)*floorHeight<=buildingTop;return {timer:t,spread:t>=SPREAD.after&&canGo};}
 return {timer:Math.max(0,timer-dt*2),spread:false};
}
// 上一樓火點：同一立面、上一樓層。
export const upperSite=(site,floorHeight=3.4)=>({...site,floor:site.floor+1,y:site.y+floorHeight,upper:true});
export const allOut=fires=>fires.every(f=>!(f.intensity>0));
