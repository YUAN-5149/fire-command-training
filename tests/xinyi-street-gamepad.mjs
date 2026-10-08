// 遊戲手把對應：死區、剛按下判斷、扳機與搖桿方向。
import assert from 'node:assert/strict';
import {readPad,pickPad,deadzone,BUTTONS,DEADZONE} from '../dist/xinyi-street-gamepad.js';

const pad=(axes=[0,0,0,0],pressed=[],values={})=>({connected:true,mapping:'standard',axes,buttons:Array.from({length:17},(_,i)=>({pressed:pressed.includes(i),value:values[i]??(pressed.includes(i)?1:0)}))});

// 死區：回中漂移歸零，推到底為 1，方向保持。
assert.deepEqual(deadzone(.1,-.1),[0,0]);
{const [x,y]=deadzone(1,0);assert.equal(x,1);assert.equal(y,0);}
{const [x,y]=deadzone(.6,.8);assert.ok(Math.abs(Math.hypot(x,y)-1)<1e-9);assert.ok(Math.abs(x/y-.75)<1e-9);}
{const [x]=deadzone(DEADZONE+.01,0);assert.ok(x>0&&x<.05,'剛過死區時從接近 0 開始');}

// 搖桿方向：左搖桿往上（axes[1]=-1）為前進；右搖桿為視角。
{const r=readPad(pad([0,-1,.9,0]));assert.deepEqual(r.move,[0,1]);assert.ok(r.look[0]>.8);assert.equal(r.look[1],0);}
// 漂移不移動
{const r=readPad(pad([.08,.1,-.12,.05]));assert.deepEqual(r.move,[0,0]);assert.deepEqual(r.look,[0,0]);}

// 剛按下才觸發；持續按住不重複觸發。
{const first=readPad(pad([0,0,0,0],[BUTTONS.a,BUTTONS.y]));assert.deepEqual(first.pressed.sort(),['siren','vehicle']);
 const again=readPad(pad([0,0,0,0],[BUTTONS.a,BUTTONS.y]),first.buttons);assert.deepEqual(again.pressed,[]);
 const release=readPad(pad(),again.buttons),re=readPad(pad([0,0,0,0],[BUTTONS.a]),release.buttons);assert.deepEqual(re.pressed,['vehicle']);}
for(const [b,a] of [['x','hose'],['up','mission'],['down','time'],['back','map'],['start','pause'],['left','zoomIn'],['right','zoomOut'],['rs','resetCam']])
 assert.deepEqual(readPad(pad([0,0,0,0],[BUTTONS[b]])).pressed,[a],b);

// 扳機：類比值為油門／倒車，極小值歸零；RT 同時是出水按住、B 為煞車、LB／左搖桿按下為跑步。
{const r=readPad(pad([0,0,0,0],[],{[BUTTONS.rt]:.7,[BUTTONS.lt]:.03}));assert.equal(r.throttle,.7);assert.equal(r.reverse,0);assert.equal(r.held.spray,true);}
{const r=readPad(pad([0,0,0,0],[BUTTONS.b,BUTTONS.lb]));assert.equal(r.held.brake,true);assert.equal(r.held.run,true);assert.equal(r.held.spray,false);}
assert.equal(readPad(pad([0,0,0,0],[BUTTONS.ls])).held.run,true);
// B 不在單次動作（關閉選單由頁面另外判斷），避免駕駛煞車時觸發其他動作。
assert.deepEqual(readPad(pad([0,0,0,0],[BUTTONS.b])).pressed,[]);

// 無手把或缺少欄位時不出錯、全為 0。
{const r=readPad(null);assert.deepEqual(r.move,[0,0]);assert.equal(r.throttle,0);assert.deepEqual(r.pressed,[]);}
{const r=readPad({axes:[0,-1],buttons:[true]});assert.deepEqual(r.move,[0,1]);}

// 選擇手把：略過空位與已中斷者，標準配置優先。
{const odd={connected:true,mapping:'',axes:[],buttons:[]},std=pad();assert.equal(pickPad([null,odd,std]),std);assert.equal(pickPad([null,{...std,connected:false}]),null);assert.equal(pickPad([odd]),odd);assert.equal(pickPad(undefined),null);}

console.log('xinyi-street-gamepad: ok');
