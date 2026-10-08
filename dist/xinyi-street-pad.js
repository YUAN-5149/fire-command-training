// 信義街景・手把（標準配置 Gamepad API，Xbox／PS 皆適用）：每幀輪詢，按鍵只在「剛按下」時觸發一次。
// 搖桿死區 0.18；未接手把時不影響鍵盤與觸控。
export const PAD={A:0,B:1,X:2,Y:3,LB:4,RB:5,LT:6,RT:7,BACK:8,START:9,LS:10,RS:11,UP:12,DOWN:13,LEFT:14,RIGHT:15};
const DEAD=.18,dz=v=>Math.abs(v)<DEAD?0:(v-Math.sign(v)*DEAD)/(1-DEAD);

export function createGamepad(nav=globalThis.navigator){
 let prev=[],id=null;
 const pad={connected:false,name:'',move:[0,0],look:[0,0],rt:0,lt:0,held:new Set(),pressed:new Set(),
  poll(){
   const list=nav?.getGamepads?.()??[],g=[...list].find(p=>p&&p.connected&&p.mapping==='standard')??[...list].find(p=>p&&p.connected);
   pad.pressed.clear();pad.held.clear();
   if(!g){pad.connected=false;pad.move=[0,0];pad.look=[0,0];pad.rt=pad.lt=0;prev=[];return pad;}
   if(g.id!==id){id=g.id;prev=[];}
   pad.connected=true;pad.name=g.id;
   const b=g.buttons.map(x=>typeof x==='object'?x.value:x);
   b.forEach((v,i)=>{if(v>.5){pad.held.add(i);if(!(prev[i]>.5))pad.pressed.add(i);}});prev=b;
   const ax=g.axes;pad.move=[dz(ax[0]??0),-dz(ax[1]??0)];pad.look=[dz(ax[2]??0),dz(ax[3]??0)];pad.rt=b[PAD.RT]??0;pad.lt=b[PAD.LT]??0;
   return pad;
  },
 };
 return pad;
}
