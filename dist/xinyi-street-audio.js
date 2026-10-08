// 信義街景音效：全部以 Web Audio 即時合成，不使用錄音檔或外部素材。
// 警笛為長音起伏（wail）示意，非特定消防局實際警笛規格；引擎聲依車速改變音高。
export function createAudio(){
 let ctx=null,nodes=null;const vol={master:.8,siren:.7,engine:.6,ambient:.5};let muted=false;
 function noiseBuffer(c){const b=c.createBuffer(1,c.sampleRate*2,c.sampleRate),d=b.getChannelData(0);let last=0;for(let i=0;i<d.length;i++){const w=Math.random()*2-1;last=(last+.02*w)/1.02;d[i]=last*3.5;}return b;}
 function start(){
  if(ctx)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;ctx=new AC();
  const master=ctx.createGain(),comp=ctx.createDynamicsCompressor();master.connect(comp).connect(ctx.destination);
  // 警笛：鋸齒波＋方波，低通後輸出；頻率由 update 依時間掃頻。
  const sirenGain=ctx.createGain();sirenGain.gain.value=0;const sirenFilter=ctx.createBiquadFilter();sirenFilter.type='lowpass';sirenFilter.frequency.value=3200;
  const s1=ctx.createOscillator(),s2=ctx.createOscillator();s1.type='sawtooth';s2.type='square';const s2g=ctx.createGain();s2g.gain.value=.35;
  s1.connect(sirenFilter);s2.connect(s2g).connect(sirenFilter);sirenFilter.connect(sirenGain).connect(master);s1.start();s2.start();
  // 引擎：低頻鋸齒波＋次諧波＋棕噪音，低通濾波。
  const engGain=ctx.createGain();engGain.gain.value=0;const engFilter=ctx.createBiquadFilter();engFilter.type='lowpass';engFilter.frequency.value=420;engFilter.Q.value=4;
  const e1=ctx.createOscillator(),e2=ctx.createOscillator();e1.type='sawtooth';e2.type='triangle';const e2g=ctx.createGain();e2g.gain.value=.6;
  const en=ctx.createBufferSource();en.buffer=noiseBuffer(ctx);en.loop=true;const eng=ctx.createGain();eng.gain.value=.25;
  e1.connect(engFilter);e2.connect(e2g).connect(engFilter);en.connect(eng).connect(engFilter);engFilter.connect(engGain).connect(master);e1.start();e2.start();en.start();
  // 城市環境：濾波噪音（遠方車流）。
  const amb=ctx.createBufferSource();amb.buffer=noiseBuffer(ctx);amb.loop=true;const ambFilter=ctx.createBiquadFilter();ambFilter.type='bandpass';ambFilter.frequency.value=260;ambFilter.Q.value=.5;const ambGain=ctx.createGain();ambGain.gain.value=0;
  amb.connect(ambFilter).connect(ambGain).connect(master);amb.start();
  nodes={master,sirenGain,s1,s2,engGain,engFilter,e1,e2,ambGain};apply();
 }
 function apply(){if(!nodes)return;nodes.master.gain.setTargetAtTime(muted?0:vol.master,ctx.currentTime,.05);}
 const api={
  vol,
  get state(){return ctx?.state??'not-started';},
  // 首次使用者操作後才能啟動（瀏覽器自動播放政策）。
  unlock(){start();if(ctx?.state==='suspended')ctx.resume();},
  setVolume(name,v){vol[name]=v;apply();},
  setMuted(m){muted=m;apply();},
  suspend(){ctx?.suspend();},resume(){if(ctx&&!muted)ctx.resume();},
  // siren: 0–1（含距離衰減）；speed: m/s；driving: 是否在車上；night: 環境音較小。
  update({t,siren=0,speed=0,driving=false,engineNear=0,ambient=1}){
   if(!nodes)return;const now=ctx.currentTime,k=.08;
   const sweep=.5-.5*Math.cos(t*2*Math.PI/4.2),f=620+sweep*900;// 約 4.2 秒一個起伏
   nodes.s1.frequency.setTargetAtTime(f,now,.03);nodes.s2.frequency.setTargetAtTime(f*1.005,now,.03);
   nodes.sirenGain.gain.setTargetAtTime(siren*vol.siren*.22,now,k);
   const rpm=Math.min(1,Math.abs(speed)/33);const base=38+rpm*95;
   nodes.e1.frequency.setTargetAtTime(base,now,.1);nodes.e2.frequency.setTargetAtTime(base/2,now,.1);nodes.engFilter.frequency.setTargetAtTime(300+rpm*900,now,.1);
   nodes.engGain.gain.setTargetAtTime((driving?(.16+rpm*.22):.1*engineNear)*vol.engine,now,k);
   nodes.ambGain.gain.setTargetAtTime(.12*ambient*vol.ambient,now,.5);
  }
 };
 return api;
}
