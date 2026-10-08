import * as THREE from './vendor/three.module.js';

// Local modelling coordinates only. None of these dimensions are surveyed.
export const initialStudy = Object.freeze({width:16.2,recess:2.5,clear:5.5,door:4,column:.84});
export function studyParts(p){
 const {width:w,recess:d,clear:h,door:q,column:c}=p;
 return [
  {name:'地坪',size:[w+4,.12,d+5],at:[0,-.06,d/2-1],color:0x777e7d},
  {name:'上方量體',size:[w,3,d+3],at:[0,h+1.5,d/2+1.5],color:0xbda875},
  ...[-1,1].map(s=>({name:'柱',size:[c,h,c],at:[s*(w-c)/2,h/2,0],color:0x626862})),
  ...[-1,1].map(s=>({name:'退縮側牆',size:[.16,h,d],at:[s*(w-.16)/2,h/2,d/2],color:0x646b67})),
  ...[-1,1].map(s=>({name:'店面玻璃',size:[(w-q)/2,h,.12],at:[s*(w+q)/4,h/2,d],color:0x395b61,glass:true})),
  {name:'入口玻璃',size:[q,3.2,.08],at:[0,1.6,d],color:0x8aa8ae,glass:true},
  {name:'門楣',size:[q,h-3.2,.12],at:[0,(h+3.2)/2,d],color:0x3d5051},
  ...[-1,0,1].map(s=>({name:'門框',size:[.065,3.2,.16],at:[s*q/2,1.6,d-.04],color:0xd0d6d3}))
 ];
}
// Visible features from the user's Google Maps photo. Local sizes remain illustrative.
export const photoInitialStudy=Object.freeze({...initialStudy,clear:8.4});
export function photoStudyParts(p){
 const {width:w,recess:d,clear:h,door:q}=p,r=q*.3,panelTop=h-2.9,doorH=Math.min(3.2,panelTop-.2);
 const out=[
  {name:'入口前鋪面',size:[w+4,.12,d+5],at:[0,-.06,d/2-1],color:0x787571},
  {name:'頂部外牆示意',size:[w,1.5,d+2],at:[0,h+.89,d/2+1],color:0xb0a48d},
  {name:'退縮頂板',size:[w,.14,d],at:[0,h+.07,d/2],color:0x252c2e},
  ...[-1,1].map(s=>({name:'旁側玻璃',size:[(w-q)/2,h,.12],at:[s*(w+q)/4,(h)/2,d],color:0x395b61,glass:true})),
  {name:'銀灰招牌面板',size:[q,panelTop-doorH,.16],at:[0,(panelTop+doorH)/2,d],color:0xb9babc},
  {name:'上方玻璃帶',size:[q,2.7,.12],at:[0,panelTop+1.35,d],color:0x3f5b63,glass:true},
  {name:'門楣',size:[q,.18,.18],at:[0,doorH+.09,d],color:0x252c2e},
  {name:'玻璃旋轉門圓筒',shape:'cylinder',radius:r,height:doorH,at:[0,doorH/2,d-r],color:0x95adb4,glass:true},
  ...[0,1].map(i=>({name:'旋轉門頂底框',shape:'cylinder',radius:r+.04,height:.1,at:[0,i?doorH:.05,d-r],color:0x424a4c})),
  ...[-1,1].map(s=>({name:'旋轉門旁玻璃',size:[(q-2*r)/2,doorH,.08],at:[s*(q/2+r)/2,doorH/2,d],color:0x97b1b7,glass:true})),
  ...[-1,0,1].map(i=>({name:'旋轉門扇',size:[r*1.8,doorH,.05],at:[0,doorH/2,d-r],turn:i*Math.PI/3,color:0xa4b9bd,glass:true})),
  {name:'門軸',size:[.06,doorH,.06],at:[0,doorH/2,d-r],color:0x424a4c},
  {name:'微風文字樣板',shape:'label',text:'微風\nBreeze',size:[q*.65,(panelTop-doorH)*.75],at:[0,(panelTop+doorH)/2,d-.12],color:0xe72837},
  {name:'SAMSUNG文字樣板',shape:'label',text:'SAMSUNG',size:[q*.9,.65],at:[0,panelTop+1.4,d-.1],color:0xffffff}
 ];
 for(let x=-w/2;x<=w/2+.01;x+=w/12)out.push({name:'細框玻璃分隔',size:[.06,h,.16],at:[x,(h)/2,d-.03],color:0x313d43});
 for(const y of [doorH,panelTop,h])out.push({name:'水平玻璃框',size:[w,.06,.18],at:[0,y,d-.04],color:0x313d43});
 for(let i=0;i<5;i++)out.push({name:'頂板燈示意',shape:'cylinder',radius:.08,height:.05,at:[(i-2)*w/6,h-.025,d*.45],color:0xffdc9b,light:true});
 return out;
}
function photoMesh(s){
 if(s.shape==='label'){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#'+s.color.toString(16).padStart(6,'0');ctx.textAlign='center';ctx.textBaseline='middle';const lines=s.text.split('\n');ctx.font=lines.length>1?'bold 90px system-ui':'bold 65px system-ui';lines.forEach((line,i)=>ctx.fillText(line,256,lines.length>1?70+i*115:128));const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(...s.size),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide}));mesh.rotation.y=Math.PI;return mesh;
 }
 const geometry=s.shape==='cylinder'?new THREE.CylinderGeometry(s.radius,s.radius,s.height,48):new THREE.BoxGeometry(...s.size);
 const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:s.color,roughness:s.glass?.2:.7,metalness:s.glass?.3:.05,transparent:!!s.glass,opacity:s.glass?.42:1,side:THREE.DoubleSide,...(s.light?{emissive:s.color,emissiveIntensity:1}:{})}));mesh.rotation.y=s.turn||0;return mesh;
}
export async function openEntranceStudy({onLocate}={}){
 const dialog=document.createElement('dialog');dialog.className='entrance-study';
 dialog.innerHTML=`<style>
 .entrance-study{width:min(1100px,94vw);max-width:94vw;max-height:94vh;padding:0;border:1px solid #60727e;border-radius:12px;background:#111c25;color:#edf4f8;font:16px/1.5 system-ui;box-sizing:border-box}.entrance-study::backdrop{background:#000b}.entrance-study header{display:flex;justify-content:space-between;gap:16px;padding:16px 20px;border-bottom:1px solid #415360}.entrance-study h2{font-size:20px;margin:0}.entrance-study button{width:auto;margin:0;flex-shrink:0;color:#edf4f8;background:#263c4b;border:1px solid #6b8496;padding:9px 14px;border-radius:5px;font:inherit;cursor:pointer}.entrance-study .study-body{display:grid;grid-template-columns:1fr 290px}.entrance-study .study-view{position:relative;min-height:430px;background:#1c2c38;touch-action:none}.entrance-study canvas{display:block;width:100%;height:100%}.entrance-study .study-tag{position:absolute;top:12px;left:14px;color:#ffe0a3;background:#17202de8;padding:6px 10px;pointer-events:none}.entrance-study .study-controls{padding:16px;background:#182630;overflow:auto;max-height:65vh}.entrance-study p{font-size:16px;margin:0 0 12px}.entrance-study label{display:block;margin:12px 0}.entrance-study input{display:block;width:100%;margin-top:5px;accent-color:#d9ae67}.entrance-study .study-status{color:#ffe0a3}.entrance-study a{color:#b4d7f2}.entrance-study small{font-size:14px}.entrance-study .study-tools{position:absolute;bottom:14px;left:14px;display:flex;gap:8px}.entrance-study .study-error{padding:24px}.entrance-study button:focus-visible{outline:3px solid #e6c785}@media(max-width:760px){.entrance-study .study-body{grid-template-columns:1fr}.entrance-study .study-view{min-height:330px}.entrance-study .study-controls{max-height:none}.entrance-study{overflow:auto}.entrance-study .study-tag{font-size:14px}}
 </style><header><div><h2>入口照片核對・三維草稿</h2><small>微風南山 · 入口方位與尺寸待驗證</small></div><button data-close aria-label="關閉入口與騎樓草稿">關閉</button></header><div class="study-body"><div class="study-view"><div class="study-tag">示意尺寸 · 待現況核對</div><div class="study-tools"><button data-front>正面</button><button data-left>左斜角</button><button data-oblique>右斜角</button><button data-top>俯視</button></div></div><div class="study-controls"><p class="study-status">此草稿未放入實際街廓，也未設定為可通行空間。</p><p>依您提供的入口照片修正旋轉門、銀灰面板、紅色文字、玻璃細框與頂部照明。未保留沒有照片支持的兩根寬柱。所有尺寸仍為試作值。</p><button data-locate>回街廓核對入口候選</button><p style="margin-top:12px"><small>官方一樓、二樓圖對照：西側松智路中央入口為候選，精確門位待確認。定位框不代表門洞或通行範圍。</small></p><div class="study-inputs"></div><button data-reset>還原試作尺寸</button><p style="margin-top:16px"><small>拖曳旋轉，滾輪拉近。修改只保留於本次草稿；關閉後回到原地圖。</small></p><p><b>尚待補齊</b><br>已取得一張入口近照（頁面標示 2026年9月）。待核對同一入口所在側、另一斜角，以及退縮深度、淨寬、淨高、門寬與高差。</p><p><a href="https://maps.app.goo.gl/21Te8VpT3m5qd9cW6" target="_blank" rel="noopener">您提供的入口照片</a><br><a href="https://www.breeze.com.tw/stores/8242" target="_blank" rel="noopener">官方 SAMSUNG 櫃位（2F）</a><br><small>店家資訊與照片上方字樣一致；不能據此確認入口方位。</small></p><p><a href="https://www.archdaily.com/zh/900607/tai-bei-nan-shan-yan-chang-san-ling-di-suo-she-ji/5b76d6e4f197cca99b000176-taipei-nanshan-plaza-mitsubishi-jisho-sekkei-floor-plan" target="_blank" rel="noopener">建築師公開一樓圖面（2018）</a><br><small>僅供入口關係核對；未以螢幕圖面比例當作現場尺寸。</small></p><p><b>接續順序</b><br>核對此入口 → 相鄰建物 → 松智路路口。</p></div></div>`;
 document.body.append(dialog);dialog.showModal();const locateButton=dialog.querySelector('[data-locate]');locateButton.hidden=typeof onLocate!=='function';locateButton.onclick=()=>{dialog.close();onLocate();};
 const area=dialog.querySelector('.study-view'),params={...photoInitialStudy};let renderer,observer,parts,closed=false;
 const close=()=>{if(closed)return;closed=true;observer?.disconnect();parts?.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});renderer?.dispose();dialog.remove();};
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',close,{once:true});
 try{renderer=new THREE.WebGLRenderer({antialias:true});}catch(e){area.innerHTML='<p class="study-error">目前無法顯示三維草稿，請使用支援三維圖形的瀏覽器。右側仍可查看待補尺寸。</p>';return;}
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x1c2c38);area.prepend(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.1,200);scene.add(new THREE.HemisphereLight(0xeaf4ff,0x37402b,2.4));const sun=new THREE.DirectionalLight(0xfff0d2,3);sun.position.set(-8,14,-10);scene.add(sun);
 let yaw=.38,pitch=.2,distance=28;
 const render=()=>{if(closed)return;camera.position.set(Math.sin(yaw)*Math.cos(pitch)*distance,3+Math.sin(pitch)*distance,-Math.cos(yaw)*Math.cos(pitch)*distance);camera.lookAt(0,4.5,1);renderer.render(scene,camera);};
 function rebuild(){if(parts){scene.remove(parts);parts.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});}parts=new THREE.Group();for(const s of photoStudyParts(params)){const mesh=photoMesh(s);mesh.name=s.name;mesh.position.set(...s.at);parts.add(mesh);}scene.add(parts);render();}
 for(const [key,label,min,max,step] of [['recess','退縮深度',.5,6,.1],['clear','頂板下淨高',6,10,.1],['width','單元外寬',10,20,.1],['door','入口單元寬（含旁側玻璃）',2,6,.1]]){
  const labelEl=document.createElement('label');labelEl.textContent=label+'（示意）';const output=document.createElement('output'),input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=params[key];input.setAttribute('aria-label',label+'，示意尺寸');output.textContent=' '+params[key].toFixed(2)+' m';labelEl.append(output,input);dialog.querySelector('.study-inputs').append(labelEl);input.oninput=()=>{params[key]=Number(input.value);output.textContent=' '+params[key].toFixed(2)+' m';rebuild();};
 }
 dialog.querySelector('[data-reset]').onclick=()=>{Object.assign(params,photoInitialStudy);dialog.querySelectorAll('input').forEach((input,i)=>{const key=['recess','clear','width','door'][i];input.value=params[key];input.previousElementSibling.textContent=' '+params[key].toFixed(2)+' m';});rebuild();};
 dialog.querySelector('[data-front]').onclick=()=>{yaw=0;pitch=.05;distance=32;render();};dialog.querySelector('[data-left]').onclick=()=>{yaw=-.65;pitch=.25;distance=30;render();};dialog.querySelector('[data-oblique]').onclick=()=>{yaw=.65;pitch=.25;distance=30;render();};dialog.querySelector('[data-top]').onclick=()=>{yaw=0;pitch=1.4;distance=24;render();};
 let pointer;renderer.domElement.onpointerdown=e=>{pointer=[e.clientX,e.clientY];renderer.domElement.setPointerCapture(e.pointerId);};renderer.domElement.onpointermove=e=>{if(!pointer)return;yaw-=(e.clientX-pointer[0])*.006;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-pointer[1])*.004,.03,1.45);pointer=[e.clientX,e.clientY];render();};renderer.domElement.onpointerup=renderer.domElement.onpointercancel=()=>{pointer=null;};renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();distance=THREE.MathUtils.clamp(distance+e.deltaY*.02,12,55);render();},{passive:false});
 observer=new ResizeObserver(()=>{renderer.setSize(area.clientWidth,area.clientHeight,false);camera.aspect=area.clientWidth/area.clientHeight;camera.updateProjectionMatrix();render();});observer.observe(area);rebuild();
}
