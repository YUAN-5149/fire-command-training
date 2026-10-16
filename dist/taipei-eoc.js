// 臺北市災害應變中心模型檢視（assets/taipei-eoc.glb，由 blender/build_taipei_eoc.py 產生）
// 模型座標：原點為主體西南角，glTF +X 東、−Z 北、+Y 上，單位公尺。
// 寫實化只在瀏覽器端進行：天空與環境反射、環境光遮蔽（高畫質）、以世界座標產生的牆板縫、
// 鋪面與柏油紋理、夜間隨機亮窗。GLB 本身不變。
import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {DRACOLoader} from './vendor/jsm/loaders/DRACOLoader.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {EffectComposer} from './vendor/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from './vendor/jsm/postprocessing/RenderPass.js';
import {GTAOPass} from './vendor/jsm/postprocessing/GTAOPass.js';
import {OutputPass} from './vendor/jsm/postprocessing/OutputPass.js';

const $=id=>document.getElementById(id);
const COMPASS=['北','北北東','東北','東北東','東','東南東','東南','南南東','南','南南西','西南','西南西','西','西北西','西北','北北西'];
// 視角：[相機位置, 注視點]
const VIEWS={
 aerial:[[-75,95,90],[22,12,-26]],
 southeast:[[110,85,80],[24,12,-24]],
 corner:[[-17,2.5,7],[6,12,-10]],
 plaza:[[60,2.5,7],[52,10,-22]],
 helipad:[[-5,58,-62],[19,38,-16]],
 ramp:[[-3.5,8,-12],[-3.4,-2,-46]],
 north:[[22,2.5,-86.5],[22,8,-40]],
 street:[[2,1.7,13],[16,11,-8]]
};
const KIND={eoc:'臺北市災害應變中心',helipad:'頂樓停機坪',vehicle:'停放車輛',ramp:'地下停車場車道',
 apartment:'鄰近住宅大樓',shophouse:'鄰近街屋',school:'信義國中校舍'};
// 白天／夜間的天空與光線
const TIMES={
 day:{top:'#4f86c6',horizon:'#cfdbe4',ground:'#5d5b55',sun:'#fff1dc',sunI:4.2,hemiSky:'#bcd3ea',hemiGround:'#57514a',hemiI:.42,env:.55,exposure:.82,fog:.0009,sunDir:[-.55,.72,.42]},
 night:{top:'#03060f',horizon:'#1a2333',ground:'#0b0c0e',sun:'#8fa6ff',sunI:.15,hemiSky:'#2a3a5c',hemiGround:'#15161a',hemiI:.3,env:.3,exposure:1.1,fog:.0016,sunDir:[.3,.8,-.4]}
};
const mobile=matchMedia('(pointer:coarse)').matches||innerWidth<=700;

let renderer;
try{renderer=new T.WebGLRenderer({canvas:$('view'),antialias:true,powerPreference:'high-performance'});}
catch(e){$('loading').hidden=true;$('error').hidden=false;throw e;}
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
renderer.toneMapping=T.ACESFilmicToneMapping;

const scene=new T.Scene();
const camera=new T.PerspectiveCamera(45,1,.5,4000);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.68;controls.minDistance=4;controls.maxDistance=600;

const hemi=new T.HemisphereLight('#fff','#000',1);scene.add(hemi);
const sun=new T.DirectionalLight('#fff',1);sun.castShadow=true;
Object.assign(sun.shadow.camera,{left:-110,right:110,top:110,bottom:-110,near:10,far:520});
sun.shadow.bias=-.0004;sun.shadow.normalBias=.06;sun.shadow.radius=2.5;
const SUN_TARGET=new T.Vector3(22,0,-24);sun.target.position.copy(SUN_TARGET);scene.add(sun,sun.target);
const padLight=new T.PointLight('#ff8a2a',0,60,1.6);padLight.position.set(19,40,-16);scene.add(padLight);

// ---- 天空：漸層＋太陽光暈，同時作為環境反射來源
const skyUniforms={top:{value:new T.Color()},horizon:{value:new T.Color()},ground:{value:new T.Color()},
 sunDir:{value:new T.Vector3()},sunColor:{value:new T.Color()},sunStrength:{value:1}};
