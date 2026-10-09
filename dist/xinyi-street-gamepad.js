// 遊戲手把（Gamepad API，Standard 配置：Xbox／PlayStation／Switch Pro 等在瀏覽器中的通用按鍵編號）。
// 只把手把狀態轉成與鍵盤相同的動作；不含任何遊戲或廠商素材。純函式，可在 Node 測試。
export const BUTTONS={a:0,b:1,x:2,y:3,lb:4,rb:5,lt:6,rt:7,back:8,start:9,ls:10,rs:11,up:12,down:13,left:14,right:15};
// 單次觸發的動作（按下瞬間）：對應鍵盤 E/F/Q/T/N/R/M/Esc 與鏡頭遠近。
export const PRESS_ACTIONS={a:'vehicle',x:'hose',y:'siren',up:'mission',down:'time',back:'map',start:'pause',left:'zoomIn',right:'zoomOut',rs:'resetCam',rb:'aerial'};
export const DEADZONE=.18;

// 徑向死區：小於死區歸零，其餘重新縮放到 0–1，避免搖桿回中時鏡頭或角色漂移。
export function deadzone(x,y,dz=DEADZONE){const l=Math.hypot(x,y);if(l<dz)return [0,0];const k=Math.min(1,(l-dz)/(1-dz))/l;return [x*k,y*k];}
const val=b=>b==null?0:typeof b!=='object'?+b:(b.value||(b.pressed?1:0));

// 讀取一支手把。prev 為上一幀的按鍵狀態（用來判斷「剛按下」）。回傳：
// move [右, 前]、look [右, 下]、throttle／reverse 0–1（RT／LT）、held 持續動作、pressed 本幀剛按下的動作、buttons 供下一幀比較。
export function readPad(pad,prev=[]){
 const ax=pad?.axes??[],bs=pad?.buttons??[];
 const [mx,my]=deadzone(ax[0]??0,ax[1]??0),[lx,ly]=deadzone(ax[2]??0,ax[3]??0);
 const buttons=bs.map(val),down=name=>(buttons[BUTTONS[name]]??0)>.5;
 const pressed=[];for(const [name,action] of Object.entries(PRESS_ACTIONS)){const i=BUTTONS[name];if((buttons[i]??0)>.5&&!((prev[i]??0)>.5))pressed.push(action);}
 const trig=v=>v<.06?0:v;
 return {move:[mx,0-my||0],look:[lx,ly],throttle:trig(buttons[BUTTONS.rt]??0),reverse:trig(buttons[BUTTONS.lt]??0),
  held:{run:down('lb')||down('ls'),brake:down('b'),spray:down('rt')},pressed,buttons};
}

// 取第一支已連線的手把（Standard 配置優先）。
export function pickPad(list){const pads=[...(list??[])].filter(p=>p&&p.connected!==false);return pads.find(p=>p.mapping==='standard')??pads[0]??null;}

// 短暫震動回饋（瀏覽器或手把不支援時略過）。
export function rumble(pad,strength=.5,ms=120){try{pad?.vibrationActuator?.playEffect?.('dual-rumble',{duration:ms,strongMagnitude:strength,weakMagnitude:strength*.6});}catch{}}
