// 臺北市災害應變中心模型檢視（assets/taipei-eoc.glb，由 blender/build_taipei_eoc.py 產生）
// 模型座標：原點為主體西南角，glTF +X 東、−Z 北、+Y 上，單位公尺。
import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {OrbitControls} from './vendor/OrbitControls.js';

const $=id=>document.getElementById(id);
const COMPASS=['北','北北東','東北','東北東','東','東南東','東南','南南東','南','南南西','西南','西南西','西','西北西','西北','北北西'];
// 視角：[相機位置, 注視點]
const VIEWS={
 aerial:[[-75,95,90],[22,12,-26]],
 southeast:[[110,85,80],[24,12,-24]],
 corner:[[-17,2.5,7],[6,12,-10]],
 plaza:[[60,2.5,7],[52,10,-22]],
 helipad:[[-5,58,-62],[19,38,-16]]
};
const KIND={eoc:'臺北市災害應變中心',helipad:'頂樓停機坪',vehicle:'停放車輛'};

let renderer;
try{renderer=new T.WebGLRenderer({canvas:$('view'),antialias:true});}
catch(e){$('loading').hidden=true;$('error').hidden=false;throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.toneMapping=T.ACESFilmicToneMapping;

const scene=new T.Scene();
const camera=new T.PerspectiveCamera(45,1,.5,3000);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2-.02;controls.minDistance=4;controls.maxDistance=600;

const hemi=new T.HemisphereLight('#dfe9f2','#5b5a52',1.6);scene.add(hemi);
const sun=new T.DirectionalLight('#fff4e0',2.6);sun.position.set(-90,140,60);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-130,right:130,top:130,bottom:-130,near:10,far:450});
sun.target.position.set(20,0,-25);scene.add(sun,sun.target);
const padLight=new T.PointLight('#ff8a2a',0,60,1.6);padLight.position.set(19,40,-16);scene.add(padLight);

let edgeMats=[],sock=null,lightsOn=false,night=false;

function setView(name){const [p,t]=VIEWS[name];camera.position.set(...p);controls.target.set(...t);controls.update();
 document.querySelectorAll('.views button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));}
function applyLighting(){
 const sky=night?'#0b1220':'#b9cbd8';scene.background=new T.Color(sky);scene.fog=new T.Fog(sky,night?180:320,night?700:1400);
 hemi.intensity=night?.25:1.6;sun.intensity=night?.15:2.6;sun.color.set(night?'#9fb4ff':'#fff4e0');
 renderer.toneMappingExposure=night?1.4:1;
 for(const m of edgeMats){m.emissive.set('#ff7a1a');m.emissiveIntensity=lightsOn?(night?6:3):0;}
 padLight.intensity=lightsOn&&night?40:0;
 $('day').classList.toggle('on',!night);$('night').classList.toggle('on',night);
 $('lightsOn').classList.toggle('on',lightsOn);$('lightsOff').classList.toggle('on',!lightsOn);
}
function setWind(from){
 $('windLabel').textContent=COMPASS[Math.round(from/22.5)%16];
 // 風向袋指向下風處；袋身沿物件 +X（東）建模，繞 Y 逆時針為正
 if(sock)sock.rotation.set(0,T.MathUtils.degToRad(-90-from),0);
}
function describe(obj){
 for(let o=obj;o;o=o.parent){const d=o.userData||{};if(!d.kind)continue;
  const title=KIND[d.kind]||d.kind,name=o.name.replace(/_/g,' ');
  if(d.kind==='eoc')return name==='EOC east wing'?`<b>${title}</b><small>東翼・${d.floors} 層（示意）</small>`:`<b>${title}</b><small>主體・${d.floors-1} 層＋頂層（示意）</small>`;
  if(d.kind==='helipad')return `<b>${title}</b><small>停機坪面高約 ${Number(d.deck_height).toFixed(1)} m（示意）</small>`;
  return `<b>${title}</b><small>${name}</small>`;}
 return '<b>周邊環境</b><small>道路、鄰棟或植栽（示意）</small>';
}

function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();

new GLTFLoader().load('assets/taipei-eoc.glb',gltf=>{
 const root=gltf.scene;scene.add(root);
 root.traverse(o=>{
  if(o.isMesh){o.castShadow=o.receiveShadow=true;
   for(const m of [].concat(o.material))if(m.name==='Helipad edge light'&&!edgeMats.includes(m))edgeMats.push(m);}
  if(/windsock/i.test(o.name))sock=o;
  if(o.userData?.kind==='helipad'&&o.userData.deck_height)$('deckH').textContent=Math.round(o.userData.deck_height);
 });
 applyLighting();setWind(+$('wind').value);setView('aerial');
 $('loading').hidden=true;
},ev=>{if(ev.total)$('loadStep').textContent=Math.round(ev.loaded/ev.total*100)+'%';},
err=>{console.error(err);$('loading').hidden=true;$('error').textContent='模型載入失敗，請重新整理頁面。';$('error').hidden=false;});

document.querySelectorAll('.views button').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('day').onclick=()=>{night=false;applyLighting();};
$('night').onclick=()=>{night=true;applyLighting();};
$('lightsOn').onclick=()=>{lightsOn=true;applyLighting();};
$('lightsOff').onclick=()=>{lightsOn=false;applyLighting();};
$('wind').oninput=e=>setWind(+e.target.value);
$('panelToggle').onclick=()=>{const c=$('panel').classList.toggle('collapsed');$('panelToggle').setAttribute('aria-expanded',String(!c));$('panelToggle').textContent='資訊與控制 '+(c?'▸':'▾');};
if(innerWidth<=700||innerHeight<=560)$('panelToggle').click();

// 點選（拖曳旋轉時不觸發）
const ray=new T.Raycaster(),ptr=new T.Vector2();let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
renderer.domElement.addEventListener('pointerup',e=>{
 if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;
 ptr.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight)*2+1);ray.setFromCamera(ptr,camera);
 const hit=ray.intersectObjects(scene.children,true).find(h=>h.object.isMesh);
 if(hit)$('pick').innerHTML=describe(hit.object);
});

let t=0;
renderer.setAnimationLoop(()=>{t+=1/60;
 if(lightsOn&&night)for(const m of edgeMats)m.emissiveIntensity=4+2*Math.sin(t*4);
 controls.update();renderer.render(scene,camera);});