function skyMesh(){
 const m=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,uniforms:skyUniforms,
  vertexShader:'varying vec3 vDir;void main(){vDir=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
  fragmentShader:`uniform vec3 top,horizon,ground,sunDir,sunColor;uniform float sunStrength;varying vec3 vDir;
void main(){vec3 d=normalize(vDir);float h=d.y;
 vec3 c=h>0.?mix(horizon,top,pow(h,.45)):mix(horizon,ground,pow(min(-h*4.,1.),.6));
 float s=max(dot(d,normalize(sunDir)),0.);
 c+=sunColor*(pow(s,900.)*20.+pow(s,24.)*.35+pow(s,4.)*.08)*sunStrength;
 gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
 const s=new T.Mesh(new T.SphereGeometry(1500,48,24),m);s.frustumCulled=false;s.renderOrder=-1;return s;
}
scene.add(skyMesh());
const envScene=new T.Scene();envScene.add(skyMesh());
const pmrem=new T.PMREMGenerator(renderer);let envRT=null;
function rebuildEnv(){envRT?.dispose();envRT=pmrem.fromScene(envScene,.02);scene.environment=envRT.texture;}

// ---- 以世界座標產生的表面細節（模型沒有貼圖，靠 shader 補牆板縫、鋪面與柏油質感）
const NOISE=`varying vec3 vWPos;varying vec3 vWNrm;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p*=2.03;a*=.5;}return s;}
// 牆面座標：水平方向沿 x 或 z，垂直為 y；地面為 xz
vec2 wallUV(){vec3 n=abs(vWNrm);return n.x>n.z?vec2(vWPos.z,vWPos.y):vec2(vWPos.x,vWPos.y);}
float grid(vec2 uv,vec2 cell,float w){vec2 f=abs(fract(uv/cell+.5)-.5)*cell;vec2 aa=fwidth(uv)*1.2;
 vec2 g=1.-smoothstep(vec2(w)-aa,vec2(w)+aa,f);return max(g.x,g.y);}`;
// 每種表面：調整 diffuseColor 與 roughnessFactor
const DETAIL={
 panel:`bool wall=abs(vWNrm.y)<.5;vec2 uv=wall?wallUV():vWPos.xz;
  float j=wall?grid(uv,vec2(.45,.45),.006):0.;
  float v=h21(floor(uv/vec2(.45,.45)))-.5;
  float streak=wall?fbm(vec2(uv.x*.7,uv.y*.08))-.5:fbm(uv*.4)-.5;
  float grime=wall?(1.-smoothstep(.0,2.2,vWPos.y))*.10:0.;
  col*=1.+v*.03+streak*.06-grime;col*=1.-j*.18;rough=clamp(rough+streak*.15+j*.2,0.,1.);`,
 stone:`vec2 uv=abs(vWNrm.y)<.5?wallUV():vWPos.xz;float j=grid(uv,vec2(1.2,.6),.008);
  float v=h21(floor(uv/vec2(1.2,.6)))-.5;col*=(1.+v*.12+(fbm(uv*6.)-.5)*.12)*(1.-j*.4);rough=clamp(rough+(fbm(uv*9.)-.5)*.2,0.,1.);`,
 asphalt:`vec2 uv=vWPos.xz;float p=fbm(uv*.08);float sp=h21(floor(uv*45.));float cr=fbm(uv*.9);
  col*=.85+p*.35+(sp-.5)*.18;col=mix(col,col*1.35,smoothstep(.62,.7,cr)*.5);rough=clamp(rough-.05+(p-.5)*.15,0.,1.);`,
 paving:`vec2 uv=vWPos.xz;float j=grid(uv,vec2(.6,.6),.01);float v=h21(floor(uv/.6))-.5;
  col*=(1.+v*.16+(fbm(uv*.3)-.5)*.2)*(1.-j*.45);rough=clamp(rough+j*.1,0.,1.);`,
 ground:`vec2 uv=vWPos.xz;col*=.8+fbm(uv*.05)*.45+(h21(floor(uv*20.))-.5)*.08;`,
 backdrop:`bool wall=abs(vWNrm.y)<.5;vec2 uv=wall?wallUV():vWPos.xz;
  col*=1.+(fbm(vec2(uv.x*1.5,uv.y*.15))-.5)*.16+(h21(floor(uv/vec2(6.,3.3)))-.5)*.08;
  col*=wall?1.-(1.-smoothstep(0.,3.,vWPos.y))*.12:1.;`,
 tin:`vec2 uv=vWPos.xz;float rib=.5+.5*sin((abs(vWNrm.y)>.5?uv.x:uv.y)*20.);col*=.88+rib*.12+(fbm(uv*.3)-.5)*.3;rough=clamp(rough+(fbm(uv*.7)-.3)*.3,0.,1.);`,
 helipad:`vec2 uv=vWPos.xz;col*=.92+fbm(uv*.25)*.16;rough=clamp(rough+(fbm(uv*1.3)-.5)*.2,0.,1.);`,
 foliage:`col*=.75+fbm(vWPos.xz*.7+vWPos.y)*.5;`
};
const MATERIAL_DETAIL={
 'EOC facade tile grey':'panel','Mast white':'panel','AC unit white':'panel',
 'EOC pier stone grey':'stone','EOC granite beige':'stone','EOC vent louvre beige':'tin','Utility cabinet grey':'stone',
 'Asphalt':'asphalt',
 'Sidewalk paving':'paving','Plaza paving':'paving',
 'Building plot':'ground','Far ground':'ground','Sports field':'ground','Running track blue':'ground',
 'Backdrop concrete':'backdrop','Backdrop tile warm':'backdrop','Backdrop white':'backdrop','School tile cream':'backdrop',
 'Tin roof blue':'tin','Tin roof grey':'tin','Sign red':'tin','Sign green':'tin','Sign orange':'tin','Sign blue':'tin',
 'Helipad surface teal':'helipad',
 'Tree foliage':'foliage','Tree foliage light':'foliage','Hedge':'foliage','Shrub foliage':'foliage',
 'Brick tile red':'backdrop','Brick tile red light':'backdrop','Facade tile cream':'backdrop','Facade tile white':'backdrop',
 'Facade tile beige':'backdrop','Concrete frame white':'backdrop','Roller shutter steel':'tin','Arcade floor tile':'paving'
};
// 夜間亮窗：依世界座標格子雜湊，約四成亮燈
const GLASS={'EOC window glass green':1,'EOC window glass light':1,'EOC curtain glass light green':.7,'Window glass dark':1,'Backdrop window band':1,'EOC curtain glass green':.6,'Taipei 101 glass':.4};
const litMats=[];

function enhance(m){
 const kind=MATERIAL_DETAIL[m.name],glass=GLASS[m.name];
 if(glass){m.roughness=Math.min(m.roughness,.05);m.metalness=Math.max(m.metalness,.6);m.envMapIntensity=2.6;
  m.emissive=new T.Color('#ffcf8a');m.emissiveIntensity=0;m.userData.litMax=1.3*glass;litMats.push(m);}
 else if(/frame|Aluminium|galvanised|louvre/i.test(m.name))m.envMapIntensity=1.3;
 else if(m.name==='Fountain water'){m.roughness=.02;m.metalness=.2;m.envMapIntensity=1.5;}
 if(!kind&&!glass)return;
 m.onBeforeCompile=sh=>{
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWPos;varying vec3 vWNrm;')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWPos=(modelMatrix*vec4(transformed,1.)).xyz;vWNrm=normalize(mat3(modelMatrix)*objectNormal);');
  let f=sh.fragmentShader.replace('#include <common>','#include <common>\n'+NOISE);
  if(kind)f=f.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n{vec3 col=diffuseColor.rgb;float rough=roughnessFactor;'+DETAIL[kind]+'diffuseColor.rgb=col;roughnessFactor=rough;}');
  if(glass)f=f.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n{vec3 cell=floor(vec3(vWPos.x/1.3,vWPos.y/3.6,vWPos.z/1.3));float r=h21(cell.xz+cell.y*7.31);'
   +'totalEmissiveRadiance*=step(.66,r)*(.6+.4*h21(cell.zx*1.7+cell.y));}');
  sh.fragmentShader=f;
 };
 // three 以 onBeforeCompile 原始碼快取 shader；各種表面要各自編譯
 m.customProgramCacheKey=()=>'eoc-'+(kind||'')+'-'+(glass?'glass':'');
 m.needsUpdate=true;
}

// ---- 後製：環境光遮蔽（高畫質）
const composer=new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
const gtao=new GTAOPass(scene,camera,innerWidth,innerHeight);
gtao.updateGtaoMaterial({radius:1.8,distanceExponent:1.5,thickness:2,scale:1.2,samples:16,distanceFallOff:1});
gtao.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:6,rings:2,samples:16});
gtao.blendIntensity=.9;composer.addPass(gtao);
composer.addPass(new OutputPass());

let edgeMats=[],sock=null,lightsOn=false,night=false,high=!mobile;

function setView(name){const [p,t]=VIEWS[name];camera.position.set(...p);controls.target.set(...t);controls.update();
 document.querySelectorAll('.views button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));}
function applyQuality(){
 renderer.setPixelRatio(Math.min(devicePixelRatio,high?2:1.5));
 const size=high?4096:2048;
 if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;}
 gtao.enabled=high;
 $('qHigh').classList.toggle('on',high);$('qStd').classList.toggle('on',!high);resize();
}
function applyLighting(){
 const k=TIMES[night?'night':'day'];
 skyUniforms.top.value.set(k.top);skyUniforms.horizon.value.set(k.horizon);skyUniforms.ground.value.set(k.ground);
 skyUniforms.sunDir.value.set(...k.sunDir).normalize();skyUniforms.sunColor.value.set(k.sun);skyUniforms.sunStrength.value=night?.15:1;
 scene.fog=new T.FogExp2(k.horizon,k.fog);
 hemi.color.set(k.hemiSky);hemi.groundColor.set(k.hemiGround);hemi.intensity=k.hemiI;
 sun.color.set(k.sun);sun.intensity=k.sunI;sun.position.copy(SUN_TARGET).addScaledVector(skyUniforms.sunDir.value,300);
 renderer.toneMappingExposure=k.exposure;scene.environmentIntensity=k.env;
 for(const m of litMats)m.emissiveIntensity=night?m.userData.litMax:0;
 for(const m of edgeMats){m.emissive.set('#ff7a1a');m.emissiveIntensity=lightsOn?(night?6:3):0;}
 padLight.intensity=lightsOn&&night?40:0;
 rebuildEnv();
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
  if(d.kind==='ramp')return `<b>${title}</b><small>緊貼西牆的雙向坡道，往北下坡進入有頂蓋的入口，深約 ${Number(d.depth).toFixed(1)} m（示意）</small>`;
  if(d.floors)return `<b>${title}</b><small>${d.floors} 層（示意，非該棟實際資料）</small>`;
  return `<b>${title}</b><small>${name}</small>`;}
 return '<b>周邊環境</b><small>道路、鄰棟或植栽（示意）</small>';
}

function resize(){const w=innerWidth,h=innerHeight;if(!w||!h)return;renderer.setSize(w,h,false);composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);
 camera.aspect=w/h;camera.updateProjectionMatrix();}
addEventListener('resize',resize);renderer.setPixelRatio(Math.min(devicePixelRatio,high?2:1.5));resize();

const draco=new DRACOLoader().setDecoderPath('vendor/draco/');
new GLTFLoader().setDRACOLoader(draco).load('assets/taipei-eoc.glb?v=8',gltf=>{
 const root=gltf.scene;scene.add(root);const seen=new Set();
 root.traverse(o=>{
  if(o.isMesh){o.castShadow=o.receiveShadow=true;
   for(const m of [].concat(o.material)){if(seen.has(m))continue;seen.add(m);
    if(m.name==='Helipad edge light')edgeMats.push(m);enhance(m);}}
  if(/windsock/i.test(o.name))sock=o;
  if(o.userData?.kind==='helipad'&&o.userData.deck_height)$('deckH').textContent=Math.round(o.userData.deck_height);
 });
 applyQuality();applyLighting();setWind(+$('wind').value);setView('aerial');
 $('loading').hidden=true;draco.dispose();
},ev=>{if(ev.total)$('loadStep').textContent=Math.round(ev.loaded/ev.total*100)+'%';},
err=>{console.error(err);$('loading').hidden=true;$('error').textContent='模型載入失敗，請重新整理頁面。';$('error').hidden=false;});

document.querySelectorAll('.views button').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('day').onclick=()=>{night=false;applyLighting();};
$('night').onclick=()=>{night=true;applyLighting();};
$('lightsOn').onclick=()=>{lightsOn=true;applyLighting();};
$('lightsOff').onclick=()=>{lightsOn=false;applyLighting();};
$('qHigh').onclick=()=>{high=true;applyQuality();};
$('qStd').onclick=()=>{high=false;applyQuality();};
$('wind').oninput=e=>setWind(+e.target.value);
$('panelToggle').onclick=()=>{const c=$('panel').classList.toggle('collapsed');$('panelToggle').setAttribute('aria-expanded',String(!c));$('panelToggle').textContent='資訊與控制 '+(c?'▸':'▾');};
if(innerWidth<=700||innerHeight<=560)$('panelToggle').click();

// 點選（拖曳旋轉時不觸發）
const ray=new T.Raycaster(),ptr=new T.Vector2();let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
renderer.domElement.addEventListener('pointerup',e=>{
 if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;
 ptr.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight)*2+1);ray.setFromCamera(ptr,camera);
 const hit=ray.intersectObjects(scene.children,true).find(h=>h.object.isMesh&&h.object.geometry.type!=='SphereGeometry');
 if(hit)$('pick').innerHTML=describe(hit.object);
});

let t=0;
renderer.setAnimationLoop(()=>{t+=1/60;if(!renderer.domElement.width)return;
 if(lightsOn&&night)for(const m of edgeMats)m.emissiveIntensity=4+2*Math.sin(t*4);
 controls.update();if(camera.position.y<1.2)camera.position.y=1.2;composer.render();});
