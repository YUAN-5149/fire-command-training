import {createEocSidewalks} from './xinyi-eoc-sidewalks.js?v=sidewalk-20261028';
import {createShortGrass,installGrassShaderFallback} from './xinyi-short-grass.js?v=grass-view-20261027';
import {loadTreeAssets,createRealisticTrees} from './xinyi-realistic-trees.js?v=hedges2-20261027';
import {treeInstances} from './xinyi-trees.js?v=5';
import {applyEocFrontage,reviewEocGreen} from './xinyi-eoc-frontage.js?v=photo-20261027';
import {createWalkSurface,placeCharacterFeet} from './xinyi-walk-surface.js?v=ground-20261023';
import {MINI_ZOOM_LEVELS,miniZoom,stepMiniZoom,miniMapMetrics} from './xinyi-minimap.js?v=minimap-20261023';
import {addYouBikeStations} from './xinyi-youbike.js?v=road-audit-20261027';
import {createFrameBudget,createFrameWindow} from './xinyi-performance.js?v=runtime-20261023';
import {addYellowBoxes} from './xinyi-yellow-boxes.js?v=yellowbox-20261023';
import {addZebraCrossings} from './xinyi-zebra-crossings.js?v=zebra-20261023';
import {addRoadPaint,explicitDivider,outerGroundGeometry} from './xinyi-road-paint.js?v=roads-20261023';
import {addZhuangjingStation} from './zhuangjing-station.js?v=zhuangjing-20261023';
import {createWalkMotion,smoothHeading} from './character-motion.js?v=cadence-20261023';
import {createStationCrew} from './xinyi-station-crew.js?v=cadence-20261023';
import {stationSurface,stationCollisionBuildings} from './xinyi-station-spawn.js?v=garage-20261023';
// 信義街景漫遊：與 GIS 頁（taipei-map.html?place=xinyi 預設狀態）共用同一套建物、街道與設施建構函式，
// 只把經緯度轉成本地公尺並改以 Three.js 呈現。外觀為示意；未使用 taipei-gta 的地圖、程式或素材。
import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {createActionScene} from './action-scene.js?v=runtime-20261023';
import {rigWheels} from './wheel-rig.js?v=s25';
import {createStreetLife,TIME_PRESETS,createSky,litWindows} from './xinyi-street-life.js?v=bus-20261023';
import {buildRouteGraph,findRoute,roadLabels} from './xinyi-street-nav.js?v=s25';
import {createBigMap} from './xinyi-street-map.js?v=roads-20261023';
import {createAudio} from './xinyi-street-audio.js?v=s25';
import {RULES,pickFireSite,siteFromBuilding,evaluateParking,sprayHits,createFireFX} from './xinyi-street-mission.js?v=s25';
import {readPad,pickPad,rumble,BUTTONS} from './xinyi-street-gamepad.js?v=s25';
import {createXinyiAerial,buildObstacleIndex,fromFrameXZ,createPatient,needsStretcher,basketLoad,CONDITION_LABEL} from './xinyi-street-aerial.js?v=garage-20261023';
import {WATER,NOZZLE,AIR,SUPPLY,LOWER,stepWater,stepAir,inHazard,sprayTarget,stepSpread,upperSite,lowerSite,allOut} from './xinyi-street-ops.js?v=s25';
import {makeVitals,startTriage,aidReference,compareAid,needsCollar,deteriorate,FIRST_AID,TAGS,MECHANISMS} from './xinyi-street-triage.js?v=s25';
import {generateCasualties,loadAmbulance,transportReference,mciComplete,priority,HOSPITALS,AMBULANCE} from './xinyi-street-mci.js?v=s25';
import {createSquads,SQUAD,pickFloor} from './xinyi-street-squads.js?v=garage-20261023';
import {createTanker,TANKER} from './xinyi-street-tanker.js?v=survey-20261025';
import {createSurveyCar,SURVEY_CAR} from './xinyi-street-survey-car.js?v=survey-20261025';
import {createInterior} from './xinyi-street-interior.js?v=s25';
import {INTERIOR,EXPOSURE,EQUIPMENT,CARRY_LIMIT,hoseRemaining,layerHeight,buildingFloors} from './xinyi-street-interior-rules.js?v=s25';
import {createGisLayer,writeBack} from './xinyi-street-gis.js?v=s25';
import {storeKey} from './deployment-store.js?v=s25';
import {unproject} from './xinyi-street-world.js?v=garage-20261023';
import {buildDistrictBatch} from './geo-district.js';
import {addLanesToScene} from './xinyi-lanes.js?v=roads-20261023';
import {addFurnitureToScene} from './xinyi-furniture.js?v=7';
import {buildFacadeBatch,createFacadeMaterial,facadeGeometry,facadeProps,addFacadeProps,overrideIndex,fillBuildings,styleOf} from './xinyi-facades.js?v=6';
import {detailWalls,shedHeight,facadeCells,buildRoofSheds,addShophouses} from './xinyi-shophouse.js?v=9';
import {kitPlacements,createFacadeKits} from './facade-kits.js?v=2';
import {loadLandmarks,isLandmarkVolume,localToLonLat,footprintBuilding,addLandmarksToThree} from './landmarks-real.js?v=2';
import {drapeSite,enhanceEoc} from './eoc-detail.js?v=rules-20261027';
import {focusedBuilding,buildXinyiDetail,createDetailMaterials,inFocus} from './geo-xinyi-detail.js?v=70';
import {buildStreetDetail,createStreetMaterials} from './geo-street-detail.js';
import {project,buildHeightField,toLocal,linearColors,buildColliders,buildStreetBase,nearestStreet,spawnPoint} from './xinyi-street-world.js?v=garage-20261023';

const $=id=>document.getElementById(id),step=t=>{$('loadStep').textContent=t;};
// 手機（觸控）：版面另套 body.touch（移植自 main 的手機版面），提示文字的鍵盤按鍵改成畫面按鈕名稱。
const TOUCH=matchMedia('(pointer:coarse)').matches;document.body.classList.toggle('touch',TOUCH);
const KEY_BTN={E:'上車／進入',Q:'警示燈',F:'水線',L:'雲梯',T:'任務',K:'檢傷',J:'後送管理',G:'供水',V:'瞄子',U:'裝備',X:'微開門',C:'蹲低',I:'熱顯像'};
const tt=text=>!TOUCH||!text?text:String(text).replace(/按住 Space ?/g,'按住「出水」').replace(/按住 F ?/g,'按住「器材」').replace(/按 ([A-Z])(?![A-Za-z]) ?/g,(m,k)=>KEY_BTN[k]?`點「${KEY_BTN[k]}」`:m).replace(/（([A-Z])）/g,(m,k)=>KEY_BTN[k]?`（「${KEY_BTN[k]}」）`:m);
const canvas=$('view');let renderer;
try{renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(e){$('loading').hidden=true;$('error').hidden=false;throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,1,0.2,2500);
scene.fog=new T.Fog('#c9d6df',250,1100);
// 日照與 GIS 頁精修範圍相同：2026-10-05 下午 3 時（臺灣），太陽約方位 245°、仰角 35°（展示光線）。
const SUN_AZ=245*Math.PI/180,SUN_EL=35*Math.PI/180,sunDir=new T.Vector3(Math.sin(SUN_AZ)*Math.cos(SUN_EL),Math.sin(SUN_EL),-Math.cos(SUN_AZ)*Math.cos(SUN_EL));
const hemi=new T.HemisphereLight('#dfeefa','#6b6458',1.1),sun=new T.DirectionalLight('#fff1d6',2.4);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-70,right:70,top:70,bottom:-70,near:1,far:600});sun.shadow.bias=-0.0004;
scene.add(hemi,sun,sun.target);

function canvasTexture(size,draw){const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
// GIS 頁 Material 參數（color/metallic/roughness/colorTexture/doubleSided）轉為 Three.js 材質。
class GisMaterial{constructor(o){const tex=o.colorTexture?.data??o.colorTexture;let map=null;if(tex){map=new T.CanvasTexture(tex);map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=T.SRGBColorSpace;map.anisotropy=renderer.capabilities.getMaxAnisotropy();}
 return new T.MeshStandardMaterial({color:o.color??'white',map,metalness:o.metallic??0,roughness:o.roughness??.8,side:o.doubleSided?T.DoubleSide:T.FrontSide,vertexColors:true,flatShading:true});}}
function mesh(position,{color,uv,index,groups,materials,material}){
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(position,3));
 if(uv)g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 g.setAttribute('color',color?new T.BufferAttribute(linearColors(color),3):new T.BufferAttribute(new Float32Array(position.length).fill(1),3));
 if(groups){const all=[],mats=[];for(const [kind,faces] of Object.entries(groups)){if(!faces.length)continue;g.addGroup(all.length,faces.length,mats.length);for(let i=0;i<faces.length;i++)all.push(faces[i]);mats.push(materials[kind]);}g.setIndex(all);material=mats;}
 else g.setIndex(index);
 g.computeVertexNormals();g.computeBoundingSphere();const m=new T.Mesh(g,material);m.castShadow=m.receiveShadow=true;return m;
}

step('讀取官方建物量體與路網');
const [district,streets,fixtures,verified,firstBatch]=await Promise.all(['district-xinyi.json','streets-xinyi.json','street-fixtures-xinyi.json','verified-fixtures-xinyi.json','xinyi-first-batch.json'].map(f=>fetch('assets/'+f+'?v=s27').then(r=>{if(!r.ok)throw Error(f+' '+r.status);return r.json();})));
// 全區道路與官方紅黃線為獨立增量，既有核心與人工精修資料不覆寫。
const [roadNetwork,curbData]=await Promise.all(['xinyi-road-network.json','xinyi-curb-markings.json'].map(f=>fetch('assets/'+f+'?v=roads-20261023').then(r=>{if(!r.ok)throw Error(f+' '+r.status);return r.json();}).catch(e=>{console.warn(e);return null;})));
const navigationFeatures=roadNetwork?.features??streets.features;
// 精細地標（消防局、災害應變中心）：缺牆面的官方量體以占地碰撞補上，畫面改用精細模型。
const zhuangjingData=await fetch('assets/zhuangjing-station.json?v=zhuangjing-20261023').then(r=>r.ok?r.json():null).catch(()=>null);
const zhuangjingIds=new Set(zhuangjingData?.buildingIds??[]);
const landmarks=await loadLandmarks().catch(()=>[]);for(const a of landmarks)if(a.collider)district.buildings.push(footprintBuilding(a));
// 逐街精修（building-overrides-xinyi.json）：官方 LOD1 缺漏的量體依 OSM 外框補建（含碰撞與地面高程）。
const legacyFacades=new URLSearchParams(location.search).get('facades')==='legacy';
const overrideData=legacyFacades?null:await fetch('assets/building-overrides-xinyi.json?v=22').then(r=>r.ok?r.json():null).catch(()=>null);
const overrides=overrideIndex(overrideData);if(overrideData)district.buildings.push(...fillBuildings(overrideData,district));
step('建立地形、建物與道路');
const ground=buildHeightField(district.buildings,district.bbox);
ground.at=stationSurface(ground,project,landmarks.find(a=>a.key==='hq'));
const walkSurface=createWalkSurface(ground);
const colliders=buildColliders(stationCollisionBuildings(district.buildings,landmarks.find(a=>a.key==='hq')),ground);
let detailMats,farMat,facadeSigns=null,shophouse=null;
// 建物：精修範圍（中心約 250 m）用 buildXinyiDetail，其餘用 buildDistrictBatch，與 GIS 頁預設相同。
// 被精細地標取代的官方量體保留作地面高程與碰撞，畫面改用精細模型（landmarks-real.js）。
// 逐街精修（building-overrides-xinyi.json）：有精修資料的量體一律用逐棟立面，即使位於中心精修範圍內。
{const shown=district.buildings.filter(b=>!isLandmarkVolume(landmarks,b.id)&&!zhuangjingIds.has(b.id)),refined=shown.filter(b=>focusedBuilding(b)&&!overrides[b.id]),basic=shown.filter(b=>!focusedBuilding(b)||overrides[b.id]);
 // 遠處建物只接收陰影、不投射，減少陰影計算量。
 // 逐棟立面（xinyi-facades.js）：外觀分類由 OSM 推定；?facades=legacy 回到舊的通用窗格。
 const styles=legacyFacades?null:await fetch('assets/building-styles-xinyi.json?v=1').then(r=>r.ok?r.json():null).catch(()=>null);
 if(styles){
  // 臺北街屋精細立面（逐街精修老公寓／住宅大樓的臨街牆）與老公寓屋頂鐵皮加蓋（xinyi-shophouse.js）
  const shopItems=[],shedItems=[],skip=new Map(),nearRoad=(x,z)=>!!nearestStreet(streets.features,x,z,10);
  for(const b of basic){const st=styleOf(styles.buildings,b,overrides),top=Math.max(...b.walls.map(w=>w.h)),floorH=Math.max(2.8,Math.min(5,top/Math.max(1,st.levels)));
   const ws=detailWalls(b,st.style,!!overrides[b.id],{project,facesStreet:nearRoad});
   if(ws.length){shopItems.push({b,style:st.style,shop:st.shop,colour:st.colour,floorH,walls:ws});skip.set(b.id,new Set(ws));}
   const h=shedHeight(b,st.style);if(h)shedItems.push({b,h});}
  const skipWall=(b,k)=>skip.get(b.id)?.has(k)??false;
  const fb=buildFacadeBatch(basic,styles.buildings,overrides,{skipWall});farMat=createFacadeMaterial(T);const far=new T.Mesh(facadeGeometry(T,fb,toLocal,ground,linearColors),farMat);far.castShadow=false;far.receiveShadow=true;far.name='xinyi facades';scene.add(far);
  facadeSigns=addFacadeProps(T,scene,facadeProps(basic,styles.buildings,{project,overrides,skipWall,shed:shedHeight,facesStreet:(x,z)=>!!nearestStreet(streets.features,x,z,9)})).signMat;
  // 精細立面逐格延後建構；每格先放只含精細牆的簡易立面（不含屋頂），精細網格建好後隱藏
  const cells=facadeCells(shopItems,{project});
  for(const c of cells){const bs=c.items.map(it=>({...it.b,roofs:[]}));
   const g=buildFacadeBatch(bs,styles.buildings,overrides,{skipWall:(b,k)=>!skipWall(b,k)});
   c.proxy=new T.Mesh(facadeGeometry(T,g,toLocal,ground,linearColors),farMat);c.proxy.castShadow=false;c.proxy.receiveShadow=true;c.proxy.name='street facade proxy '+c.key;scene.add(c.proxy);}
  shophouse=addShophouses({T,scene,cells,roofs:buildRoofSheds(shedItems,{project}),project});
  // 精修建物臨街牆的立面構件（窗框、窗台、陽台；building_tools 產生，facade-kits.js），背景載入
  createFacadeKits(T,GLTFLoader,kitPlacements(basic,overrides,{project,facesStreet:nearRoad,skipWall})).then(g=>scene.add(g)).catch(e=>console.error(e));
 }else{
 const batch=buildDistrictBatch(basic);farMat=litWindows(new T.MeshStandardMaterial({vertexColors:true,roughness:.85,side:T.DoubleSide,flatShading:true}),{byColor:true});const far=mesh(toLocal(batch.position,ground),{color:batch.color,index:batch.faces,material:farMat});far.castShadow=false;scene.add(far);}
 const detail=buildXinyiDetail(refined,{arcade:false,attStudy:false});detailMats=createDetailMaterials(GisMaterial);litWindows(detailMats.glass);scene.add(mesh(toLocal(detail.position,ground),{color:detail.color,uv:detail.uv,groups:detail.groups,materials:detailMats}));
}
// 應變中心：場地（停車場、廣場、樹與車）貼合地形，補上原模型檢視頁的表面質感與夜間亮窗、停機坪邊燈。
let sidewalks=null,sidewalkReview=false,sidewalkReady=false;
let shortGrass=null,shortGrassReady=false,grassReview=false,grassReviewUiReady=false;let eocDetail=null,eocRoot=null,youBike=null,treeForest=null,forestVisible=true,forestQuality='medium';
installGrassShaderFallback(renderer,()=>shortGrass,()=>{$('shortGrassStatus').textContent='動態材質不相容，已切換可見的靜態短草；可按「近看短草」查看。';});
function reviewShortGrass(){if(!shortGrass){showNotice('短草尚未載入，請稍候或查看設定中的載入狀態。',6000);return;}if(!grassReview&&state.mode==='interior'){showNotice('請先離開建物，再近看短草。',6000);return;}if(!grassReview&&state.mode==='drive'&&Math.abs(truck.v)>1.5){showNotice('請先停車，再近看短草。',6000);return;}if(sidewalkReview)reviewSidewalks();grassReview=!grassReview;state.keys.clear();$('shortGrass').checked=true;shortGrass.setVisible(true);$('grassReviewButton').textContent=grassReview?'返回人物視角':'近看短草';$('grassReviewButton').setAttribute('aria-pressed',String(grassReview));setPaused(false);showNotice(grassReview?'正在近看 EOC 北側短草（6–12公分）；人物位置保持原地。按「返回人物視角」結束。':'已返回人物視角。',8000);}
function reviewSidewalks(){if(!sidewalks)return;if(!sidewalkReview&&(state.mode==='interior'||state.mode==='drive'&&Math.abs(truck.v)>1.5)){showNotice('請先離開建物或停車，再近看鋪面。',6000);return;}if(grassReview)reviewShortGrass();sidewalkReview=!sidewalkReview;if(sidewalkReview){$('sidewalkAppearance').checked=true;sidewalks.setVisible(true);}state.keys.clear();$('sidewalkReviewButton').textContent=sidewalkReview?'返回人物視角':'近看人行道';$('sidewalkReviewButton').setAttribute('aria-pressed',String(sidewalkReview));setPaused(false);showNotice(sidewalkReview?'EOC 人行道鋪磚試作；磚型、尺寸與高差待核對。人物留在原地。':'已返回人物視角。',8000);}
function setupSidewalks(){if(sidewalks||!eocRoot||!sidewalkReady)return;try{sidewalks=createEocSidewalks({scene,root:eocRoot,features:[...navigationFeatures,...streets.features],laneData});if(sidewalks){sidewalks.setVisible($('sidewalkAppearance').checked);$('sidewalkReviewButton').disabled=false;if(grassReviewUiReady&&new URLSearchParams(location.search).get('review')==='sidewalk')reviewSidewalks();}}catch(e){console.warn('Sidewalk appearance unavailable; existing paving retained',e);}}
function setupShortGrass(){if(shortGrass||!eocRoot)return;try{shortGrass=createShortGrass({scene,root:eocRoot,laneData,features:[...navigationFeatures,...streets.features],quality:forestQuality,sun});shortGrass?.setVisible($('shortGrass').checked);$('shortGrassStatus').textContent=shortGrass?'已生成 '+shortGrass.stats.blades+' 葉短草（6–12公分），位於 EOC 北側；按頂端「近看短草」查看。草坪邊界為模型範圍，現況待核對。':'未找到既有草坪，未新增草地。';if(shortGrass){$('grassReviewButton').disabled=false;if(grassReviewUiReady&&new URLSearchParams(location.search).get('review')==='grass'&&!grassReview)reviewShortGrass();}}catch(err){console.warn('Short grass unavailable',err);$('shortGrassStatus').textContent='短草未載入；保留原草坪。';}}
addLandmarksToThree({T,scene,GLTFLoader,ground,project}).then(list=>{const e=list.find(l=>l.anchor.key==='eoc');if(!e)return;
 applyEocFrontage(e.root);drapeSite(e.root,ground);walkSurface.addDraped(e.root);eocRoot=e.root;if(shortGrassReady)setupShortGrass();treeForest?.replaceEoc(e.root);youBike?.replaceLegacyEoc(e.root);eocDetail=enhanceEoc(e.root);setupSidewalks();try{eocDetail.setNight(TIME_PRESETS[state.time].lights);}catch{}}).catch(e=>console.error(e));
// 街道：預設為逐車道路面（osm2streets：車道、人行道、路口、中線、車道線、箭頭、停止線）；
// ?roads=legacy 改回原本依 OSM 寬度展開的示意路面＋精修鋪面。兩者都保留 OSM zebra 斑馬線。
const legacyRoads=new URLSearchParams(location.search).get('roads')==='legacy';
const laneData=legacyRoads?null:await fetch('assets/lanes-xinyi.json?v=s30').then(r=>r.ok?r.json():null).catch(()=>null);
let laneMesh=null;
if(laneData){laneMesh=addLanesToScene({T,scene,data:laneData,ground});walkSurface.addMeshes(laneMesh.children.filter(m=>!m.userData.inferredPaint));}
else for(const g of buildStreetBase(streets.features,ground,inFocus)){const m=mesh(new Float32Array(g.position),{index:g.index,material:new T.MeshStandardMaterial({color:g.color,roughness:.95,polygonOffset:true,polygonOffsetFactor:g.raised?-2:-1,polygonOffsetUnits:g.raised?-2:-1})});m.castShadow=false;scene.add(m);walkSurface.addMeshes([m]);}
{if(!laneData){const d=buildStreetDetail(streets.features),mats=createStreetMaterials(GisMaterial);for(const m of Object.values(mats)){m.polygonOffset=true;m.polygonOffsetFactor=m.polygonOffsetUnits=-3;}
 const m=mesh(toLocal(d.position,ground,true),{uv:d.uv,groups:d.groups,materials:mats});m.castShadow=false;scene.add(m);walkSurface.addMeshes([m]);}

}
const zebraCrossings=addZebraCrossings({T,scene,features:navigationFeatures,ground});
const yellowBoxData=await fetch('assets/xinyi-yellow-boxes.json?v=yellowbox-20261023').then(r=>r.ok?r.json():null).catch(()=>null);
const yellowBoxes=yellowBoxData?addYellowBoxes({T,scene,data:yellowBoxData,ground}):null;
const youBikeData=await fetch('assets/xinyi-youbike.json?v=youbike-20261023').then(r=>r.ok?r.json():null).catch(()=>null);
if(youBikeData){youBike=addYouBikeStations({scene,data:youBikeData,features:navigationFeatures,ground:walkSurface,laneData,roadFeatures:[...navigationFeatures,...streets.features],eocAnchor:landmarks.find(a=>a.key==='eoc')});if(eocRoot)youBike.replaceLegacyEoc(eocRoot);}

// 外圍沿完整行政界線裁切的 OSM 道路；不由道路等級猜測紅黃線。
if(roadNetwork)for(const g of buildStreetBase(roadNetwork.outerFeatures.map(f=>f.kind==='sidewalk'?{...f,kind:'walk'}:f),ground,()=>false)){
 const m=mesh(new Float32Array(g.position),{index:g.index,material:new T.MeshStandardMaterial({color:g.color,roughness:.95,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2})});m.castShadow=false;m.name='Xinyi outer OSM road';scene.add(m);walkSurface.addMeshes([m]);
}
if(roadNetwork){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(outerGroundGeometry({bbox:roadNetwork.bbox,coreBbox:district.bbox,project,ground}),3));g.computeVertexNormals();const m=new T.Mesh(g,new T.MeshStandardMaterial({color:'#8f8b80',roughness:1,side:T.DoubleSide}));m.receiveShadow=true;m.name='outer estimated ground (not DEM)';scene.add(m);}
const officialPaint=curbData?addRoadPaint({T,scene,data:curbData,ground}):null;
// 全區只有明確 divider 標記才新增中線；缺資料不猜黃虛線位置。
const mappedDividers=roadNetwork?explicitDivider(roadNetwork.outerFeatures,project):[];
const mappedPaint=mappedDividers.length?addLanesToScene({T,scene,ground,data:{lanes:{},intersections:[],corners:[],markings:{center:mappedDividers.flatMap(x=>x.rings)}}}):null;
const paintStatus=$('roadDataStatus');
if(paintStatus)paintStatus.textContent=roadNetwork&&curbData?'全區路網 '+roadNetwork.stats.features+' 段｜官方紅線 '+curbData.stats.red+' 段、黃線 '+curbData.stats.yellow+' 段（2024/07/12 圖資）。寬度、高程及現況待核對；核心車道線為推估，黃虛線缺定位資料。':'全區圖資載入不完整，目前顯示既有核心範圍；請重新整理再核對。';
{// 地面：示意高程格網（GIS 頁使用 world-elevation 地形，此處無法離線取得，改由官方牆腳高程內插）。
 const {x0,z0,cell,nx,nz,h}=ground,position=new Float32Array(nx*nz*3),index=[];
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)position.set([x0+i*cell,h[j*nx+i]-0.02,z0+j*cell],(j*nx+i)*3);
 for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){const k=j*nx+i;index.push(k,k+nx,k+1,k+1,k+nx,k+nx+1);}
 const m=mesh(position,{index,material:new T.MeshStandardMaterial({color:'#8f8b80',roughness:1})});m.castShadow=false;scene.add(m);
 const outer=new T.Mesh(new T.PlaneGeometry(6000,6000),new T.MeshStandardMaterial({color:'#6f7466',roughness:1}));outer.rotation.x=-Math.PI/2;outer.position.y=Math.min(...h)-0.6;scene.add(outer);
}
// 街道設施：與 GIS 頁相同尺寸與配色——市府路燈（桿徑 0.16 m、資料桿高、燈具 0.5×0.3×0.2 m）、
// OSM 路樹（樹幹 0.28×2.4 m、樹冠 3.2×3.8 m 自 2.2 m 起）、市府號誌設施桿位（0.12×3 m，桿形待核對）。
const lampGlow=[],lampHeads=[];
// 全區街道設施（xinyi-furniture.js）：市府路燈、OSM 路樹、號誌、消防栓、公車亭、草地；載入失敗時用下方原本的中心 250 m 設施。
const furniture=await fetch('assets/street-furniture-xinyi.json?v=2').then(r=>r.ok?r.json():null).catch(()=>null);
if(furniture){const f=addFurnitureToScene({T,scene,data:reviewEocGreen(furniture,landmarks.find(a=>a.key==='eoc')),ground});lampHeads.push(f.headMat);lampGlow.push(...f.glow);}
else{
 const dummy=new T.Object3D(),place=(inst,i,x,y,z,sx,sy,sz)=>{dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);};
 const cyl=new T.CylinderGeometry(.5,.5,1,10).translate(0,.5,0),box=new T.BoxGeometry(1,1,1).translate(0,.5,0),ball=new T.SphereGeometry(.5,14,10).translate(0,.5,0);
 const lamps=fixtures.lamps,pole=new T.InstancedMesh(cyl,new T.MeshStandardMaterial({color:'#6e7477',roughness:.6}),lamps.length),headMat=new T.MeshStandardMaterial({color:'#d9dedc',emissive:'#ffd9a0',emissiveIntensity:0}),head=new T.InstancedMesh(box,headMat,lamps.length);
 lamps.forEach((l,i)=>{const [x,z]=project(l.lon,l.lat),y=ground.at(x,z);place(pole,i,x,y,z,.16,l.height,.16);place(head,i,x,y+l.height,z,.5,.2,.3);lampGlow.push(x,y+l.height-.1,z);});
 lampHeads.push(headMat);
 const trees=fixtures.trees,trunk=new T.InstancedMesh(cyl,new T.MeshStandardMaterial({color:'#665544'}),trees.length),crown=new T.InstancedMesh(ball,new T.MeshStandardMaterial({color:'#4a6950',roughness:.9}),trees.length);
 trees.forEach((t,i)=>{const [x,z]=project(t.lon,t.lat),y=ground.at(x,z);place(trunk,i,x,y,z,.28,2.4,.28);place(crown,i,x,y+2.2,z,3.2,3.8,3.2);});
 const poles=verified.poles,sig=new T.InstancedMesh(cyl,new T.MeshStandardMaterial({color:'#9ba5a7',roughness:.5}),poles.length);
 poles.forEach((p,i)=>{const [x,z]=project(p.lon,p.lat);place(sig,i,x,ground.at(x,z),z,.12,3,.12);});
 for(const m of [pole,head,trunk,crown,sig]){m.castShadow=true;scene.add(m);}
}
const glow=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(lampGlow,3)),new T.PointsMaterial({color:'#ffd9a0',size:3.2,transparent:true,opacity:.75,depthWrite:false,map:canvasTexture(64,(g,s)=>{const r=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);r.addColorStop(0,'#fff');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,s,s);})}));
glow.visible=false;scene.add(glow);

// 主控角色：既有中隊長造型（黃色消防衣）。
step('載入角色與消防車');
const spawn=spawnPoint(streets.features,landmarks),player=new T.Group(),actionKit=createActionScene(new T.Scene(),{examples:false}),person=actionKit.createPerson(player,'中隊長');
person.body.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(player);
const zhuangjing=zhuangjingData?addZhuangjingStation({scene,data:zhuangjingData,buildings:district.buildings,ground,colliders,createPerson:actionKit.createPerson}):null;
// 消防車：既有 GIS 車型，紅色警示燈保持紅色。
const truck={root:new T.Group(),model:null,x:0,z:0,heading:0,v:0,steer:0,beacons:[],siren:false};
{const gltf=await new GLTFLoader().loadAsync('assets/geo-fire-engine.glb');truck.template=gltf.scene.clone(true);truck.model=gltf.scene;truck.model.rotation.y=-Math.PI/2;truck.root.add(truck.model);
  truck.model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;const m=o.material;if(/beacon|warning|LED strip|red.*lens|emergency.*lens|red.*flasher/i.test(m?.name||'')){o.material=m.clone();truck.beacons.push(o.material);}}});
 // 方案 A：載入時把車輪零件重組到輪軸中心（不修改車型檔），靜止外觀與原車型相同。
 truck.rig=rigWheels(truck.model);
 scene.add(truck.root);
 const head=new T.SpotLight('#fff4dc',0,60,.45,.5,1.2);head.position.set(0,1.3,-3.6);head.target.position.set(0,0,-20);truck.root.add(head,head.target);truck.headlight=head;
}
// 街道生活層（示意）：排除已有照片／樣板研究的量體（微風南山、ATT 相鄰外牆、第一批信義建物候選）。
step('建立車流、行人與店面');
const exclude=new Set([357399,265936,266115,266138,...zhuangjingIds]);(function collect(o){if(Array.isArray(o))o.forEach(collect);else if(o&&typeof o==='object')for(const [k,v] of Object.entries(o)){if(k==='officialVolumeCandidates'&&Array.isArray(v))v.forEach(id=>exclude.add(+id));else collect(v);}})(firstBatch);
const life=createStreetLife(scene,{features:streets.features,buildings:district.buildings,ground,colliders,fixtures,exclude,spawn,markings:!laneData,busFeatures:navigationFeatures});
// Only hide old crowns after both geometry and textures loaded successfully.
shortGrassReady=true;if(eocRoot)setupShortGrass();sidewalkReady=true;setupSidewalks();
const treeChoice=$('treeAppearance'),requestedTree=new URLSearchParams(location.search).get('trees');if([...treeChoice.options].some(o=>o.value===requestedTree))treeChoice.value=requestedTree;
function describeTreeStyle(){const label=treeChoice.selectedOptions[0]?.textContent;$('treeAssetStatus').textContent=treeChoice.value==='auto'?'已載入十二種一般樹形（含六種新增茂密樹形）、四種樹種外觀與三種灌木。樹位沿用既有資料；樹種與現場尺寸待核對。':'目前為 '+label+'；沿用原樹位並限制原有樹冠範圍，屬外觀與季節示意，不代表現場樹種。';}
treeChoice.onchange=()=>{if(treeForest?.setAppearance(treeChoice.value))describeTreeStyle();};
loadTreeAssets().then(assets=>{treeForest=createRealisticTrees({scene,assets,ground:walkSurface,street:treeInstances(furniture?.trees??[]),supplemental:life.groups.trees.children.find(m=>m.isInstancedMesh)});if(eocRoot)treeForest.replaceEoc(eocRoot);fetch('assets/street-hedges-xinyi.json?v=3').then(r=>r.ok?r.json():null).then(h=>treeForest.addHedges(h)).catch(()=>{});scene.traverse(o=>{if(o.name==='street trees')o.visible=false;});life.groups.trees.visible=false;treeForest.setVisible(forestVisible);treeForest.setQuality(forestQuality);treeForest.setAppearance(treeChoice.value);treeChoice.disabled=false;describeTreeStyle();}).catch(e=>{console.warn('Tree assets unavailable; original trees retained',e);$('treeAssetStatus').textContent='新樹木素材未載入，暫時保留原樹木；請重新整理。';});
$('busStatus').textContent=life.busStats.count?'已接入最多 '+life.busStats.count+' 輛示意公車，沿較寬幹道路段行駛；非實際營運路線或時刻。':'目前資料沒有適合的寬幹道路段，暫不生成公車。';
const sky=createSky();scene.add(sky);
const audio=createAudio();
// 導航：步行用全部路徑、駕駛只用車道並遵守單行道。重點建物取第一批信義建物清單（OSM 名稱；量體對應仍為候選）。
const routeGraphs={walk:buildRouteGraph(navigationFeatures),drive:buildRouteGraph(navigationFeatures,{vehicle:true})};
const pois=(firstBatch.sites??[]).filter(s=>s.name&&s.polygon?.length).map(s=>{const pts=s.polygon.map(p=>project(p[0],p[1]));return {name:s.name,x:pts.reduce((a,p)=>a+p[0],0)/pts.length,z:pts.reduce((a,p)=>a+p[1],0)/pts.length};});
if(zhuangjing)pois.push({name:'莊敬分隊・大隊待命',x:zhuangjing.layout.x,z:zhuangjing.layout.z});
const state={mode:'walk',yaw:spawn.heading,pitch:.32,dist:7,x:spawn.x,z:spawn.z,facing:spawn.heading,time:'afternoon',paused:false,keys:new Set(),stick:[0,0],run:false,walkT:0,pad:readPad(null),padPrev:[]};
const stationTeam=createStationCrew({scene,createPerson:actionKit.createPerson,ground:walkSurface,colliders,spawn});
function placeTruck(){truck.x=spawn.truck.x;truck.z=spawn.truck.z;truck.heading=spawn.truck.heading;truck.v=0;truck.steer=0;}
// 前往精細地標（消防局、災害應變中心）：站在入口前，面向建物。
function goToLandmark(key){if(key==='zhuangjing'&&zhuangjing){if(state.mode==='interior')exitBuilding();if(state.mode==='drive'){if(Math.abs(truck.v)>1.5){flashHint('請先停車下車，再前往莊敬分隊');return;}toggleVehicle();}const p=zhuangjing.visitPoint();state.mode='walk';state.x=p.x;state.z=p.z;state.facing=state.yaw=p.heading;state.pitch=.32;state.dist=7;state.keys.clear();player.visible=true;zhuangjing.update(state);syncUi();showNotice(zhuangjing.status+'；建物外牆與車庫面待現況精修。',9000);return;}const a=landmarks.find(l=>l.key===key);if(!a)return;if(state.mode==='interior')exitBuilding();if(state.mode==='drive')toggleVehicle();const [lon,lat]=localToLonLat(a,a.entry.x,a.entry.y),[x,z]=project(lon,lat),p=colliders.resolve(x,z,.4);state.mode='walk';state.x=p.x;state.z=p.z;state.facing=state.yaw=(a.heading+(a.entry.facing||0))*Math.PI/180;player.visible=true;syncUi();}
function resetAll(){if(aerial&&!['idle','parked'].includes(aerial.state.phase)){flashHint('請先收梯並撤離，再回信義分隊');return;}if(state.mode==='interior')exitBuilding();state.mode='walk';state.run=false;state.dist=7;state.pitch=.32;state.keys.clear();state.stick=[0,0];state.x=spawn.x;state.z=spawn.z;state.facing=spawn.heading;state.yaw=spawn.heading;placeTruck();aerial?.park(spawn.aerial);stationTeam.reset();playerGait.reset();standBesideTruck();player.visible=true;syncUi();}
// GIS 部署頁的配置（同一瀏覽器）：車組、人員、搶救建物與第一正面入口。第一車組＝可駕駛的水箱車。
const geoModels=await fetch('assets/geo-models.json').then(r=>r.ok?r.json():null).catch(()=>null);
const gis=geoModels?createGisLayer(scene,{ground,createPerson:actionKit.createPerson,models:geoModels,preloaded:{engine:truck.template}}):null;
let gisDep=gis?.load()??null;
function gisEngine(){const it=gisDep?.items?.engine1;if(!it?.point)return null;return gis.data?.vehicles.find(v=>v.unitId==='engine1')??null;}
function standBesideTruck(){if(Math.hypot(truck.x-spawn.truck.x,truck.z-spawn.truck.z)<2){state.x=spawn.x;state.z=spawn.z;state.facing=state.yaw=spawn.heading+Math.PI;return;}const r=[Math.cos(truck.heading),-Math.sin(truck.heading)],p=colliders.resolve(truck.x-r[0]*3,truck.z-r[1]*3,.4);state.x=p.x;state.z=p.z;state.facing=state.yaw=truck.heading;}
let aerialActive=()=>false;// 街景雲梯車已配置時隱藏 GIS 配置的同一部雲梯車
async function applyGis(){if(!gis)return;await gis.apply(gisDep,{skip:['engine1','commander']});if(aerialActive())gis.hide('aerial');}
function gisSummary(){const d=gis?.data;if(!d||(!d.vehicles.length&&!d.target))return '';const n=d.vehicles.filter(v=>v.unitId!=='commander').length;return `已載入 GIS 部署：車組 ${n}、人員 ${d.crew.length}`+(d.target?'、搶救建物':'')+(d.entrance?'、第一正面入口':'');}
await applyGis();
placeTruck();standBesideTruck();
// 頂端通知列（與「按 E 上車」提示分開，避免被覆蓋）。
let noticeTimer=0;function showNotice(text,ms=5000){$('notice').textContent=text;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{$('notice').hidden=true;},ms);}
showNotice('信義分隊：水箱車庫內待命；E 上車後 NPC 自動集合，4 人到齊可駛出；T 派遣。'+(gisSummary()?' '+gisSummary()+'；可駕駛水箱車由信義分隊出勤。':''),7000);
// 另一個分頁（GIS 頁）更新部署時即時同步（不移動正在駕駛的水箱車）。
addEventListener('storage',async e=>{if(e.key!==storeKey('xinyi'))return;gisDep=gis?.load()??null;await applyGis();showNotice('已同步 GIS 部署頁的更新'+(gisSummary()?'：'+gisSummary().replace('已載入 GIS 部署：',''):''));});

// 輸入
addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;const k=e.key.toLowerCase();audio.unlock();if(!$('squadPanel').hidden&&(k==='escape'||k==='b')){closeSquads();return;}if(!$('equip').hidden){if(k==='escape'||k==='u')closeEquip();return;}if(!$('triage').hidden){if(k==='escape'||k==='k')closeTriage();return;}if(!$('transport').hidden){if(k==='escape'||k==='j')closeTransport();return;}if(k==='k'&&!state.paused){openTriage();return;}if(k==='j'&&!state.paused){openTransport();return;}if(bigmap.open){if(k==='m'||k==='escape')closeMap();return;}if(k==='m'&&!state.paused){openMap();return;}if(k==='escape'||k==='p'){setPaused(!state.paused);e.preventDefault();return;}if(k==='h'){setPaused(true,'controls');return;}if(state.paused)return;state.keys.add(k);if(state.mode==='interior'){if(!e.repeat)interiorKey(k);if(k===' ')e.preventDefault();return;}if(k==='u'){openEquip();return;}if(k==='b'){$('squadPanel').hidden?openSquads():closeSquads();return;}if(k==='e'){if(nearEntry())enterBuilding();else toggleVehicle();}if(k==='t')startMission();if(k==='f')toggleHose();if(k==='l')aerialAction();if(k==='g')supplyAction();if(k==='v')toggleNozzle();if(k==='q')toggleSiren();if(k==='n')cycleTime();if(k==='r')resetAll();if([' ','arrowup','arrowdown'].includes(k))e.preventDefault();});
addEventListener('keyup',e=>state.keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>state.keys.clear());
let drag=null;
// 觸控：單指拖曳轉視角（搖桿是獨立元件，不會被當成拖曳）；雙指捏合縮放（室內不縮放）。
const touches=new Map();let pinch=null;
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){touches.set(e.pointerId,[e.clientX,e.clientY]);if(touches.size===2){const [a,b]=[...touches.values()];pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1]),dist:state.dist};drag=null;return;}}drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!touches.has(e.pointerId))return;touches.set(e.pointerId,[e.clientX,e.clientY]);if(pinch&&touches.size===2&&state.mode!=='interior'){const [a,b]=[...touches.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);state.dist=Math.min(40,Math.max(3,pinch.dist*pinch.d/Math.max(20,d)));}});
for(const ev of ['pointerup','pointercancel'])canvas.addEventListener(ev,e=>{touches.delete(e.pointerId);if(touches.size<2)pinch=null;});
canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const k=settings.sens;state.yaw-=(e.clientX-drag.x)*.006*k;state.pitch=Math.min(1.25,Math.max(state.mode==='interior'?-.75:.05,state.pitch+(e.clientY-drag.y)*.004*k*(settings.invertY?-1:1)));drag.x=e.clientX;drag.y=e.clientY;state.camHold=1.5;});
canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{if(state.mode==='interior'){e.preventDefault();return;}state.dist=Math.min(40,Math.max(3,state.dist*(1+Math.sign(e.deltaY)*.1)));e.preventDefault();},{passive:false});
{const stick=$('stick'),knob=stick.querySelector('i');let id=null;
 const move=e=>{const r=stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,l=Math.min(1,Math.hypot(dx,dy)/(r.width/2))/(Math.hypot(dx,dy)||1);state.stick=[dx*l,-dy*l];knob.style.transform=`translate(${dx*l*r.width/2}px,${dy*l*r.width/2}px)`;};
 stick.addEventListener('pointerdown',e=>{id=e.pointerId;stick.setPointerCapture(id);move(e);});stick.addEventListener('pointermove',e=>{if(e.pointerId===id)move(e);});
 const end=()=>{id=null;state.stick=[0,0];knob.style.transform='';};stick.addEventListener('pointerup',end);stick.addEventListener('pointercancel',end);
 $('tEnter').addEventListener('click',()=>{if(state.mode==='interior')indoor.interact();else if(nearEntry())enterBuilding();else toggleVehicle();});
}
// Both mouse/keyboard-accessible and touch buttons toggle the same commander sprint state.
function syncRunButtons(){for(const id of ['runButton','tRun']){const b=$(id);b.hidden=state.mode!=='walk';b.classList.toggle('on',state.run);b.setAttribute('aria-pressed',String(state.run));b.textContent=state.run?'跑步：開':'跑步：關';}}
function toggleRun(){if(state.mode!=='walk'||state.paused||bigmap.open)return;state.run=!state.run;syncRunButtons();}
for(const id of ['runButton','tRun']){const b=$(id);b.onclick=toggleRun;b.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter')e.stopPropagation();});}
$('enter').onclick=()=>toggleVehicle();$('siren').onclick=()=>toggleSiren();$('night').onclick=()=>cycleTime();$('reset').onclick=()=>resetAll();

function nearTruck(){return Math.hypot(state.x-truck.x,state.z-truck.z)<6;}
function toggleVehicle(){
 if(state.mode==='interior')return;
 if(state.mode==='walk'){if(!nearTruck())return;if(mission?.hose){flashHint('請先按 F 收回水線再上車');return;}state.mode='drive';player.visible=false;state.dist=Math.max(state.dist,portrait()?17:13);}
 else{if(Math.abs(truck.v)>1.5)return;state.mode='walk';const r=[Math.cos(truck.heading),-Math.sin(truck.heading)];const p=colliders.resolve(truck.x-r[0]*2.6,truck.z-r[1]*2.6,.4);state.x=p.x;state.z=p.z;state.facing=truck.heading;if(Math.hypot(truck.x-spawn.truck.x,truck.z-spawn.truck.z)<2)standBesideTruck();player.visible=true;state.dist=Math.hypot(truck.x-spawn.truck.x,truck.z-spawn.truck.z)<15?7:(portrait()?9:7);}
 syncUi();
}
function toggleSiren(){if(state.mode!=='drive')return;truck.siren=!truck.siren;syncUi();}
function cycleTime(){const order=Object.keys(TIME_PRESETS);applyTime(order[(order.indexOf(state.time)+1)%order.length]);quality.apply();syncTime();}
function applyTime(name){
 state.time=name;const p=TIME_PRESETS[name],az=p.az*Math.PI/180,el=p.el*Math.PI/180;
 sunDir.set(Math.sin(az)*Math.cos(el),Math.sin(el),-Math.cos(az)*Math.cos(el));
 sky.material.uniforms.top.value.set(p.top);sky.material.uniforms.horizon.value.set(p.horizon);scene.fog.color.set(p.horizon);scene.fog.near=p.fogNear;scene.fog.far=p.fogFar;
 hemi.intensity=p.hemiI;hemi.color.set(p.hemiSky);hemi.groundColor.set(p.hemiGround);sun.intensity=p.sunI;sun.color.set(p.sun);
 for(const m of lampHeads)m.emissiveIntensity=p.lights*2;glow.visible=p.lights>0;truck.headlight.intensity=p.lights*60;
 detailMats.glass.emissiveIntensity=p.windows*.9;farMat.emissiveIntensity=p.windows*1.2;if(facadeSigns)facadeSigns.emissiveIntensity=p.lights*.55;shophouse?.setNight(p.lights);eocDetail?.setNight(p.lights);life.setLights(p.lights);zhuangjing?.setNight(p.lights);syncUi();
}
function syncUi(){
 if(state.mode!=='walk')state.run=false;syncRunButtons();
 $('enter').textContent=state.mode==='drive'?'下車':'上車';$('siren').hidden=state.mode!=='drive';$('siren').classList.toggle('on',truck.siren);$('night').textContent='時段：'+TIME_PRESETS[state.time].label;
 $('speed').hidden=state.mode!=='drive';
 const d=state.mode==='drive',inside=state.mode==='interior';$('tRun').hidden=d||inside;$('tBrake').hidden=$('tSiren').hidden=!d;$('tSiren').classList.toggle('on',truck.siren);$('tEnter').textContent=d?'下車':inside?'門窗／撤出':'上車';
}

// 小地圖：預先繪製路網與牆線，執行時依視角旋轉。
// 全區底圖涵蓋原點 ±3500 m；缺圖資時沿用原核心底圖。
const mini=$('minimap'),mctx=mini.getContext('2d'),MAP=3072,mapScale=MAP/(roadNetwork?7000:2000),mapImg=document.createElement('canvas');
let minimapZoom=1,minimapDisplaySize=214,minimapControlKey='';
{mapImg.width=mapImg.height=MAP;const g=mapImg.getContext('2d');g.fillStyle='#26323a';g.fillRect(0,0,MAP,MAP);const P=(x,z)=>[MAP/2+x*mapScale,MAP/2+z*mapScale];
 g.lineCap='round';g.lineJoin='round';
 for(const f of navigationFeatures){g.strokeStyle=f.kind==='road'?'#8e9aa2':f.kind==='crossing'?'#d9dcdc':'#55636b';g.lineWidth=Math.max(f.kind==='road'?(f.width||6):1.5,1)*mapScale;
  for(const path of f.paths){g.beginPath();path.forEach((p,i)=>{const [x,y]=P(...project(p[0],p[1]));i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();}}
 g.strokeStyle='#c9a77b';g.lineWidth=2;g.beginPath();for(const [ax,az,bx,bz] of colliders.segs){g.moveTo(...P(ax,az));g.lineTo(...P(bx,bz));}g.stroke();
}
const bigmap=createBigMap({overlay:$('bigmap'),canvas:$('mapCanvas'),mapImg,MAP,mapScale,labels:roadLabels(navigationFeatures),pois,
 getView:()=>({x:state.x,z:state.z,facing:state.mode==='drive'?truck.heading:state.facing,driving:state.mode==='drive',truck,waypoint:state.waypoint,route:state.route,fire:mission?.site&&mission.phase<6?mission.site:null,markers:mapMarkers()}),
 onPick:(x,z)=>setWaypoint(x,z,'地圖標記')});
function openMap(){state.keys.clear();state.stick=[0,0];audio.suspend();$('mapStreet').textContent=$('street').textContent;bigmap.show();}
function closeMap(){bigmap.hide();if(!state.paused)audio.resume();}
function setWaypoint(x,z,label){state.waypoint={x,z,label};state.routeTimer=0;updateNavigation(0);}
function clearWaypoint(){state.waypoint=null;state.route=null;$('waypoint').hidden=true;}
function updateNavigation(dt){
 if(!state.waypoint)return;const remain=Math.hypot(state.waypoint.x-state.x,state.waypoint.z-state.z);
 if(remain<12){clearWaypoint();$('prompt').hidden=false;$('prompt').textContent='已抵達目標';setTimeout(()=>{if($('prompt').textContent==='已抵達目標')$('prompt').hidden=true;},2500);return;}
 state.routeTimer=(state.routeTimer??0)-dt;
 if(state.routeTimer<=0){state.routeTimer=1;const r=findRoute(routeGraphs[state.mode==='drive'?'drive':'walk'],state.x,state.z,state.waypoint.x,state.waypoint.z);state.route=r?.points??null;state.routeLength=r?.length??remain;}
 const d=state.routeLength??remain;$('waypoint').hidden=false;$('wpText').textContent=`${state.waypoint.label} · ${d>=1000?(d/1000).toFixed(1)+' km':Math.round(d)+' m'}`+(state.route?'':'（無可行路線，直線距離）');
}
// ---------- 消防任務模式（訓練示意） ----------
const fireFx=createFireFX(scene);let mission=null;
const STEPS=['上消防車並開警示燈前往','抵達火場','停車下車（建議起火面外側 8–30 m）','在消防車旁按 F 佈設水線','按住 Space 對準火點出水','火勢控制'];
const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
function flashHint(text){text=tt(text);$('missionHint').textContent=text;$('indoorHint').textContent=text;}
// 受困者（示意）：起火樓層、同一立面，起火窗口旁約 3 m 的窗口（牆面太短時在同一窗口）。只能由雲梯籃架救出。
// ---------- 檢傷與急救處置（訓練示意） ----------
// 救出交接後，中隊長走到傷患旁按 K：依示意生命徵象選檢傷分類與處置，之後顯示 START 參考與常見做法參考（不評分）。
// 可檢傷對象：已救出交接的窗口受困者，以及大量傷患模式的現場傷患（未後送者）。取 5 m 內最近者。
let triageTarget=null;
function patientPos(p){return p.handover??p.figure.root.position;}
function triageCandidates(){const list=[...(mission?.mci?.patients??[]).filter(p=>p.state!=='transported')];if(!mission?.mci)list.push(...(mission?.indoor?.rescued??[]));const v=mission?.victim;if(v?.state==='rescued'&&!list.includes(v))list.push(v);return list;}
function openTriage(target){
 let v=target;
 // 傷患相鄰時：5 m 內優先開啟最近的「未檢傷」者，全部已檢傷才開最近者的紀錄。
 if(!v){const all=triageCandidates().map(p=>({p,d:Math.hypot(state.x-patientPos(p).x,state.z-patientPos(p).z)})).sort((a,b)=>a.d-b.d),c=all.find(x=>x.d<=5&&(!x.p.triage||x.p.retriage))??all[0];
  if(!c){const w=mission?.victim;flashHint(w&&w.state!=='rescued'?'傷患救出交接後才能檢傷':'目前沒有可檢傷的傷患');return;}
  if(c.d>5&&!c.p.triage){flashHint('走到傷患旁（5 m 內）再按 K 檢傷'+(mission?.mci?'；傷患集中在起火建物前方街側':''));return;}v=c.p;}
 triageTarget=v;$('triage').querySelector('h2').textContent='檢傷與急救處置'+(v.id?`・${v.id}`:'');
 const vt=v.vitals,yes=b=>b?'是':'否';
 $('triageWho').textContent=`${v.sex==='male'?'男性':'女性'}・估計 ${v.weight} kg・${CONDITION_LABEL[v.condition]}・${vt.mechanisms.map(m=>MECHANISMS[m]).join('、')}`;
 $('triageFindings').innerHTML=[['可自行行走',yes(vt.walks)],['自發呼吸',vt.breathing?'有':'無'+(vt.breathesAfterAirway?'（暢通呼吸道後恢復）':'（暢通呼吸道後仍無）')],['呼吸次數',vt.breathing||vt.breathesAfterAirway?vt.rr+' 次／分':'—'],['橈動脈脈搏',vt.radialPulse?'摸得到':'摸不到'],['微血管充填',vt.capRefill+' 秒'],['遵從簡單指令',yes(vt.obeys)],['頸圈',v.collar?'已於籃架固定':'未使用']].map(([a,b])=>`<tr><td>${a}</td><td>${b}</td></tr>`).join('');
 $('triageTags').innerHTML=Object.entries(TAGS).map(([k,t])=>`<button data-tag="${k}" style="--tag:${t.color}">${t.label}</button>`).join('');
 $('triageAid').innerHTML=FIRST_AID.map(f=>`<label><input type="checkbox" value="${f.id}"${(v.collar&&f.id==='collar')?' checked':''}> ${f.label}</label>`).join('');
 const locked=()=>!!v.triage&&!v.retriage;let chosen=v.retriage?null:v.triage?.tag??null;const sync=()=>{for(const b of $('triageTags').children)b.classList.toggle('on',b.dataset.tag===chosen);$('triageSubmit').disabled=!chosen||locked();};
 if(v.retriage)$('triageWho').textContent+=`・⚠ 狀況惡化（${v.deteriorated.note}），請重新檢傷`;
 for(const b of $('triageTags').children)b.onclick=()=>{if(locked())return;chosen=b.dataset.tag;sync();};
 if(v.triage)for(const c of $('triageAid').querySelectorAll('input')){c.checked=v.triage.aid.includes(c.value);c.disabled=locked();}
 $('triageSubmit').onclick=()=>{const aid=[...$('triageAid').querySelectorAll('input:checked')].map(c=>c.value);submitTriage(chosen,aid);};
 sync();showTriageResult();$('triage').hidden=false;state.keys.clear();
}
function submitTriage(tag,aid,target=triageTarget){
 const v=target;if(!v||!tag||(v.triage&&!v.retriage))return false;
 if(v.triage){(v.triageHistory??=[]).push(v.triage);v.retriage=false;if(mission?.mci){const i=mission.mci.order.indexOf(v.id);if(i>=0)mission.mci.order.splice(i,1);}}const start=startTriage(v.vitals),reference=aidReference(v.vitals);
 v.triage={tag,aid,start,reference,compare:compareAid(aid,reference),time:mission.elapsed};if(v===mission.victim)mission.times.triage=mission.elapsed;mciTagged(v);
 v.figure.setTag(TAGS[tag].color);v.figure.setMask(aid.includes('oxygen'));if(aid.includes('collar'))v.figure.setCollar(true);
 for(const c of $('triageAid').querySelectorAll('input'))c.disabled=true;$('triageSubmit').disabled=true;showTriageResult();renderVictim();flashHint(`已記錄檢傷（${TAGS[tag].label}）與處置 ${aid.length} 項；檢傷卡已繫上`);return true;
}
function showTriageResult(){
 const t=triageTarget?.triage;$('triageResult').hidden=!t;if(!t)return;const label=k=>FIRST_AID.find(f=>f.id===k).label;
 $('triageResult').innerHTML=`<p><b>你的分類：</b>${TAGS[t.tag].label}　<b>START 參考：</b>${TAGS[t.start.tag].label}${t.tag===t.start.tag?'（相同）':'（不同，請討論）'}</p><p class="note">START 依據：${t.start.steps.join(' → ')}</p>`+
  `<p><b>處置比對（常見做法參考，非醫療判斷、不評分）</b></p><ul>`+(t.compare.matched.length?`<li>相同：${t.compare.matched.map(label).join('、')}</li>`:'')+t.compare.missing.map(m=>`<li>參考但未選：${label(m.id)}——${m.why}</li>`).join('')+(t.compare.extra.length?`<li>另外選擇：${t.compare.extra.map(label).join('、')}（請說明理由）</li>`:'')+`</ul>`;
}
function closeTriage(){$('triage').hidden=true;}
$('triageBtn').onclick=()=>openTriage(mission?.mci?undefined:mission?.victim);$('triageClose').onclick=()=>closeTriage();

// 現場人員與設施障礙：傷患（倒臥者以身長範圍計）；traffic=true 時另含檢傷分區地布與救護車停靠點，讓車輛（含 NPC 車流）停下而不輾過。
function sceneCircles(traffic){
 const out=[],add=p=>{if(!p?.figure?.root.visible||p.state==='transported'||p.state==='loading')return;const pos=p.figure.root.position;if(p.state==='boarding'||p.state==='basket')return;out.push([pos.x,pos.z,p.figure.pose==='lying'?.9:.4]);};
 for(const p of mission?.mci?.patients??[])add(p);if(mission?.victim&&mission.victim.state==='rescued')add(mission.victim);
 out.push(...(zhuangjing?.circles()??[]),...stationTeam.circles(),...squadKit.circles(),...(tankerKit?.circles()??[]),...(surveyKit?.circles()??[]));if(!traffic)out.push(...squadKit.people());
 if(traffic&&mission?.mci){for(const pos of Object.values(mission.mci.tarps))out.push([pos.x,pos.z,2.8]);if(mission.mci.amb.visible)out.push([mission.mci.staging.x,mission.mci.staging.z,3.2]);}
 return out;
}
// 地圖標記：傷患區（人數）、救護車停靠點、雲梯車。
function mapMarkers(){const out=[...(zhuangjing?[zhuangjing.marker()]:[]),...(youBike?.markers(state.x,state.z)??[])];const m=mission?.mci;
 if(m){const left=m.patients.filter(p=>p.state!=='transported'&&p.figure.root.visible);if(left.length){const c=left.reduce((a,p)=>a.add(p.figure.root.position),new T.Vector3()).multiplyScalar(1/left.length);out.push({x:c.x,z:c.z,color:'#f85149',label:`傷患 ${left.length}`});}
  out.push({x:m.staging.x,z:m.staging.z,color:'#f5f5f5',label:'救護車停靠'});}
 if(mission?.entry&&mission.phase<6)out.push({x:mission.entry.x,z:mission.entry.z,color:'#ffd33d',label:'建物入口'});
 if(mission)for(const sq of squadKit.squads)for(const v of sq.vehicles)if(v.root.visible&&v.state!=='player')out.push({x:v.x,z:v.z,color:sq.color,label:`${sq.name.slice(1,2)}${v.k+1}`});
 for(const h of mission?.hydrants??[])out.push({x:h.pos.x,z:h.pos.z,color:'#3b82f6',label:'示意消防栓'});
 if(aerial&&(aerial.state.stationed||aerial.state.phase!=='idle')&&aerial.state.frame)out.push({x:aerial.state.frame.x,z:aerial.state.frame.z,color:'#ffb34e',label:'雲梯車'});
 return out;}
// ---------- 大量傷患（MCI）：現場檢傷與後送順序（訓練示意） ----------
// 派遣類型選「大量傷患」時，起火建物前方街側另有 8–12 名傷患；中隊長逐一按 K 檢傷，於「後送管理」排定順序與醫院，
// 救護車依時間抵達後依順序裝載（擔架 1、坐姿 2、同一醫院）。窗口受困者救出後也加入後送名單。
const TARP=[['red','#f85149'],['yellow','#e3b341'],['green','#3fb950']];
function clearMci(){const m=mission?.mci;if(!m)return;for(const p of m.patients)if(p.figure&&p!==mission.victim)scene.remove(p.figure.root);for(const o of m.objects)scene.remove(o);closeTransport();}
// 空地判定：不在任何量體屋頂三角形（建物投影）內，且離落地牆面有足夠距離。
function openGround(site,radius=70){
 const tris=[];for(const b of district.buildings){const r=b.roofs??[];if(!r.length)continue;const [x0,z0]=project(r[0][0],r[0][1]);if(Math.hypot(x0-site.x,z0-site.z)>radius+80)continue;
  for(let i=0;i+2<r.length;i+=3)tris.push([r[i],r[i+1],r[i+2]].map(v=>project(v[0],v[1])));}
 const inside=(x,z)=>tris.some(([a,b,c])=>{const s1=(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]),s2=(c[0]-b[0])*(z-b[1])-(c[1]-b[1])*(x-b[0]),s3=(a[0]-c[0])*(z-c[1])-(a[1]-c[1])*(x-c[0]);return (s1>=0&&s2>=0&&s3>=0)||(s1<=0&&s2<=0&&s3<=0);});
 return (x,z,r)=>{if(colliders.resolve(x,z,r).hit)return false;for(let k=0;k<=8;k++){const a=k*Math.PI/4,rr=k===8?0:r;if(inside(x+Math.cos(a)*rr,z+Math.sin(a)*rr))return false;}return true;};
}
function setupMci(site){
 const tx=-site.nz,tz=site.nx,side=mission.victim&&((mission.victim.x-site.x)*tx+(mission.victim.z-site.z)*tz)>0?-1:1,free=openGround(site);
 const find=(cands,r)=>{for(const [d,a] of cands){const x=site.x+site.nx*d+tx*side*a,z=site.z+site.nz*d+tz*side*a;if(free(x,z,r))return [x,z];}return null;};
 const grid=[];for(const a of [10,6,14,18,2,-6,-12,22])for(const d of [8,10,6,12,14,16])grid.push([d,a]);
 const [cx,cz]=find(grid,3.5)??[site.x+site.nx*8+tx*side*10,site.z+site.nz*8+tz*side*10],n=8+Math.floor(Math.random()*5),patients=generateCasualties(n),objects=[];
 const place=(x,z)=>{for(let k=0;k<12;k++){const a=k*2.4,rr=k*.5,px=x+Math.cos(a)*rr,pz=z+Math.sin(a)*rr;if(free(px,pz,.5))return new T.Vector3(px,ground.at(px,pz),pz);}return new T.Vector3(x,ground.at(x,z),z);};
 const near=(x0,z0,cands,r)=>{for(const [d,a] of cands){const x=x0+site.nx*d+tx*side*a,z=z0+site.nz*d+tz*side*a;if(free(x,z,r))return new T.Vector3(x,ground.at(x,z),z);}return null;};
 patients.forEach((p,i)=>{const col=i%4,row=Math.floor(i/4),pos=place(cx+tx*(col-1.5)*1.9+site.nx*row*2.2,cz+tz*(col-1.5)*1.9+site.nz*row*2.2);
  p.figure=createPatient(scene,{sex:p.sex,condition:p.condition});p.figure.root.position.copy(pos);p.figure.root.rotation.y=p.condition==='unconscious'?Math.atan2(tx,tz):Math.atan2(site.nx,site.nz)+Math.PI;p.hospital=null;});
 // 檢傷分區（紅、黃、綠示意地布）與救護車停靠點
 // 分區沿街排在傷患區旁（遠離起火面一側），以地布半寬推離牆面。
 const tarps={},used=[];TARP.forEach(([k,c],i)=>{const cands=[];for(const a of [9,14,19,24,-9,-14,-19,4])for(const d of [0,2,-2,4])cands.push([d,a]);
  const pos=near(cx,cz,cands.filter(([d,a])=>!used.some(u=>Math.hypot(u[0]-a,u[1]-d)<4.6)),2.3)??place(cx+tx*side*(9+i*5),cz+tz*side*(9+i*5));const c2=cands.find(([d,a])=>{const x=cx+site.nx*d+tx*side*a,z=cz+site.nz*d+tz*side*a;return Math.hypot(x-pos.x,z-pos.z)<.01;});if(c2)used.push([c2[1],c2[0]]);
  const m=new T.Mesh(new T.PlaneGeometry(4,4),new T.MeshBasicMaterial({color:c,transparent:true,opacity:.45,depthWrite:false,side:T.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.copy(pos).add(new T.Vector3(0,.08,0));scene.add(m);objects.push(m);tarps[k]=pos;});
 const stagingCands=[];for(const a of [0,-8,8,-14,14])for(const d of [6,4,8,10])stagingCands.push([d,a]);
 const staging=near(cx,cz,stagingCands,3)??place(cx+site.nx*6,cz+site.nz*6),amb=new T.Group();amb.position.copy(staging);amb.rotation.y=Math.atan2(tx*side,tz*side)+Math.PI/2;amb.visible=false;scene.add(amb);objects.push(amb);
 if(geoModels){new GLTFLoader().loadAsync(geoModels.ambulance.file).then(g=>{const m=g.scene;m.rotation.y=-Math.PI/2;amb.add(m);}).catch(()=>{});}
 return {patients,order:[],departures:[],objects,tarps,staging,amb,slots:{},next:AMBULANCE.first,count:0,loading:null,start:mission.elapsed,waitingNoted:false};
}
// 檢傷後加入後送順序：插在同色或更優先者之後（使用者可在後送管理調整）；可行走（綠）者走到綠區。
function mciTagged(p){const m=mission?.mci;if(!m||p.triage.tag==='black')return renderMci();
 if(!m.patients.includes(p))m.patients.push(p);if(!m.order.includes(p.id??(p.id='W1'))){let i=m.order.length;while(i>0&&priority(m.patients.find(q=>q.id===m.order[i-1]).triage.tag)>priority(p.triage.tag))i--;m.order.splice(i,0,p.id);}
 if(p.vitals.walks&&m.tarps.green&&p!==mission.victim)p.walkTo=m.tarps.green.clone().add(new T.Vector3((Math.random()-.5)*2.5,0,(Math.random()-.5)*2.5));renderMci();}
// 等候惡化（示意）：不可行走、未後送的傷患依等候時間惡化一次；已檢傷者需重新檢傷。窗口受困者自救出交接起算。
function updateDeterioration(){const m=mission;if(!m)return;const list=[...(m.mci?.patients??[])];if(!m.mci)list.push(...(m.indoor?.rescued??[]));if(m.victim?.state==='rescued'&&!list.includes(m.victim))list.push(m.victim);
 for(const p of list){if(p.deteriorated||['transported','loading'].includes(p.state))continue;const since=p.rescuedAt??(p===m.victim?(m.times.rescued??m.elapsed):(m.mci?.start??0));
  const d=deteriorate(p.vitals,m.elapsed-since,p.triage?.aid??[]);if(!d)continue;p.vitals=d.vitals;p.deteriorated={note:d.note,at:m.elapsed};
  if(p.triage){p.retriage=true;flashHint(`⚠ ${p.id??'受困者'}：${d.note}，請走到傷患旁按 K 重新檢傷`);}if(p===m.victim)renderVictim();renderMci();}}
// 擔架小組（示意，2 組，每組 2 名隊員）：依優先順序把不可行走的紅、黃傷患抬到對應顏色分區；抬運中不能裝載上救護車。
function makeTeam(m,i){const g=new T.Group();scene.add(g);m.objects.push(g);const crew=[0,1].map(()=>{const p=actionKit.createPerson(g,'隊員');p.body.traverse(o=>{if(o.isMesh)o.castShadow=true;});return p;});
 const litter=new T.Mesh(new T.BoxGeometry(.6,.08,2.0),new T.MeshStandardMaterial({color:'#e8701a',roughness:.6}));litter.castShadow=true;g.add(litter);
 const home=m.staging.clone().add(new T.Vector3(i*2-1,0,1.5));return {crew,litter,state:'idle',pos:home.clone(),home,target:null,t:0,heading:0};}
function teamStep(team,goal,speed,dt){const d=goal.clone().sub(team.pos);d.y=0;const l=d.length();if(l<.15)return true;team.heading=Math.atan2(-d.x,-d.z);team.pos.addScaledVector(d.normalize(),Math.min(l,speed*dt));team.pos.y=ground.at(team.pos.x,team.pos.z);team.walk=(team.walk??0)+dt*speed*3;return false;}
function drawTeam(team){const f=new T.Vector3(-Math.sin(team.heading),0,-Math.cos(team.heading)),moving=team.state==='toPatient'||team.state==='carrying'||team.state==='return';
 team.crew.forEach((p,k)=>{const o=team.pos.clone().addScaledVector(f,k?-1.15:1.15);p.body.position.set(o.x,ground.at(o.x,o.z),o.z);p.body.rotation.y=team.heading;const sw=moving?Math.sin(team.walk+k*Math.PI)*.3:0;p.legs[0].rotation.x=sw;p.legs[1].rotation.x=-sw;p.arms.forEach(a=>a.rotation.x=team.state==='carrying'?-.5:0);});
 team.litter.position.set(team.pos.x,team.pos.y+(team.state==='carrying'?.75:.12),team.pos.z);team.litter.rotation.y=team.heading;}
function updateTeams(dt){const m=mission?.mci;if(!m)return;m.teams??=[0,1].map(i=>makeTeam(m,i));
 for(const team of m.teams){
  if(team.state==='idle'){const next=m.order.map(id=>m.patients.find(p=>p.id===id)).find(p=>p&&p.triage&&['red','yellow'].includes(p.triage.tag)&&!p.vitals.walks&&!p.atTarp&&!p.carried&&p.state==='waiting'&&p!==mission.victim);
   if(next){next.carried=true;team.target=next;team.state='toPatient';}else teamStep(team,team.home,1.4,dt);}
  else if(team.state==='toPatient'){if(teamStep(team,team.target.figure.root.position,1.4,dt)){team.state='lift';team.t=0;}}
  else if(team.state==='lift'){team.t+=dt;if(team.t>2){team.state='carrying';const p=team.target;p.state='carrying';if(p.figure.pose!=='lying')p.figure.setPose('lying');const slot=(m.slots[p.triage.tag]=(m.slots[p.triage.tag]??0)+1)-1;team.goal=m.tarps[p.triage.tag].clone().add(new T.Vector3((slot%2-.5)*1.6,0,(Math.floor(slot/2)%2-.5)*2.2));}}
  else if(team.state==='carrying'){const done=teamStep(team,team.goal,1.0,dt),p=team.target;p.figure.root.position.set(team.pos.x,team.pos.y+.83,team.pos.z);p.figure.root.rotation.y=team.heading;
   if(done){p.figure.root.position.set(team.goal.x,ground.at(team.goal.x,team.goal.z),team.goal.z);p.state='waiting';p.atTarp=true;team.target=null;team.state='return';renderMci();}}
  else if(team.state==='return'){team.state='idle';}
  drawTeam(team);}}
function updateMci(dt){
 const m=mission?.mci;if(!m)return;
 updateTeams(dt);
 for(const p of m.patients)if(p.walkTo&&p.state!=='transported'){const f=p.figure.root,d=p.walkTo.clone().sub(f.position);d.y=0;const l=d.length();if(l<.1){p.walkTo=null;p.figure.legs.forEach(x=>x.rotation.x=0);continue;}
  const step=Math.min(l,1.2*dt);f.position.addScaledVector(d.normalize(),step);f.position.y=ground.at(f.position.x,f.position.z);f.rotation.y=Math.atan2(-d.x,-d.z);const sw=Math.sin(mission.elapsed*7)*.35;p.figure.legs[0].rotation.x=sw;p.figure.legs[1].rotation.x=-sw;}
 const t=mission.elapsed-m.start;
 if(!m.amb.visible&&!m.loading&&t>=m.next&&!mciComplete(m.patients)){m.amb.visible=true;m.count++;m.waitingNoted=false;flashHint(`救護車 ${m.count} 號抵達停靠點，依後送順序裝載`);renderMci();}
 if(m.amb.visible&&!m.loading){const queue=m.order.map(id=>m.patients.find(p=>p.id===id)).filter(p=>p&&p.state!=='carrying'&&!p.retriage),load=loadAmbulance(queue);
  if(load.length){m.loading={load,t:0};for(const p of load){p.state='loading';p.walkTo=null;}}else if(!m.waitingNoted){m.waitingNoted=true;flashHint(`救護車 ${m.count} 號待命：尚無可後送傷患（需完成檢傷並在後送管理指定醫院）`);}}
 if(m.loading){m.loading.t+=dt;const L=m.loading;for(const p of L.load){const f=p.figure.root;f.position.lerp(m.staging.clone().setY(ground.at(m.staging.x,m.staging.z)),Math.min(1,dt*1.5));}
  if(L.t>=6){for(const p of L.load){p.state='transported';p.figure.root.visible=false;}m.departures.push({no:m.count,time:mission.elapsed,hospital:L.load[0].hospital,patients:L.load.map(p=>p.id)});
   flashHint(`救護車 ${m.count} 號載 ${L.load.map(p=>p.id).join('、')} 前往 ${HOSPITALS.find(h=>h.id===L.load[0].hospital).name}`);m.loading=null;m.amb.visible=false;m.next=t+AMBULANCE.interval;renderMci();
   if(mission.reportPending&&mciComplete(m.patients))showReport();}}
 if(!$('transport').hidden&&Math.floor(mission.elapsed*2)!==Math.floor((mission.elapsed-dt)*2))renderTransport();
}
function renderMci(){const m=mission?.mci;$('mciLine').hidden=!m;$('transportBtn').hidden=!m;if(!m)return;const P=m.patients,tri=P.filter(p=>p.triage).length,gone=P.filter(p=>p.state==='transported').length,t=mission.elapsed-m.start;
 $('mciLine').textContent=`大量傷患 ${P.length} 人・已檢傷 ${tri}・已後送 ${gone}・`+(m.loading?`救護車 ${m.count} 號裝載中`:m.amb.visible?`救護車 ${m.count} 號待命`:mciComplete(P)?'後送完成':`下一輛救護車 ${fmt(Math.max(0,m.next-t))}`);if(!$('transport').hidden)renderTransport();}
const tagChip=tag=>tag?`<i class="chip" style="background:${TAGS[tag].color}"></i>${TAGS[tag].label.split('（')[0]}`:'未檢傷';
function renderTransport(){const m=mission?.mci;if(!m)return;
 const rows=m.order.map(id=>m.patients.find(p=>p.id===id)).filter(p=>p&&p.state!=='transported');
 $('transportRows').innerHTML=rows.map((p,i)=>`<tr data-id="${p.id}"><td>${i+1}</td><td>${tagChip(p.triage.tag)}</td><td>${p.id}・${p.sex==='male'?'男':'女'}・${p.vitals.walks?'坐姿':'擔架'}${p.state==='loading'?'・裝載中':p.state==='carrying'?'・抬運中':p.atTarp?'・已到分區':''}${p.retriage?'・<b class="warn">惡化待重新檢傷</b>':p.deteriorated?'・已惡化':''}</td><td><select ${p.state==='loading'?'disabled':''}><option value="">選擇醫院</option>${HOSPITALS.map(h=>`<option value="${h.id}"${p.hospital===h.id?' selected':''}>${h.name}・${h.label}</option>`).join('')}</select></td><td><button data-mv="-1">↑</button><button data-mv="1">↓</button></td></tr>`).join('')||'<tr><td colspan="5">尚無已檢傷傷患（走到傷患旁按 K）</td></tr>';
 for(const tr of $('transportRows').querySelectorAll('tr[data-id]')){const id=tr.dataset.id;tr.querySelector('select').onchange=e=>{m.patients.find(p=>p.id===id).hospital=e.target.value||null;m.waitingNoted=false;};
  for(const b of tr.querySelectorAll('[data-mv]'))b.onclick=()=>{const i=m.order.indexOf(id),j=i+(+b.dataset.mv);if(j<0||j>=m.order.length)return;[m.order[i],m.order[j]]=[m.order[j],m.order[i]];renderTransport();};}
 const untriaged=m.patients.filter(p=>!p.triage).length,black=m.patients.filter(p=>p.triage?.tag==='black').length,t=mission.elapsed-m.start;
 $('transportInfo').textContent=`未檢傷 ${untriaged} 人・黑色（不後送）${black} 人・`+(m.loading?`救護車 ${m.count} 號裝載中`:m.amb.visible?`救護車 ${m.count} 號待命中`:`下一輛救護車約 ${fmt(Math.max(0,m.next-t))} 後抵達`)+`；每輛載擔架 ${AMBULANCE.stretcher}、坐姿 ${AMBULANCE.seated}，同車須同一醫院。`;
 $('transportDone').innerHTML=m.departures.map(d=>`<li>救護車 ${d.no} 號（${fmt(d.time)}）→ ${HOSPITALS.find(h=>h.id===d.hospital).name}：${d.patients.join('、')}</li>`).join('')||'<li>尚未後送</li>';}
function openTransport(){if(!mission?.mci){flashHint('後送管理用於「大量傷患」派遣（暫停選單 → 設定 → 派遣類型）');return;}renderTransport();$('transport').hidden=false;state.keys.clear();}
function closeTransport(){$('transport').hidden=true;}
$('transportBtn').onclick=()=>openTransport();$('transportClose').onclick=()=>closeTransport();
$('transportDefault').onclick=()=>{const m=mission?.mci;if(!m)return;for(const p of m.patients)if(p.triage&&!p.hospital&&p.state!=='transported')p.hospital=p.triage.tag==='red'?'A':p.triage.tag==='yellow'?'B':'C';m.waitingNoted=false;renderTransport();};
function mciReportRows(row){const m=mission?.mci;if(!m)return '';const r=transportReference(m.patients,m.departures);
 return row('大量傷患：人數／已檢傷／已後送',`${m.patients.length}／${r.triaged}／${r.transported}`)+row('你的分類與 START 參考相同',`${r.agree}／${r.triaged}`)+m.departures.map(d=>row(`救護車 ${d.no} 號（${fmt(d.time)}）`,`${HOSPITALS.find(h=>h.id===d.hospital).name}：${d.patients.join('、')}`)).join('')+
  (r.notes.length?r.notes.map(n=>row('參考比對',n.text)).join(''):row('參考比對','後送先後與醫院層級無倒置或不符'));}

// 性別、狀況與體重為隨機示意：可自行行動 50%、昏迷 30%（倒臥）、重傷 20%（癱坐）；昏迷與重傷需以擔架搬運。
function makeVictim(site){
 const tx=-site.nz,tz=site.nx,half=Math.hypot(site.wall[2]-site.wall[0],site.wall[3]-site.wall[1])/2,off=half>4.5?3*(Math.random()<.5?-1:1):0;
 const sex=Math.random()<.5?'male':'female',roll=Math.random(),condition=roll<.5?'well':roll<.8?'unconscious':'serious',stretcher=needsStretcher(condition);
 const weight=Math.round(sex==='male'?60+Math.random()*30:48+Math.random()*27);
 const x=site.x+tx*off,z=site.z+tz*off,slab=site.base+(site.floor-1)*3.4,figure=createPatient(scene,{sex,condition}),d=stretcher?.45:.25,window=new T.Vector3(x+site.nx*d,slab,z+site.nz*d);
 figure.root.position.copy(window);figure.root.rotation.y=condition==='unconscious'?Math.atan2(tx,tz):Math.atan2(-site.nx,-site.nz);
 const vitals=makeVitals(condition);
 return {figure,window,x,z,state:'waiting',floor:site.floor,sex,condition,stretcher,weight,vitals,collar:stretcher&&needsCollar(vitals)};
}
// 籃內載重：設定中的消防員、裝備、器材、擔架與容許籃載重（示意預設，可修改）＋待救者估計體重。
function currentLoad(withVictim){const v=withVictim?mission?.victim:null,L=settings.load;return basketLoad({firefighters:1,firefighter:L.firefighter,gear:L.gear,equipment:L.equipment,victim:v?v.weight:0,stretcher:v?.stretcher?L.stretcher:0,capacity:L.capacity});}
function renderLoad(){const ph=aerial?.state.phase??'idle',withVictim=!!mission?.victim&&(mission.victim.state!=='rescued')&&!['ready','raising'].includes(ph),l=currentLoad(withVictim);
 $('aerialLoad').textContent=`籃內載重 ${Math.round(l.total)}／${l.capacity} kg`+(withVictim?'（含待救者'+(mission.victim.stretcher?'與擔架':'')+'）':'')+(l.over?'・超過容許':'');$('aerialLoad').classList.toggle('over',l.over);$('aerialLoad').title=l.parts.map(([k,v])=>k+' '+Math.round(v)+' kg').join('＋')+'；容許籃載重為設定值（原廠最高額定 500 kg，非該工況可用值）';}
function renderVictim(){const v=mission?.victim;$('victimLine').hidden=!v;renderLoad();if(!v)return;$('victimLine').textContent=`受困者 1 人（${v.sex==='male'?'男性':'女性'}・${CONDITION_LABEL[v.condition]}・估計 ${v.weight} kg）：`+({waiting:`${v.floor} 樓窗口${v.condition==='unconscious'?'倒臥':v.condition==='serious'?'癱坐':''}待救（需雲梯籃架${v.stretcher?'＋擔架':''}）`,boarding:v.stretcher?'移上擔架中':'進入籃架中',basket:v.stretcher?'在籃架擔架上':'在籃內',unloading:v.stretcher?'擔架卸下中':'離籃中',rescued:v.stretcher?'已以擔架救出交接':'已救出交接'}[v.state])+`・${v.vitals.mechanisms.map(m=>MECHANISMS[m]).join('、')}`+(v.triage?`・檢傷 ${TAGS[v.triage.tag].label}`:v.state==='rescued'?'・待檢傷（走到傷患旁按 K）':'');$('triageBtn').hidden=!(v.state==='rescued');$('triageBtn').textContent=v.triage?'檢傷與處置紀錄':'檢傷與處置（K）';$('victimLine').classList.toggle('done',v.state==='rescued');}
function gisVehicles(){return (gis?.data?.vehicles??[]).filter(v=>v.unitId!=='engine1'&&v.unitId!=='commander'&&v.unitId!=='aerial').map(v=>({id:v.unitId,x:v.x,z:v.z,heading:v.heading,length:geoModels[v.model].length,width:geoModels[v.model].span,height:geoModels[v.model].height}));}
function startMission(){
 if(mission&&mission.phase<6&&!confirm('目前任務尚未完成，要改派新的火警嗎？'))return;if(state.mode==='interior')exitBuilding();for(const p of mission?.indoor?.rescued??[])if(!mission.mci)scene.remove(p.figure.root);closeEquip();
 const target=gisDep?.target,fromGis=target?siteFromBuilding(district.buildings,streets.features,ground,{id:target.id,point:target.point,entrance:gisDep.entrance}):null;
 const site=fromGis??pickFireSite(district.buildings,streets.features,ground,Math.random,{exclude,colliders});if(!site)return;
 if(target&&!fromGis)flashHint('GIS 指定的搶救建物不在本頁量體範圍內，改為隨機派遣');
 aerial?.stow();setAerialMode(null);clearMci();clearOps();if(mission?.victim)scene.remove(mission.victim.figure.root);
 mission={site,phase:0,elapsed:0,times:{},intensity:.55,hose:false,spraying:false,parking:null,victim:makeVictim(site),water:WATER.tank,supply:null,upper:null};fireFx.setSite(site);upperFx.setSite(null);lowerFx.setSite(null);state.air=AIR.full;
 mission.fireMain={site,get intensity(){return mission?.intensity??0},set intensity(v){if(mission)mission.intensity=v;}};mission.hydrants=placeHydrants(site);mission.entry=placeEntry(site);mission.indoor=setupIndoor(site);if(mission.indoor.closed)mission.intensity=.3;
 if(settings.missionType==='mci')mission.mci=setupMci(site);renderVictim();renderMci();renderIndoorLine();
 squadKit.setSize(settings.squadSize??5);squadKit.build(SQUAD.count);const squadPoses=squadKit.dispatch(site,{playerTruck:truck,now:0});mission.squadLog=[];
 const surveyPose=surveyKit?.dispatch(site,{home:spawn.support,existing:[{x:truck.x,z:truck.z},...squadPoses],now:0});
 tankerKit?.dispatch(site,{home:spawn.support,existing:[{x:truck.x,z:truck.z},...squadPoses,...(surveyPose?[surveyPose]:[])],now:0});renderSquads();
 $('missionTitle').textContent=mission.mci?'建物火警・大量傷患':'建物火警';$('missionWhere').textContent=`${site.street||'信義區'} 一帶・${site.floor} 樓${mission.indoor.closed?'窗戶冒濃煙（窗戶未破）':'冒煙'}（示意）`+(site.fromGis?'・GIS 指定搶救建物'+(gisDep?.entrance?'，起火面取第一正面':''):'');$('mission').hidden=false;$('missionReport').hidden=true;
 setWaypoint(site.x+site.nx*16,site.z+site.nz*16,'火警現場');renderMission();flashHint(state.mode==='drive'?'按 Q 開警示燈，依地圖黃線前往':'先走到消防車按 E 上車');
}
function endMission(){squadKit.hide();tankerKit?.hide();surveyKit?.hide();closeSquads();for(const id of ['tAerial','tSupply','tNozzle','tEquip','tTriage','tSquad'])$(id).hidden=true;if(state.mode==='interior')exitBuilding();closeEquip();indoor.clear();entryMark.visible=false;for(const p of mission?.indoor?.rescued??[])if(!mission.mci)scene.remove(p.figure.root);$('indoorLine').hidden=true;closeTriage();clearMci();clearOps();aerial?.stow();aerial?.park(spawn.aerial);if(mission?.victim)scene.remove(mission.victim.figure.root);gis?.hide('aerial',!!aerial?.state.stationed);setAerialMode(null);mission=null;renderMci();fireFx.setSite(null);$('mission').hidden=true;clearWaypoint();person.nozzle.visible=false;$('tSpray').hidden=$('tHose').hidden=true;}
// 各步驟以實際紀錄時間判定完成；以雲梯出水等方式越過的步驟標示為略過，不顯示為已完成。
const STEP_TIMES=['depart','arrive','parked','hose','water','done'];
function renderMission(){if(!mission)return;$('missionSteps').innerHTML=STEPS.map((s,i)=>{const done=mission.times[STEP_TIMES[i]]!==undefined,skip=!done&&i<mission.phase;return `<li class="${done?'done':skip?'skip':i===mission.phase?'now':''}">${s}${skip?'（略過）':''}</li>`;}).join('');$('fireLevel').style.width=Math.round(Math.max(0,...fireList().map(f=>f.intensity))*100)+'%';}
function toggleHose(){
 if(!mission||state.mode!=='walk')return;
 if(mission.hose){if(Math.hypot(state.x-truck.x,state.z-truck.z)>8){flashHint('回到消防車旁才能收回水線');return;}mission.hose=false;person.nozzle.visible=false;flashHint('已收回水線');return;}
 if(mission.phase<3){flashHint('請先依步驟停妥消防車');return;}
 if(!nearTruck()){flashHint('走到消防車旁按 F 佈設水線');return;}
 mission.hose=true;person.nozzle.visible=true;if(mission.phase===3){mission.phase=4;mission.times.hose=mission.elapsed;}flashHint('面向火點，按住 Space 出水（水線長 '+RULES.hoseLength+' m）');renderMission();
}
// ---------- 火場作業（訓練示意）：多樓層火點、供水、空氣呼吸器、瞄子模式 ----------
const upperFx=createFireFX(scene),lowerFx=createFireFX(scene);
state.nozzle='stream';state.air=AIR.full;state.airSwap=0;
function fireList(){const m=mission;if(!m)return [];return [m.fireMain,m.upper,m.lower].filter(Boolean);}
// 室內樓層 → 該層火點（起火層、上一層延燒、下一層延燒）。
function fireOfLevel(lv){const m=mission,F=m.site.floor;return lv===F?m.fireMain:lv===F+1?m.upper:lv===F-1?m.lower:null;}
function activeFire(){return fireList().find(f=>f.intensity>0)??mission.fireMain;}
// 示意消防栓：起火建物附近街側空地 2 處（非實際消防栓位置）。
function placeHydrants(site){const free=openGround(site),tx=-site.nz,tz=site.nx,out=[];
 for(const [d,a] of [[6,28],[6,-30],[9,40],[9,-42],[5,55],[5,-55],[12,24],[12,-26]]){if(out.length>=2)break;const x=site.x+site.nx*d+tx*a,z=site.z+site.nz*d+tz*a;if(!free(x,z,.8)||out.some(h=>Math.hypot(h.pos.x-x,h.pos.z-z)<20))continue;
  const g=new T.Group(),y=ground.at(x,z),red=new T.MeshStandardMaterial({color:'#c8202b',roughness:.5}),body=new T.Mesh(new T.CylinderGeometry(.16,.2,.75,14),red);body.position.y=.375;const cap=new T.Mesh(new T.SphereGeometry(.17,12,8,0,Math.PI*2,0,Math.PI/2),red);cap.position.y=.75;
  const outlet=new T.Mesh(new T.CylinderGeometry(.06,.06,.42,10),new T.MeshStandardMaterial({color:'#9aa4a9',metalness:.6}));outlet.rotation.z=Math.PI/2;outlet.position.y=.5;g.add(body,cap,outlet);g.position.set(x,y,z);g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  const tag=document.createElement('canvas');tag.width=256;tag.height=56;const c2=tag.getContext('2d');c2.fillStyle='rgba(10,16,22,.8)';c2.fillRect(0,0,256,56);c2.fillStyle='#ff8a80';c2.font='bold 26px sans-serif';c2.fillText('示意消防栓',16,37);const tex=new T.CanvasTexture(tag);tex.colorSpace=T.SRGBColorSpace;const sp=new T.Sprite(new T.SpriteMaterial({map:tex,depthTest:false}));sp.scale.set(2.2,.48,1);sp.position.y=1.6;sp.renderOrder=6;g.add(sp);
  scene.add(g);out.push({pos:new T.Vector3(x,y,z),mesh:g});}
 return out;}
const supplyLine=new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial({color:'#e6d9a8',roughness:.7}));supplyLine.visible=false;supplyLine.castShadow=true;scene.add(supplyLine);
function drawLine(a,b){const mid=a.clone().lerp(b,.5);mid.y=Math.min(a.y,b.y)-.3;const c=new T.CatmullRomCurve3([a,a.clone().lerp(mid,.5).setY(mid.y+.1),mid,b.clone().lerp(mid,.5).setY(mid.y+.1),b]);supplyLine.geometry.dispose();supplyLine.geometry=new T.TubeGeometry(c,30,.05,6,false);supplyLine.visible=true;}
// 供水（G）：在消防車旁拉出水帶 → 走到消防栓按 G 連接（水帶 80 m 內）→ 持續補水；消防車移動則脫開。
function supplyAction(){const m=mission;if(!m){flashHint('供水作業需在任務中進行');return;}if(state.mode!=='walk'){flashHint('請下車操作供水');return;}
 const nearTruck2=Math.hypot(state.x-truck.x,state.z-truck.z)<5,h=m.hydrants.map(h=>({h,d:Math.hypot(state.x-h.pos.x,state.z-h.pos.z)})).sort((a,b)=>a.d-b.d)[0];
 if(m.supply?.connected){if(nearTruck2||(h&&h.d<3)){m.supply=null;supplyLine.visible=false;flashHint('已拆除供水水帶');}else flashHint('供水已連接；到消防車或消防栓旁按 G 可拆除');return;}
 if(m.supply?.carrying){if(h&&h.d<3){const len=Math.hypot(h.h.pos.x-truck.x,h.h.pos.z-truck.z);if(len>SUPPLY.length){flashHint(`消防栓距消防車 ${Math.round(len)} m，超過供水水帶 ${SUPPLY.length} m`);return;}
   m.supply={connected:true,hydrant:h.h,truckAt:{x:truck.x,z:truck.z}};m.times.supply??=m.elapsed;flashHint('已連接消防栓：水箱持續補水');return;}
  if(nearTruck2){m.supply=null;supplyLine.visible=false;flashHint('已收回供水水帶');return;}flashHint('走到示意消防栓（紅色，地圖藍點）旁按 G 連接');return;}
 if(!nearTruck2){flashHint(m.hydrants.length?'先走到消防車旁按 G 拉出供水水帶':'附近找不到可放置示意消防栓的空地');return;}
 if(Math.abs(truck.v)>.3){flashHint('消防車需停妥');return;}m.supply={carrying:true};flashHint(`已拉出供水水帶（${SUPPLY.length} m），走到消防栓旁按 G 連接`);}
function updateSupply(dt){const m=mission;if(!m?.supply){supplyLine.visible=false;return;}const tp=new T.Vector3(truck.x,ground.at(truck.x,truck.z)+.6,truck.z);
 if(m.supply.carrying){const dx=state.x-truck.x,dz=state.z-truck.z,d=Math.hypot(dx,dz);if(d>SUPPLY.length){state.x=truck.x+dx/d*SUPPLY.length;state.z=truck.z+dz/d*SUPPLY.length;}drawLine(tp,new T.Vector3(state.x,ground.at(state.x,state.z)+.9,state.z));}
 else if(m.supply.connected){if(Math.hypot(truck.x-m.supply.truckAt.x,truck.z-m.supply.truckAt.z)>1.5){m.supply=null;supplyLine.visible=false;flashHint('⚠ 消防車移動，供水水帶已脫開');return;}const hp=m.supply.hydrant.pos;drawLine(tp,new T.Vector3(hp.x,hp.y+.5,hp.z));}}
// 空氣呼吸器：步行時在燃燒中火點 25 m 內耗氣；到消防車旁（危害區外）停留 4 秒更換氣瓶。
function updateAir(dt){if(!mission||state.mode==='drive'||mission.phase>=6&&!mission.reportPending&&state.mode!=='interior'){return;}const hz=state.mode==='interior'||inHazard(state.x,state.z,fireList()),atEngine=state.mode==='walk'&&Math.hypot(state.x-truck.x,state.z-truck.z)<5&&!mission.spraying;
 const prev=state.air,r=stepAir(state.air,dt,{inHazard:hz,atEngine,swapTimer:state.airSwap});state.air=r.air;state.airSwap=r.swapTimer;state.inHazard=hz;
 if(prev>AIR.warn&&r.air<=AIR.warn){flashHint(`⚠ 空氣量 ${AIR.warn} bar 以下（警報），請撤離並更換氣瓶`);showNotice('空氣呼吸器低壓警報',3000);}
 if(r.swapped){mission.airSwaps=(mission.airSwaps??0)+1;flashHint('已更換氣瓶（300 bar）');}}
function renderOps(){const m=mission;$('opsLine').hidden=!m;if(!m)return;const air=Math.round(state.air),water=Math.round(m.water);
 $('opsLine').innerHTML=`<span>水箱 <b>${water.toLocaleString()}</b> L${m.supply?.connected?'（消防栓供水中）':m.relaySquad?`（${m.relaySquad}中繼供水）`:tankerKit?.vehicle.supplying?`（${TANKER.label}供水）`:m.supply?.carrying?'（拉水帶中）':''}</span><span>瞄子 <b>${NOZZLE[state.nozzle].label}</b>（V）</span><span class="${air<=AIR.warn?'warn':''}">空氣 <b>${air}</b> bar${state.inHazard?'・危害區':''}${state.airSwap>0?'・換瓶中':''}</span>`;}
function clearOps(){upperFx.setSite(null);lowerFx.setSite(null);supplyLine.visible=false;for(const h of mission?.hydrants??[])scene.remove(h.mesh);}
function toggleNozzle(){state.nozzle=state.nozzle==='stream'?'fog':'stream';const N=NOZZLE[state.nozzle];flashHint(`瞄子：${N.label}（射程 ${N.reach} m，錐角較${state.nozzle==='fog'?'寬、近距離壓制較快':'窄、射程較遠'}）`);renderOps();}
// ---------- 建物內部作業（訓練示意）：進入起火樓層、破壞進入、煙層、熱顯像、隊員指令、通風排煙、閃燃與回燃徵兆 ----------
// 室內為依起火立面寬度產生的示意平面（非該建物實際格局）；溫度、煙量、含氧量與時間皆為遊戲化示意。
const indoor=createInterior({createPerson:actionKit.createPerson});
indoor.hint=t=>flashHint(t);
indoor.onExit=()=>exitBuilding();
indoor.onForcedExit=()=>exitBuilding(true);
indoor.onRescue=v=>rescueIndoor(v);
indoor.onCall=c=>audio.call(c);
indoor.onEvent=(kind,text,extra={})=>{const m=mission;if(!m)return;const t=m.elapsed,F=m.site.floor,fl=extra.floor??F;(m.indoor.events??=[]).push({time:t,kind,text,floor:extra.floor??null});
 if(kind==='floor'&&fl===F)m.times.fireFloor??=t;
 if(kind==='standpipe')m.indoor.standpipe=(m.indoor.standpipe??0)+1;
 if(kind==='flashover'&&fl!==F){if(m.upper)m.upper.intensity=1;showNotice(`⚠ ${fl} 樓起火房間閃燃（示意）`,5000);}
 if(kind==='flashover'&&fl===F){m.times.flashover??=t;m.intensity=1;showNotice('⚠ 起火房間閃燃（示意）：室內人員立即撤離',5000);flashHint('⚠ 閃燃：起火房間全面燃燒，立即撤離或退到門外以水線防護');}
 if(kind==='rollover'){m.times.rollover??=t;if(state.mode==='interior')flashHint('⚠ 天花板出現火舌（滾燃徵兆）：降低姿勢，以水霧冷卻上層熱煙或撤離');}
 if(kind==='backdraft'){m.times.backdraft??=t;if(fl===F)m.intensity=Math.min(1,m.intensity+.3);else if(m.upper)m.upper.intensity=Math.min(1,m.upper.intensity+.3);showNotice('⚠ 回燃（示意）：開口處噴出火球',5000);}
 if(kind==='forced')m.indoor.forced=(m.indoor.forced??0)+1;
 if(kind==='vent')m.indoor.vents=(m.indoor.vents??0)+1;};
const fpPitch=()=>.32-state.pitch;
const entryMark=new T.Group();entryMark.visible=false;scene.add(entryMark);
{const pole=new T.Mesh(new T.CylinderGeometry(.1,.1,2.6,10),new T.MeshStandardMaterial({color:'#ffd33d',emissive:'#5a4500'}));pole.position.y=1.3;entryMark.add(pole);
 const c=document.createElement('canvas'),g=c.getContext('2d');g.font='bold 30px sans-serif';const text='建物入口（示意）・按 E 進入',w=Math.ceil(g.measureText(text).width)+28;c.width=w;c.height=48;g.fillStyle='rgba(10,16,22,.78)';g.beginPath();g.roundRect(0,0,w,48,10);g.fill();g.fillStyle='#ffd33d';g.font='bold 30px sans-serif';g.textBaseline='middle';g.fillText(text,14,25);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;const sp=new T.Sprite(new T.SpriteMaterial({map:t,depthTest:false,transparent:true}));sp.scale.set(w/48*.8,.8,1);sp.position.y=3.2;sp.renderOrder=6;entryMark.add(sp);}
// 入口：起火立面外側（GIS 頁有第一正面入口且在立面 25 m 內時用該點）。
function placeEntry(site){let x=site.x+site.nx*1.3,z=site.z+site.nz*1.3;const e=gisDep?.entrance;if(site.fromGis&&e){const [ex,ez]=project(e.longitude,e.latitude);if(Math.hypot(ex-site.x,ez-site.z)<25){const p=colliders.resolve(ex,ez,.5);x=p.x;z=p.z;}}
 const p=colliders.resolve(x,z,.6);entryMark.position.set(p.x,ground.at(p.x,p.z),p.z);entryMark.visible=true;return {x:p.x,z:p.z};}
function nearEntry(){const m=mission;return !!(m?.entry&&state.mode==='walk'&&m.phase>=3&&m.phase<6&&Math.hypot(state.x-m.entry.x,state.z-m.entry.z)<2.6);}
function setupIndoor(site,closed=Math.random()<.35){const F=site.floor,floors=buildingFloors(F,site.height),byFloor={};
 // 受困者（示意）：起火層 1–2 人、上一層 50% 1 人（昏迷）；起火層以下各層 40% 1 人（可行走 50%、重傷 25%、昏迷 25%，受煙影響）。
 byFloor[F]=Math.random()<.5?2:1;if(floors.includes(F+1)&&Math.random()<.5)byFloor[F+1]=1;for(const f of floors)if(f>1&&f<F&&Math.random()<.4)byFloor[f]=1;
 const vitalsFor=v=>{if(v.floor>=F){const c=v.floor===F&&Math.random()<.3?'serious':'unconscious';return {condition:c,vitals:makeVitals(c)};}const r=Math.random(),condition=r<.5?'well':r<.75?'serious':'unconscious';return {condition,vitals:makeVitals(condition)};};
 indoor.setup(site,{seed:Math.floor(Math.random()*1e9),closed,victimsByFloor:byFloor,floors,vitalsFor});indoor.setSupportTeams(state.supportTeams);
 if(mission){mission.lowerPlanned=F>=2&&Math.random()<LOWER.chance;mission.lowerTimer=0;}
 return {closed,floors,victims:Object.values(byFloor).reduce((a,b)=>a+b,0),events:[],entries:[],rescued:[],items:{...state.items},windowHit:0};}
// 裝備（示意，最多 4 項）：在消防車旁按 U 選擇。
state.items={halligan:true,tic:true};state.supportTeams=2;
function openEquip(){if(!mission){flashHint('裝備選擇用於任務中（按 T 派遣）');return;}if(state.mode!=='walk'||!nearTruck()){flashHint('走到消防車旁按 U 選擇攜帶裝備');return;}
 $('equipList').innerHTML=Object.entries(EQUIPMENT).map(([k,v])=>`<label><input type="checkbox" value="${k}"${state.items[k]?' checked':''}> <b>${v.label}</b><small>${v.note}</small></label>`).join('');
 const sync=()=>{const n=$('equipList').querySelectorAll('input:checked').length;for(const c of $('equipList').querySelectorAll('input'))c.disabled=!c.checked&&n>=CARRY_LIMIT;$('equipCount').textContent=`${n}／${CARRY_LIMIT}`;};
 for(const c of $('equipList').querySelectorAll('input'))c.onchange=()=>{state.items={};for(const x of $('equipList').querySelectorAll('input:checked'))state.items[x.value]=true;if(mission?.indoor)mission.indoor.items={...state.items};sync();};
 $('supportTeams').value=String(state.supportTeams);$('supportTeams').onchange=()=>{state.supportTeams=+$('supportTeams').value;indoor.setSupportTeams(state.supportTeams);};
 sync();$('equip').hidden=false;state.keys.clear();}
function closeEquip(){$('equip').hidden=true;}
$('equipClose').onclick=()=>closeEquip();
function enterBuilding(){const m=mission;if(!m||!nearEntry())return;
 if(state.air<100){flashHint('空氣低於 100 bar（示意進入下限）：先回消防車旁更換氣瓶');return;}
 // 自消防車拉入的水線：室內可用長度＝水線總長 − 消防車到入口；樓梯與室內路線依實際走過的距離扣除。
 let budget=0;if(m.hose){budget=hoseRemaining({total:RULES.hoseLength,extension:state.items.hose20?20:0,outside:Math.hypot(truck.x-m.entry.x,truck.z-m.entry.z),floor:1});
  if(budget<2){flashHint('水線長度不足以進入建物：攜帶延長水帶（U），或收回水線、攜帶水帶背包改接各樓送水口');return;}}
 state.mode='interior';player.visible=false;state.x=m.entry.x;state.z=m.entry.z;state.pitch=.32;state.yaw=-Math.PI/2;state.keys.clear();
 m.indoor.items={...state.items};m.indoor.entries.push({time:m.elapsed,hose:m.hose});m.times.entry??=m.elapsed;
 indoor.enter({hose:m.hose,budget,items:state.items});$('indoorPanel').hidden=false;document.body.classList.add('indoor');$('prompt').hidden=true;syncUi();
 showNotice(`自 1 樓出入口進入：沿樓梯走上 ${m.site.floor} 樓起火層・室內為示意平面`,4000);
 flashHint(m.hose?`已帶水線進入（可用約 ${Math.round(budget)} m，樓梯與室內依走過距離扣除）`:state.items.pack?'未帶水線：可在各樓樓梯間送水口（紅色箱）按住 F 接水帶背包':'未帶水線進入（只能搜索、不能射水）');}
function exitBuilding(forced=false){const m=mission;if(state.mode!=='interior')return;indoor.exit();if(indoor.me.thermal)indoor.setThermal(false);$('thermal').hidden=true;
 state.mode='walk';player.visible=true;const p=colliders.resolve(m.entry.x+m.site.nx*1.5,m.entry.z+m.site.nz*1.5,.4);state.x=p.x;state.z=p.z;state.pitch=.32;state.yaw=Math.atan2(-m.site.nx,-m.site.nz)+Math.PI;state.facing=state.yaw;
 $('indoorPanel').hidden=true;document.body.classList.remove('indoor');syncUi();
 if(forced){m.indoor.forcedExit=(m.indoor.forcedExit??0)+1;showNotice('熱暴露達上限，已緊急撤出建物（示意）',5000);}flashHint(forced?'已緊急撤出：在外部以水線控制火勢或冷卻後再進入':'已撤出建物');}
function rescueIndoor(v){const m=mission;if(!m)return;const tx=-m.site.nz,tz=m.site.nx,k=m.indoor.rescued.length,x=m.entry.x+m.site.nx*3+tx*(k*1.8-1),z=m.entry.z+m.site.nz*3+tz*(k*1.8-1),pos=colliders.resolve(x,z,.6);
 const figure=createPatient(scene,{sex:v.sex,condition:v.condition??'unconscious'});figure.root.position.set(pos.x,ground.at(pos.x,pos.z),pos.z);figure.root.rotation.y=Math.atan2(tx,tz);
 const p={id:v.id,floor:v.floor,sex:v.sex,condition:v.condition??'unconscious',vitals:v.vitals,weight:v.weight,figure,state:m.mci?'waiting':'rescued',triage:null,indoor:true,rescuedAt:m.elapsed,hospital:null};
 m.indoor.rescued.push(p);if(m.mci)m.mci.patients.push(p);showNotice(`室內受困者 ${v.id} 已由隊員搬出交接（入口外），請檢傷`,4000);renderIndoorLine();}
function interiorKey(k){if(k==='e')indoor.interact();else if(k==='x')indoor.ajar();else if(k==='f')indoor.useItem(true);else if(k==='c'){const c=indoor.toggleCrouch();flashHint(c?'蹲低前進（視線在煙層下、熱暴露較低）':'站立');}
 else if(k==='i'){const on=indoor.toggleThermal();$('thermal').hidden=!on;}else if(k==='v')toggleNozzle();else if('123456'.includes(k)&&k.length===1)indoor.command(+k);}
for(const b of document.querySelectorAll('#indoorPanel [data-k]')){if(b.dataset.k==='f'){b.addEventListener('pointerdown',()=>{state.keys.add('f');interiorKey('f');});const up=()=>state.keys.delete('f');b.addEventListener('pointerup',up);b.addEventListener('pointerleave',up);}else b.onclick=()=>interiorKey(b.dataset.k);}
function renderIndoorLine(){const m=mission;$('indoorLine').hidden=!m?.indoor;if(!m?.indoor)return;const left=indoor.victims().filter(v=>v.state!=='rescued').length;
 $('indoorLine').textContent=`室內（1–${m.indoor.floors.at(-1)} 樓・示意平面）：`+(m.indoor.closed&&indoor.fireWindow()?.state==='closed'?'起火房間窗戶未破（通風受限）・':'')+`受困者已救出 ${m.indoor.rescued.length}／${m.indoor.victims}`+(left?'（尚有人在室內）':'')+`・裝備：${Object.keys(state.items).map(k=>EQUIPMENT[k].label.split('（')[0]).join('、')||'無'}（U）`;}
function renderIndoorHud(){const s=indoor.status(),warn=v=>v?' class="warn"':'';
 $('indoorStatus').innerHTML=`<span><b>${s.floor} 樓</b>${s.floor===mission.site.floor?'（起火層）':''}・${s.space}</span><span${warn(s.layer<1.2)}>煙層 <b>${s.layer.toFixed(1)}</b> m</span><span${warn(s.T>=300)}>上層 <b>${Math.round(s.T)}</b> °C</span><span>含氧 <b>${(s.o2*100).toFixed(0)}</b>%</span><span${warn(s.exposure>=EXPOSURE.warn)}>熱暴露 <b>${Math.round(s.exposure)}</b></span>`+(s.hoseLeft!==null?`<span${warn(s.hoseLeft<3)}>${s.standpipe?s.standpipe+' 樓送水口':''}水線剩 <b>${Math.max(0,Math.round(s.hoseLeft))}</b> m</span>`:'<span>未帶水線</span>')+`<span>${s.crouch?'蹲低':'站立'}</span>`+(s.ppv.on?`<span${warn(!s.ppv.effective)}>排煙機${s.ppv.effective?'送風中':'：'+s.ppv.reason}</span>`:'')+(s.pending?'<span class="warn">回燃徵兆</span>':'')+(s.flashed?'<span class="warn">閃燃</span>':s.rollover?'<span class="warn">滾燃徵兆</span>':'');
 $('callLine').textContent=s.call??'';$('callLine').hidden=!s.call;
 if(s.thermal){const r=indoor.reticle(camera);$('thermalRead').textContent=r===null?'—':`${r} °C`;}
 const sup=indoor.supportTeams.filter(t=>t.state!=='idle').length;const crew=indoor.crew.map(c=>c.out?'已撤出':c.cover&&c.state==='follow'?'掩護射水':({cover:'掩護射水',follow:'跟隨',move:'移動',search:'搜索',force:'破門',lift:'抬起',carry:'搬運',idle:'待命',spray:'射水'}[c.state]??c.state));$('crewLine').textContent='隊員：'+crew.join('、')+`・支援小組 ${indoor.supportTeams.length} 組（出勤 ${sup}）`;}
function updateInterior(dt){const m=mission;if(!m){exitBuilding();return;}const [f,r]=input();
 indoor.update(dt,{input:[f,r],yaw:state.yaw,pitch:fpPitch(),run:state.keys.has('shift')||state.run||state.pad.held.run,intensity:m.phase<6?m.intensity:0,forceHeld:state.keys.has('f')||!!state.pad.held.use});
 if(Math.floor(m.elapsed*4)!==Math.floor((m.elapsed-dt)*4))renderIndoorHud();}
// ---------- 分隊（訓練示意）：3 個分隊、每分隊 2 部水箱車、4–5 人；自動出勤、到場待命，由中隊長下達任務 ----------
const squadKit=createSquads({scene,template:truck.template,createPerson:actionKit.createPerson,ground,colliders,graph:routeGraphs.drive,life,playerHome:spawn.support});
squadKit.setRouter((x0,z0,x1,z1)=>findRoute(routeGraphs.drive,x0,z0,x1,z1));squadKit.build(SQUAD.count);
// 水庫車「信義61」：背景載入，載入失敗不影響其他功能（派遣時略過）。
// 消防局勤務車（Outlander）：背景載入，失敗不影響其他功能。
let surveyKit=null;new GLTFLoader().loadAsync('assets/survey-car.glb?v=survey-20261025').then(g=>{surveyKit=createSurveyCar({scene,template:g.scene,ground,colliders,graph:routeGraphs.drive,label:squadKit.label});surveyKit.setRouter((x0,z0,x1,z1)=>findRoute(routeGraphs.drive,x0,z0,x1,z1));}).catch(e=>console.warn('勤務車模型載入失敗',e));
let tankerKit=null;new GLTFLoader().loadAsync('assets/water-tanker.glb?v=tanker-20261024').then(g=>{tankerKit=createTanker({scene,template:g.scene,ground,colliders,graph:routeGraphs.drive,label:squadKit.label});tankerKit.setRouter((x0,z0,x1,z1)=>findRoute(routeGraphs.drive,x0,z0,x1,z1));}).catch(e=>console.warn('水庫車模型載入失敗',e));
function squadNote(sq,text){flashHint(text);showNotice(text,3500);if(mission)(mission.squadLog??=[]).push({time:mission.elapsed,squad:sq?.name??'',text});}
function squadCtx(dt){const m=mission,site=m.site,F=site.floor;
 return {t:clock.getElapsed?.()??m.elapsed,now:m.elapsed,site,entry:m.entry,hydrants:(m.hydrants??[]).map(h=>({x:h.pos.x,z:h.pos.z})),playerDeparted:m.phase>=1,
  note:squadNote,onArrive:sq=>{squadNote(sq,`${sq.name}抵達現場、人員下車待命（按 B 分隊指揮）`);renderSquads();},
  blockers:v=>[...truckCircles(),...life.circles(),...squadKit.circles().filter(c=>Math.hypot(c[0]-v.x,c[1]-v.z)>2.6),...(tankerKit?.circles()??[]),...(surveyKit?.circles()??[]),[state.x,state.z,.5]],
  target:(x,z)=>{let best=null;for(const f of fireList()){if(!(f.intensity>0))continue;const fx=f.site.x-f.site.nx*.5,fz=f.site.z-f.site.nz*.5,d=Math.hypot(fx-x,fz-z,f.site.y-1.2);if(!best||d<best.dist)best={fire:f,x:fx,y:f.site.y,z:fz,dist:d};}return best;},
  knock:(f,amount,sq)=>{if(m.phase>=6)return;const win=indoor.fireWindow();if(f===m.fireMain&&win?.state==='closed'){m.indoor.windowHit+=amount/SQUAD.knock;if(m.indoor.windowHit>1.5)indoor.breakWindow(win.id);return;}
   f.intensity=Math.max(0,f.intensity-amount);if(m.times.water===undefined)m.times.water=m.elapsed;if(m.phase>=3&&m.phase<5)m.phase=5;m.squadWater=(m.squadWater??0)+amount;},
  relay:sq=>{const v=sq.supply?.v;if(v&&Math.hypot(truck.x-v.x,truck.z-v.z)<80){if(!m.relaySquad){m.relaySquad=sq.name;m.times.supply??=m.elapsed;squadNote(sq,`${sq.name}經消防栓中繼供水給中隊長的水箱車`);}return {x:truck.x,z:truck.z};}m.relaySquad=null;return null;},
  pickFloor:(task)=>pickFloor(task,{fireFloor:F,floors:m.indoor.floors,burning:{[F]:m.intensity,[F+1]:m.upper?.intensity??0,[F-1]:m.lower?.intensity??0},assigned:squadKit.squads.filter(s=>s.floor!=null).map(s=>({task:s.task,floor:s.floor}))}),
  enterIndoor:(sq,task,floor)=>{const ranks=squadKit.attackers(sq).map(p=>p.rank);indoor.addTeam({id:sq.i,name:sq.name,task,floor,ranks,onDone:()=>{squadKit.returnFromIndoor(sq,m.entry);squadNote(sq,`${sq.name}已撤出建物、回車旁待命`);renderSquads();}});renderSquads();},
  recallIndoor:sq=>indoor.recallTeam(sq.i)};}
function updateSquads(dt){if(!mission)return;squadKit.update(dt,squadCtx(dt));updateTanker(dt);updateSurveyCar(dt);if(!$('squadPanel').hidden&&Math.floor(mission.elapsed*2)!==Math.floor((mission.elapsed-dt)*2))renderSquads();}
function updateTanker(dt){const m=mission;if(!tankerKit||!m)return;
 const moved=tankerKit.update(dt,{t:clock.getElapsed?.()??m.elapsed,now:m.elapsed,truck:{x:truck.x,z:truck.z,water:m.water,capacity:WATER.tank},
  blockers:()=>[...truckCircles(),...life.circles(),...squadKit.circles(),...(surveyKit?.circles()??[]),[state.x,state.z,.5]],
  onArrive:()=>{squadNote(null,`${TANKER.label}抵達現場，待命供水（距中隊長水箱車 ${TANKER.range} m 內自動鋪設水帶）`);renderSquads();},note:t=>squadNote(null,t)});
 if(moved>0){m.water=Math.min(WATER.tank,m.water+moved);m.times.supply??=m.elapsed;}}
function updateSurveyCar(dt){const m=mission;if(!surveyKit||!m)return;
 surveyKit.update(dt,{t:clock.getElapsed?.()??m.elapsed,now:m.elapsed,
  blockers:()=>[...truckCircles(),...life.circles(),...squadKit.circles(),...(tankerKit?.circles()??[]),[state.x,state.z,.5]],
  onArrive:()=>{squadNote(null,`${SURVEY_CAR.label}抵達現場，設立指揮據點`);renderSquads();},note:t=>squadNote(null,t)});}
const SQUAD_TASK={home:'未出勤',enroute:'出勤中',standby:'待命',ext:'外部射水',supply:'消防栓供水',attack:'室內進攻',search:'室內搜索',withdraw:'撤離至車旁'};
function renderSquads(){if(!mission){$('squadRows').innerHTML='<p class="note">按 T 派遣火警後分隊才會出勤。</p>';return;}
 $('squadRows').innerHTML=squadKit.squads.map(sq=>{const v=sq.vehicles,eta=sq.arrived==null?(v.some(x=>x.state==='driving')?`行駛中（剩約 ${Math.round(Math.max(...v.filter(x=>x.state==='driving').map(x=>(x.len-x.s)/SQUAD.speed)))} 秒）`:v.some(x=>x.state==='wait')?(sq.i===0?'等中隊長出發':`出勤準備（${Math.max(0,Math.round(Math.max(...v.map(x=>x.delay??0))))} 秒）`):''):`到場 ${fmt(sq.arrived)}`;
  const water=v.filter(x=>x.state!=='player').map(x=>Math.round(x.water)).join('／');
  return `<div class="squad-row" style="--c:${sq.color}"><div><b>${sq.name}</b>（${sq.people.length} 人・2 部水箱車）<small>${SQUAD_TASK[sq.task]??sq.task}${sq.floor?`・${sq.floor} 樓`:''}・${eta}・水箱 ${water} L</small></div>
   <div class="squad-actions">${[['standby','待命'],['ext','外部射水'],['supply','供水'],['attack','室內進攻'],['search','室內搜索'],['withdraw','撤離']].map(([k,l])=>`<button data-sq="${sq.i}" data-task="${k}"${sq.arrived==null?' disabled':''}${sq.task===k?' class="on"':''}>${l}</button>`).join('')}</div></div>`;}).join('')+surveyRow()+tankerRow();
 for(const b of $('squadRows').querySelectorAll('button'))b.onclick=()=>{const sq=squadKit.squads[+b.dataset.sq];if(squadKit.order(sq,b.dataset.task,squadCtx(0))){squadNote(sq,`${sq.name}：${SQUAD_TASK[b.dataset.task]}${sq.floor?`（${sq.floor} 樓）`:''}`);}renderSquads();};}
function surveyRow(){const k=surveyKit;if(!k)return '';const v=k.vehicle,st={home:'未出勤',wait:`出勤準備（${Math.max(0,Math.round(v.delay))} 秒）`,driving:`行駛中（剩約 ${Math.round(Math.max(0,v.len-v.s)/SURVEY_CAR.speed)} 秒）`,parked:'現場指揮據點'}[v.state]??v.state;
 return `<div class="squad-row" style="--c:#ffd27a"><div><b>${SURVEY_CAR.label}</b>（Outlander 勤務車）<small>${st}${v.arrived!=null?`・到場 ${fmt(v.arrived)}`:''}</small></div></div>`;}
function tankerRow(){const k=tankerKit;if(!k)return '';const v=k.vehicle,st={home:'未出勤',wait:`出勤準備（${Math.max(0,Math.round(v.delay))} 秒）`,driving:`行駛中（剩約 ${Math.round(Math.max(0,v.len-v.s)/TANKER.speed)} 秒）`,parked:v.supplying?'供水中':'待命供水'}[v.state]??v.state;
 return `<div class="squad-row" style="--c:#ff7b72"><div><b>${TANKER.label}</b>（12 噸水庫車）<small>${st}${v.arrived!=null?`・到場 ${fmt(v.arrived)}`:''}・水箱 ${Math.round(v.water).toLocaleString()} L</small></div></div>`;}
function openSquads(){for(const x of document.querySelectorAll('[data-squad-size]'))x.classList.toggle('on',+x.dataset.squadSize===(settings.squadSize??5));renderSquads();$('squadPanel').hidden=false;state.keys.clear();}
function closeSquads(){$('squadPanel').hidden=true;}
$('squadClose').onclick=()=>closeSquads();$('squadBtn').onclick=()=>openSquads();$('tSquad').onclick=()=>openSquads();
for(const el of document.querySelectorAll('[data-squad-size]'))el.onclick=()=>{settings.squadSize=+el.dataset.squadSize;saveSettings();squadKit.setSize(settings.squadSize);if(!mission)squadKit.build(SQUAD.count);for(const x of document.querySelectorAll('[data-squad-size]'))x.classList.toggle('on',+x.dataset.squadSize===settings.squadSize);flashHint(`每分隊 ${settings.squadSize} 人（下一次派遣生效）`);};
function updateMission(dt,t){
 if(!mission){fireFx.update(dt,0);return;}
 const m=mission,site=m.site;
 if(m.victim?.state==='waiting'&&m.victim.condition==='well'){const a=m.victim.figure.arms;a[0].rotation.z=-2.6-Math.sin(t*6)*.35;a[1].rotation.z=2.6+Math.sin(t*6+1)*.35;}else if(m.victim){m.victim.figure.arms.forEach(a=>a.rotation.z=0);}
 if(m.victim&&m.victim.state!==m.victimShown){m.victimShown=m.victim.state;renderVictim();}
if(m.phase<6||m.reportPending){m.elapsed+=dt;$('missionClock').textContent=fmt(m.elapsed);
  for(const f of fireList())if(f.intensity>0&&f!==m.hitFire&&m.phase<6)f.intensity=Math.min(f===m.fireMain?Math.max(indoor.cap,Math.min(f.intensity,1)):1,f.intensity+RULES.growth*dt);}
 // 室內環境（示意）：起火房間通風受限時火勢上限較低（未燃氣體累積）；氣體冷卻來自上一幀的水霧。
 if(m.phase<6||m.reportPending){indoor.step(dt,{fires:{[site.floor]:m.phase<6?m.intensity:0,[site.floor+1]:m.phase<6&&m.upper?m.upper.intensity:0,[site.floor-1]:m.phase<6&&m.lower?m.lower.intensity:0},cooling:m.cooling});m.cooling=null;if(m.intensity>indoor.cap&&m.phase<6&&!m.times.flashover)m.intensity=Math.max(indoor.cap,m.intensity-.01*dt);}
 // 延燒到下一樓（示意，部分派遣）：起火層火勢持續偏高後，掉落物或樓板延燒引燃下一層同一位置。
 if(m.phase<6&&m.lowerPlanned&&!m.lower){if(m.intensity>=LOWER.threshold)m.lowerTimer=(m.lowerTimer??0)+dt;if(m.lowerTimer>=LOWER.after){const lo=lowerSite(site);m.lower={site:lo,intensity:LOWER.start};lowerFx.setSite(lo);indoor.igniteLevel(lo.floor);m.times.lower=m.elapsed;flashHint(`⚠ 火勢向下延燒至 ${lo.floor} 樓（掉落物引燃，示意）`);showNotice(`火勢向下延燒至 ${lo.floor} 樓（示意）`,5000);}}
 // 延燒到上一樓（示意）
 if(m.phase<6&&!m.upper){const r=stepSpread(m.fireMain,dt,m.spreadTimer??0,{buildingTop:site.base+site.height});m.spreadTimer=r.timer;
  if(r.spread){const up=upperSite(site);m.upper={site:up,intensity:.4};upperFx.setSite(up);indoor.igniteUpper();m.times.spread=m.elapsed;flashHint(`⚠ 火勢延燒至 ${up.floor} 樓！`);showNotice(`火勢延燒至 ${up.floor} 樓（同一立面上一層）`,5000);}}
 const truckDist=Math.hypot(truck.x-site.x,truck.z-site.z);
 if(m.phase===0&&state.mode==='drive'){m.phase=1;m.times.depart=m.elapsed;}
 if(m.phase===1&&truckDist<RULES.arriveRadius){m.phase=2;m.times.arrive=m.elapsed;flashHint('已抵達：於起火面外側 8–30 m 停車，停妥後按 E 下車');}
 if(m.phase===2){m.parking=evaluateParking(truck,site,colliders,{speed:truck.v});
  // 停車位置為參考（記錄在任務紀錄，不擋後續作業）：下車即可佈線、進入建物、指揮分隊。
  if(state.mode==='walk'){m.phase=3;m.times.parked=m.elapsed;m.parkDist=m.parking.dist;m.parkIssues=m.parking.ok?[]:m.parking.issues;clearWaypoint();flashHint(m.parking.ok?'停車位置符合建議；在消防車旁按 F 佈設水線、按 B 指揮分隊':`停車位置參考：${m.parking.issues.join('、')}（已記錄，不影響作業）；在消防車旁按 F 佈設水線`);}
  else if(Math.abs(truck.v)<.4)flashHint(m.parking.ok?'位置符合建議，按 E 下車':'停車位置參考：'+m.parking.issues.join('、')+'（可直接按 E 下車）');}
 // 水線長度限制：人員不可超過水線長度。
 if(m.hose&&state.mode==='walk'){const dx=state.x-truck.x,dz=state.z-truck.z,d=Math.hypot(dx,dz);if(d>RULES.hoseLength){state.x=truck.x+dx/d*RULES.hoseLength;state.z=truck.z+dz/d*RULES.hoseLength;}}
 const wantSpray=(state.mode==='walk'&&m.hose||state.mode==='interior'&&indoor.me.hoseIn)&&(state.keys.has(' ')||state.touchSpray||state.pad.held.spray)&&!state.paused;m.hitFire=null;
 // 水箱與空氣：水箱空或空氣用盡時不能射水。
 const w=stepWater(m.water,dt,{spraying:wantSpray&&m.water>0&&state.air>0,mode:state.nozzle,supplied:m.supply?.connected||!!m.relaySquad});m.water=w.water;
 m.spraying=wantSpray&&m.water>0&&state.air>0;
 if(wantSpray&&m.water<=0)flashHint('水箱已空：走到消防車旁按 G 拉供水水帶，再到消防栓按 G 連接');else if(wantSpray&&state.air<=0)flashHint('空氣用盡：立即撤離火點 25 m 外，到消防車旁更換氣瓶');
 let spray=null;const fireWin=indoor.fireWindow(),winClosed=fireWin?.state==='closed';
 // 隊員射水（示意：隊員自同一水源架設第二條水線，用水量計入水箱）。
 {for(const c of indoor.takeCrewSprays()){const tf=fireOfLevel(c.lv);if(!tf||m.phase>=6)continue;
   if(m.water<=0){flashHint('水箱已空：隊員無法射水');continue;}m.water=Math.max(0,m.water-NOZZLE.stream.flow*dt);if(m.times.water===undefined)m.times.water=m.elapsed;if(m.phase<5&&m.phase>=3)m.phase=5;tf.intensity=Math.max(0,tf.intensity-NOZZLE.stream.knockdown*.8*dt);if(!m.hitFire)m.hitFire=tf;m.indoor.crewSpray=(m.indoor.crewSpray??0)+dt;}}
 // 室內射水：直線水柱直接打火點；水霧打入上層熱煙（或微開門後的空間）做氣體冷卻。
 if(state.mode==='interior'){const r=indoor.spray(dt,state.nozzle,m.spraying,state.yaw,fpPitch());if(m.spraying){m.cooling=r.cooling;
   const tf=fireOfLevel(r.lv);
   if(r.hit&&tf&&m.phase<6){if(m.times.water===undefined)m.times.water=m.elapsed;if(m.phase>=3&&m.phase<5)m.phase=5;tf.intensity=Math.max(0,tf.intensity-NOZZLE[state.nozzle].knockdown*1.3*dt);m.hitFire=tf;flashHint(`室內直接射水命中 ${r.lv} 樓火點（${NOZZLE[state.nozzle].label}）`);}
   else if(m.phase<6&&!r.burning)flashHint(r.cooling?`${NOZZLE[state.nozzle].label}冷卻上層熱煙（示意）`:'此處沒有燃燒中的火點');
   else if(m.phase<6)flashHint((fpPitch()>.12&&r.cooling?`${NOZZLE[state.nozzle].label}冷卻上層熱煙（示意）；`:'')+(r.blocked?'火點被牆或門擋住：進到門口再對準火光':r.dist>r.reach?`距火點 ${r.dist.toFixed(1)} m，${NOZZLE[state.nozzle].label}室內射程約 ${r.reach} m`:r.inCone?'':'對準火光方向'));}}
 else if(m.spraying){state.facing=state.yaw;person.arms[1].rotation.x=-1.35;person.arms[0].rotation.x=-1.1;
  const N=NOZZLE[state.nozzle],py=ground.at(state.x,state.z)+1.2,r=sprayTarget({x:state.x,z:state.z,y:py},state.yaw,fireList(),state.nozzle),aimY=r?.fire.site.y??site.y,range=Math.min(Math.max(r?.dist??N.reach,4),N.reach),dir=new T.Vector3(-Math.sin(state.yaw),0,-Math.cos(state.yaw));
  const origin=new T.Vector3(state.x+dir.x*.6,py,state.z+dir.z*.6);
  spray={origin,dir:new T.Vector3(-Math.sin(state.yaw),(aimY-origin.y)/range,-Math.cos(state.yaw)).normalize(),range,mode:state.nozzle};
  if(r?.hit&&m.phase<6&&r.fire===m.fireMain&&winClosed){m.indoor.windowHit+=dt;flashHint('水柱打在起火房間未破的窗戶上（窗內為通風受限火災）');if(m.indoor.windowHit>1.5){const out=indoor.breakWindow(fireWin.id);flashHint(out==='backdraft'?'⚠ 窗戶破裂瞬間發生回燃（火球噴出窗外，示意）':'窗戶已破，水可進入起火房間');}}
  else if(r?.hit&&m.phase<6){if(m.times.water===undefined)m.times.water=m.elapsed;r.fire.intensity=Math.max(0,r.fire.intensity-N.knockdown*dt);m.hitFire=r.fire;flashHint(`命中${r.fire.site.upper?` ${r.fire.site.floor} 樓`:''}火點（${N.label}），持續射水`);}
  else if(m.phase>=6)flashHint('火勢已控制，可按 F 收回水線');
  else flashHint(!r?'沒有燃燒中的火點':r.dist>N.reach?`距火點 ${Math.round(r.dist)} m，${N.label}射程 ${N.reach} m，請靠近${state.nozzle==='fog'?'或按 V 切換直線水柱':''}`:`調整鏡頭方向對準火點${state.nozzle==='stream'?'（近距離可按 V 切換水霧）':''}`);}
 // 雲梯籃架出水（大水霧）：同樣計入射水。
 let fogSpray=null;
 if(aerial?.state.spraying&&m.phase<6){const af=activeFire(),n=aerial.nozzle(),fp=firePoint(af.site);fogSpray={origin:n.origin,dir:n.dir,range:n.origin.distanceTo(fp)};
  if(fogSpray.range<RULES.reach+6&&af===m.fireMain&&winClosed){m.indoor.windowHit+=dt;if(m.indoor.windowHit>1.5)indoor.breakWindow(fireWin.id);}
  else if(fogSpray.range<RULES.reach+6){if(m.times.water===undefined)m.times.water=m.elapsed;af.intensity=Math.max(0,af.intensity-RULES.knockdown*dt);if(af!==m.hitFire)m.hitFire=m.hitFire??af;if(m.phase<5){m.phase=5;}}}
 if(spray?.mode==='fog'&&!fogSpray){fogSpray=spray;spray=null;}
 if(m.phase===4&&m.times.water!==undefined){m.phase=5;}
 if(m.phase===5&&allOut(fireList())){m.phase=6;m.intensity=0;m.times.done=m.elapsed;fireFx.setSite(null);upperFx.setSite(null);lowerFx.setSite(null);if(m.mci&&!mciComplete(m.mci.patients)){m.reportPending=true;flashHint('火勢已控制；仍有傷患待檢傷或後送，完成後顯示任務紀錄');}else showReport();}
 updateMci(dt);updateDeterioration();updateSupply(dt);renderOps();updateSquads(dt);if(state.mode!=='interior')indoor.background(dt);if(Math.floor(t*2)!==Math.floor((t-dt)*2))renderIndoorLine();
 $('tHose').hidden=!(m.phase>=3&&state.mode==='walk');{const w=state.mode==='walk';$('tAerial').hidden=!(w&&m.phase<6);$('tSupply').hidden=!(w&&m.phase>=3);$('tNozzle').hidden=!((w&&m.hose)||(state.mode==='interior'&&indoor.me.hoseIn));$('tEquip').hidden=!(w&&nearTruck());$('tSquad').hidden=!w;$('tTriage').hidden=!(w&&triageCandidates().some(p=>Math.hypot(state.x-patientPos(p).x,state.z-patientPos(p).z)<=5));}$('tSpray').hidden=!(state.mode==='walk'&&m.hose||state.mode==='interior'&&indoor.me.hoseIn);
 const handPos=new T.Vector3(state.x,ground.at(state.x,state.z)+1,state.z),truckPos=new T.Vector3(truck.x,ground.at(truck.x,truck.z)+1,truck.z);
 entryMark.visible=m.phase>=3&&m.phase<6;
 fireFx.update(dt,m.phase<6?(winClosed?Math.min(m.intensity,.12):m.intensity):0,{spray,hoseFrom:m.hose?truckPos:null,hoseTo:m.hose?handPos:null,fogSpray});
 if(m.upper)upperFx.update(dt,m.phase<6?m.upper.intensity:0);
 if(m.lower)lowerFx.update(dt,m.phase<6?m.lower.intensity:0);
 if(m.lower&&m.lower.intensity<=0&&!m.times.lowerOut){m.times.lowerOut=m.elapsed;lowerFx.setSite(null);flashHint(`${m.lower.site.floor} 樓火點已撲滅`);}
 if(m.upper&&m.upper.intensity<=0&&!m.times.upperOut){m.times.upperOut=m.elapsed;upperFx.setSite(null);flashHint(`${m.upper.site.floor} 樓火點已撲滅`);}
 if(m.intensity<=0&&m.fireMainOut!==true&&m.upper?.intensity>0){m.fireMainOut=true;fireFx.setSite(null);flashHint(`${site.floor} 樓火點已撲滅，仍有 ${m.upper.site.floor} 樓火點`);}
 if(Math.floor(t*4)!==Math.floor((t-dt)*4))renderMission();
}
// 任務紀錄下載（JSON，供教官講評與存檔）：時間、停車、雲梯、受困者與檢傷、大量傷患後送與參考比對。資料只在本機產生。
function missionRecord(){const m=mission;if(!m)return null;const V=v=>v&&{id:v.id??null,sex:v.sex,condition:v.condition,weightEstimate:v.weight,vitals:v.vitals,mechanisms:v.vitals?.mechanisms?.map(k=>MECHANISMS[k]),state:v.state,
  deteriorated:v.deteriorated??null,triageHistory:(v.triageHistory??[]).map(t=>({tag:t.tag,startReference:t.start.tag,atSeconds:Math.round(t.time)})),triage:v.triage&&{tag:v.triage.tag,startReference:v.triage.start.tag,startSteps:v.triage.start.steps,aid:v.triage.aid.map(id=>FIRST_AID.find(f=>f.id===id).label),aidReference:v.triage.reference.map(r=>({action:FIRST_AID.find(f=>f.id===r.id).label,why:r.why})),atSeconds:Math.round(v.triage.time)},hospital:v.hospital??null};
 const mci=m.mci&&{patients:m.mci.patients.map(V),order:m.mci.order,departures:m.mci.departures.map(d=>({ambulance:d.no,atSeconds:Math.round(d.time),hospital:HOSPITALS.find(h=>h.id===d.hospital).name,patients:d.patients})),reference:transportReference(m.mci.patients,m.mci.departures).notes.map(n=>n.text)};
 const a=aerial?.state;
 return {format:'xinyi-street-mission-v1',savedAt:new Date().toISOString(),note:'訓練示意紀錄：火勢、生命徵象、救護車與醫院皆為示意；不評分，請依單位標準講評。',
  site:{street:m.site.street,floor:m.site.floor,buildingId:m.site.buildingId,fromGis:!!m.site.fromGis,lonLat:unproject(m.site.x,m.site.z)},seconds:Object.fromEntries(Object.entries(m.times).map(([k,v])=>[k,Math.round(v*10)/10])),
  parkingDistance:m.parkDist??null,aerial:a&&a.result?{distanceToFacade:+a.result.dist.toFixed(1),standoff:a.standoff,stretcher:!!a.result.stretcher,load:a.result.load?{totalKg:a.result.load.total,capacityKg:a.result.load.capacity,parts:a.result.load.parts}:null}:null,
  ops:{waterLeftL:Math.round(m.water),supplyConnectedAt:m.times.supply??null,airSwaps:m.airSwaps??0,spreadAt:m.times.spread??null,lowerSpreadAt:m.times.lower??null,lowerOutAt:m.times.lowerOut??null,upperFloorOutAt:m.times.upperOut??null},
  indoor:m.indoor&&indoor.plan?{note:'室內為示意平面（非建物實際格局），溫度、煙、含氧量為示意值',floor:m.site.floor,ventilationLimited:m.indoor.closed,items:Object.keys(m.indoor.items??{}).map(k=>EQUIPMENT[k].label),entries:m.indoor.entries.map(e=>({atSeconds:Math.round(e.time),hose:e.hose})),
   forcedDoors:m.indoor.forced??0,ventOpenings:m.indoor.vents??0,forcedExit:m.indoor.forcedExit??0,maxHeatExposure:Math.round(indoor.me.maxExposure),events:(m.indoor.events??[]).filter(e=>!['enter','exit'].includes(e.kind)).map(e=>({atSeconds:Math.round(e.time),kind:e.kind,text:e.text})),
   floorsModeled:m.indoor.floors,floorsVisited:[...indoor.me.visited],reachedFireFloorAt:m.times.fireFloor!==undefined?Math.round(m.times.fireFloor):null,standpipeConnections:m.indoor.standpipe??0,crewSpraySeconds:Math.round(m.indoor.crewSpray??0),
   victims:indoor.victims().map(v=>({id:v.id,floor:v.floor,condition:v.condition,room:indoor.levels.get(v.floor).plan.spaces.find(s=>s.id===v.space).name,state:v.state})),rescued:m.indoor.rescued.map(V)}:null,
  surveyCar:surveyKit?{name:SURVEY_CAR.label,arrivedAt:surveyKit.vehicle.arrived!=null?Math.round(surveyKit.vehicle.arrived):null,log:surveyKit.vehicle.log.map(l=>({atSeconds:Math.round(l.t),text:l.text}))}:null,
  tanker:tankerKit?{name:TANKER.label,capacityL:TANKER.capacity,waterLeftL:Math.round(tankerKit.water),arrivedAt:tankerKit.vehicle.arrived!=null?Math.round(tankerKit.vehicle.arrived):null,log:tankerKit.vehicle.log.map(l=>({atSeconds:Math.round(l.t),text:l.text}))}:null,
  squads:squadKit.squads.map(sq=>({name:sq.name,people:sq.people.map(p=>p.rank),arrivedAt:sq.arrived!=null?Math.round(sq.arrived):null,task:sq.task,floor:sq.floor,log:sq.log.map(l=>({atSeconds:Math.round(l.t),text:l.text}))})),parkingIssues:m.parkIssues??[],
  victim:V(m.victim),massCasualty:mci||null};}
function downloadRecord(){const r=missionRecord();if(!r)return;const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`信義街景任務紀錄-${new Date().toISOString().slice(0,16).replace(/[:T]/g,'')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('reportDownload').onclick=()=>downloadRecord();
function indoorReportRows(row){const m=mission,I=m.indoor,T0=m.times,P=indoor.plan;if(!P)return '';const ev=k=>(I.events??[]).filter(e=>e.kind===k);
 return row('室內進入（示意平面）',T0.entry!==undefined?`${fmt(T0.entry)}・進入 ${I.entries.length} 次`+(T0.fireFloor!==undefined?`・${fmt(T0.fireFloor)} 到達 ${m.site.floor} 樓`:'')+(I.closed?'・起火房間通風受限':''):'未進入')+(I.standpipe||I.crewSpray?row('送水口接線／隊員射水',`${I.standpipe??0} 次／${Math.round(I.crewSpray??0)} 秒`):'')+row('破壞進入／通風開口',`${I.forced??0} 扇門／${I.vents??0} 處`)+
  row('室內受困者',`${I.rescued.length}／${I.victims} 人救出`+(I.rescued.length?'（'+I.rescued.map(p=>`${p.id}${p.floor?`（${p.floor} 樓）`:''} ${fmt(p.rescuedAt)}`).join('、')+'）':''))+
  (T0.rollover!==undefined||T0.flashover!==undefined||T0.backdraft!==undefined?row('滾燃／閃燃／回燃（示意門檻）',[T0.rollover,T0.flashover,T0.backdraft].map(t=>t!==undefined?fmt(t):'—').join('／')):'')+
  (ev('backdraftSign').length?row('回燃徵兆',ev('backdraftSign').length+' 次；'+(ev('backdraftAvoided').length?`${ev('backdraftAvoided').length} 次關門或冷卻解除`:'未解除')):'')+
  row('最高熱暴露（示意 0–100）',Math.round(indoor.me.maxExposure)+((I.forcedExit??0)?`・緊急撤出 ${I.forcedExit} 次`:''));}
function showReport(){
 const m=mission;m.reportPending=false;const T0=m.times,row=(a,b)=>`<tr><td>${a}</td><td>${b}</td></tr>`,span=(a,b)=>a!==undefined&&b!==undefined?fmt(b-a):'—';
 $('reportBody').innerHTML='<table>'+row('派遣地點',`${m.site.street||'信義區'}・${m.site.floor} 樓（示意）`)+row('派遣 → 上車出發',span(0,T0.depart))+row('出發 → 抵達',span(T0.depart,T0.arrive))+row('抵達 → 停妥下車',span(T0.arrive,T0.parked))+row('停妥 → 佈設水線',span(T0.parked,T0.hose))+row('佈線 → 開始射水',span(T0.hose,T0.water))+row('射水 → 火勢控制',span(T0.water,T0.done))+(T0.aerialStart!==undefined?row('雲梯：配置 → 籃架到位',span(T0.aerialStart,T0.aerialReady)):'')+(m.victim?.triage?row('檢傷（你的分類／START 參考）',TAGS[m.victim.triage.tag].label.split('（')[0]+'／'+TAGS[m.victim.triage.start.tag].label.split('（')[0])+row('急救處置',m.victim.triage.aid.map(id=>FIRST_AID.find(f=>f.id===id).label).join('、')||'未記錄'):(m.victim?.state==='rescued'?row('檢傷與處置','未記錄'):''))+row('受困者（'+(m.victim?`${m.victim.sex==='male'?'男':'女'}・${CONDITION_LABEL[m.victim.condition]}`:'—')+'）',T0.rescued!==undefined?'派遣後 '+fmt(T0.rescued)+(m.victim?.stretcher?' 以擔架救出':' 救出'):'未救出')+row('總時間',fmt(T0.done))+row('停車距起火面',m.parkDist?m.parkDist.toFixed(1)+' m':'—')+(T0.lower!==undefined?row('向下延燒至下一樓（示意）',fmt(T0.lower)+(T0.lowerOut!==undefined?`；${fmt(T0.lowerOut)} 撲滅`:'')):'')+(T0.spread!==undefined?row('延燒至上一樓',fmt(T0.spread)+(T0.upperOut!==undefined?`；${fmt(T0.upperOut)} 撲滅`:'')):'')+(m.indoor?indoorReportRows(row):'')+(m.squadLog?row('分隊',squadKit.squads.map(sq=>`${sq.name} ${sq.arrived!=null?'到場 '+fmt(sq.arrived):'未到場'}`).join('；')):'')+(m.parkIssues?.length?row('停車位置（參考）',m.parkIssues.join('、')):'')+row('消防栓供水連接',T0.supply!==undefined?fmt(T0.supply):'未連接')+row('水箱剩餘／更換氣瓶',`${Math.round(m.water)} L／${m.airSwaps??0} 次`)+mciReportRows(row)+'</table>';
 $('missionReport').hidden=false;$('missionTitle').textContent='火勢已控制';flashHint('任務完成，可按 F 收回水線');renderMission();
}
// ---------- 雲梯車作業（訓練示意） ----------
// 第一次使用才下載車型（約 7 MB）。中隊長站在預定車輛中心位置，車身自動與起火面平行、右側面向建物（順向）。
// 預覽只核對作業距離；按確認後再以真實量體核對升梯路徑。車輛直接到位，未模擬行駛。
let aerial=null,aerialLoading=null,aerialMode=null,aerialPreview=null,aerialTimer=0;
aerialActive=()=>!!aerial&&(aerial.state.stationed||aerial.state.phase!=='idle');
const firePoint=site=>new T.Vector3(site.x-site.nx*.5,site.y,site.z-site.nz*.5);
const previewGroup=new T.Group();previewGroup.visible=false;scene.add(previewGroup);
const previewMat=[new T.MeshBasicMaterial({color:'#36d17a',transparent:true,opacity:.45,depthWrite:false,side:T.DoubleSide}),new T.MeshBasicMaterial({color:'#ff4d4d',transparent:true,opacity:.45,depthWrite:false,side:T.DoubleSide})];
const previewQuads=[...Array(5)].map(()=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(12),3));g.setIndex([0,1,2,0,2,3]);const m=new T.Mesh(g,previewMat[0]);m.renderOrder=3;m.frustumCulled=false;previewGroup.add(m);return m;});
const windowMark=new T.Mesh(new T.TorusGeometry(.8,.08,8,32),new T.MeshBasicMaterial({color:'#38bdf8',depthTest:false}));windowMark.renderOrder=4;previewGroup.add(windowMark);
function loadAerial(){
 if(aerial)return Promise.resolve(aerial);
 aerialLoading??=new GLTFLoader().loadAsync('assets/aerial-ladder.glb').then(gltf=>aerial=createXinyiAerial({scene,source:gltf.scene,createPerson:actionKit.createPerson,ground,obstacleIndex:buildObstacleIndex(district.buildings),crewMembers:stationTeam.people.slice(1,3).map(p=>p.person),onCrewAssign:stationTeam.assignAerial,onCrewReturn:stationTeam.returnAerial})).catch(e=>{aerialLoading=null;throw e;});
 return aerialLoading;
}
loadAerial().then(a=>{a.park(spawn.aerial);gis?.hide('aerial');syncAerialUi();}).catch(e=>showNotice('分隊雲梯車載入失敗，可按 L 重試：'+e.message,10000));
function setAerialMode(mode){aerialMode=mode;previewGroup.visible=mode==='preview';aerialPreview=null;aerialTimer=0;syncAerialUi();}
function aerialSite(){return mission&&mission.phase<6?mission.site:null;}
async function aerialAction(){
 const site=aerialSite();
 if(!site){flashHint(mission?'火勢已控制，不需再配置雲梯':'雲梯作業需先派遣火警（T）');return;}
 if(state.mode!=='walk'){flashHint('請下車，站在預定的雲梯車中心位置再按 L');return;}
 if(aerial?.state.phase==='ground'){const r=aerial.raiseToFire(currentLoad(false));flashHint(r.ok?`升梯前往起火窗口（籃架距外牆 ${r.standoff} m）出水`:'無法升梯出水：'+r.reason+'；可按「收梯」');syncAerialUi();return;}
 if(aerial?.canRetract()){if(aerial.retract())flashHint('收梯中：收回梯架，人員下車，再收支腿');syncAerialUi();return;}
 if(aerial&&!['idle','parked'].includes(aerial.state.phase))return;
 if(aerialMode!=='preview'){
  if(!aerial){$('aerialStatus').textContent='載入雲梯車型…';try{await loadAerial();}catch(e){flashHint('雲梯車型無法載入：'+e.message);syncAerialUi();return;}}
  setAerialMode('preview');flashHint('走到預定的雲梯車中心位置（車身會與起火面平行），綠色表示作業距離符合，再按 L 確認');return;
 }
 // 有受困者待救時先救人（籃架到受困者窗口），否則到起火窗口出水。
 const victim=mission.victim?.state==='waiting'?mission.victim:null;
 const r=aerial.check(site,state.x,state.z,{engine:truck,vehicles:gisVehicles(),features:streets.features,window:victim?{x:victim.x,z:victim.z}:undefined,stretcher:!!victim?.stretcher,load:currentLoad(!!victim)});
 if(!r.ok){flashHint('無法在此配置：'+r.issues.join('、'));return;}
 aerial.deploy(r,site,{task:victim?'rescue':'fire',victim});setAerialMode(null);gis?.hide('aerial');
 mission.times.aerialStart=mission.elapsed;
 // 中隊長移到車尾外側，避免與車身重疊。
 const [ox,oz]=fromFrameXZ(r.frame,8,3.2),p=colliders.resolve(ox,oz,.4);state.x=p.x;state.z=p.z;
 flashHint(`雲梯車到位（距外牆 ${r.dist.toFixed(1)} m、籃架距窗口外 ${r.standoff} m）：支腿展開→人員登車→升梯`+(victim?'→救出受困者':'→出水')+(r.warnings.length?'。注意：'+r.warnings.join('、'):''));
 syncAerialUi();
}
function syncAerialUi(){
 renderLoad();
 const ph=aerial?.state.phase??'idle',btn=$('aerialBtn'),cancel=$('aerialCancel');
 $('aerialStatus').textContent=aerialMode==='preview'?'選擇車位中':(aerial?.state.blocked?'動作已停止':{idle:aerial?.state.stationed?'信義分隊庫位待命':'未配置',deploying:'支腿展開・登車・升梯中',rescue:aerial?.state.stretcher?'籃架到位・將傷患移上擔架':'籃架到位・協助受困者進籃',lowering:'載人緩慢下降',unloading:aerial?.state.stretcher?'卸下擔架・交接':'引導受困者離籃',ground:'籃架在地面・受困者已救出',raising:'升梯前往起火窗口',ready:'籃架到位・出水',retracting:'收梯中',parked:'已收梯'}[ph]);
 const retractable=!!aerial?.canRetract();
 btn.textContent=aerialMode==='preview'?'確認車位（L）':ph==='ground'?'升梯出水（L）':retractable?'收梯（L）':ph==='parked'?'重新配置（L）':ph==='idle'?'配置雲梯（L）':'作業中';
 btn.disabled=aerialMode!=='preview'&&!['idle','parked','ground'].includes(ph)&&!retractable;
 cancel.hidden=!(aerialMode==='preview'||ph==='parked'||ph==='ground');cancel.textContent=aerialMode==='preview'?'取消':ph==='ground'?'收梯':'撤離';
}
function updateAerial(dt){
 if(aerialMode==='preview'&&aerial){const site=aerialSite();if(!site){setAerialMode(null);return;}
  aerialTimer-=dt;if(aerialTimer<=0){aerialTimer=.2;const r=aerialPreview=aerial.preview(site,state.x,state.z,{engine:truck,features:streets.features});
   aerial.outline(r.frame).forEach((poly,i)=>{const a=previewQuads[i].geometry.attributes.position;poly.forEach(([x,z],k)=>a.setXYZ(k,x,ground.at(x,z)+.12,z));a.needsUpdate=true;previewQuads[i].material=previewMat[r.ok?0:1];});
   {const v=mission.victim?.state==='waiting'?mission.victim:null;windowMark.position.set((v?v.x:site.x)+site.nx*1,site.base+(site.floor-1)*3.4+1.2,(v?v.z:site.z)+site.nz*1);}windowMark.rotation.set(0,Math.atan2(site.nx,site.nz),0);
   flashHint((r.ok?'✓ 作業距離符合（按 L 核對升梯路徑）':'✗ '+r.issues.join('、'))+`・車身中心距外牆 ${r.dist.toFixed(1)} m`+(r.warnings.length?'・'+r.warnings.join('、'):''));}}
 if(!aerial)return;
 const site=mission?.site,e=aerial.update(dt,{fire:site?firePoint(site):null,fireActive:!!mission&&mission.phase<6});
 if(e?.blocked)flashHint('雲梯已停止：'+e.reason+'（按 L 收梯）');
 if(e?.arrived){if(mission&&mission.times.aerialReady===undefined)mission.times.aerialReady=mission.elapsed;flashHint(e.rescue?(aerial.state.stretcher?'籃架到位受困者窗口：開籃門，籃內隊員將傷患移上擔架並固定':'籃架到位受困者窗口：開籃門，協助受困者跨窗台進籃'):'籃架到位，砲塔對準起火點出水（大水霧）');}
 if(e?.aboard)flashHint(aerial.state.stretcher?'傷患已固定於籃架擔架、籃門關妥：載人緩慢下降到車外地面':'受困者已進籃、籃門關妥：載人緩慢下降到車外地面');
 if(e?.landed)flashHint(aerial.state.stretcher?'籃架落地：卸下擔架，隊員與擔架移到交接位置':'籃架落地：開籃門，引導受困者離籃');
 if(e?.rescued){if(mission){mission.times.rescued=mission.elapsed;if(mission.mci&&!mission.mci.patients.includes(mission.victim)){mission.victim.id='W1';mission.mci.patients.push(mission.victim);renderMci();}renderVictim();}flashHint('受困者已救出並交接（示意）；走到傷患旁按 K 檢傷與處置；按 L 升梯到起火窗口出水，或按「收梯」');}
 if(e?.collar)flashHint('頭頸部撞擊機轉：籃內隊員先為傷患上頸圈');
 if(e?.strapped)flashHint('傷患已以胸、腰、腿三條固定帶固定於擔架');
 if(e?.parked)flashHint('已收梯並收回支腿；可按 L 重新配置或「撤離」');
 if(e)syncAerialUi();
}
$('aerialBtn').onclick=()=>aerialAction();
$('aerialCancel').onclick=()=>{if(aerialMode==='preview'){setAerialMode(null);flashHint('已取消雲梯配置');}else if(aerial?.state.phase==='ground'){if(aerial.retract())flashHint('收梯中：收回梯架，人員下車，再收支腿');syncAerialUi();}else if(aerial?.dismiss()){aerial.park(spawn.aerial);gis?.hide('aerial');flashHint('雲梯車撤離回信義分隊（直接到位示意）');syncAerialUi();}};
$('missionBtn').onclick=()=>startMission();$('missionAbort').onclick=()=>{if(confirm('取消目前任務？'))endMission();};
$('reportAgain').onclick=()=>{endMission();startMission();};$('reportClose').onclick=()=>{$('missionReport').hidden=true;};
$('tHose').onclick=()=>toggleHose();
$('tSiren').addEventListener('click',()=>toggleSiren());$('tBrake').addEventListener('pointerdown',()=>{state.touchBrake=true;});for(const ev of ['pointerup','pointercancel','pointerleave'])$('tBrake').addEventListener(ev,()=>{state.touchBrake=false;});
$('tAerial').onclick=()=>aerialAction();$('tTriage').onclick=()=>openTriage();$('tSupply').onclick=()=>supplyAction();$('tNozzle').onclick=()=>toggleNozzle();$('tEquip').onclick=()=>openEquip();
// 手機：任務面板點一下展開／收合步驟（點面板內按鈕不切換）。
$('mission').addEventListener('click',e=>{if(TOUCH&&!e.target.closest('button'))$('mission').classList.toggle('open');});
$('menuReset').onclick=()=>{setPaused(false);resetAll();};
$('menuEoc').onclick=()=>{setPaused(false);goToLandmark('eoc');};
$('menuZhuangjing').disabled=!zhuangjing;
$('menuZhuangjing').onclick=()=>{setPaused(false);goToLandmark('zhuangjing');};
$('menuHq').onclick=()=>{setPaused(false);goToLandmark('hq');};
$('tSpray').addEventListener('pointerdown',()=>{state.touchSpray=true;});for(const ev of ['pointerup','pointercancel','pointerleave'])$('tSpray').addEventListener(ev,()=>{state.touchSpray=false;});
$('mapBtn').onclick=()=>openMap();$('mapClose').onclick=()=>closeMap();$('mapIn').onclick=()=>bigmap.zoom(1.3);$('mapOut').onclick=()=>bigmap.zoom(1/1.3);$('mapMe').onclick=()=>bigmap.center();
$('mapClear').onclick=()=>clearWaypoint();$('mapTruckWp').onclick=()=>setWaypoint(truck.x,truck.z,'消防車');
$('menuMap').onclick=()=>{setPaused(false);openMap();};
const minimapBudget=createFrameBudget(10);
function syncMinimapControls(metrics){
 const inside=state.mode==='interior',key=[inside,minimapZoom,state.mode,minimapDisplaySize,mini.width].join(':');if(key===minimapControlKey)return;minimapControlKey=key;
 $('miniZoomOut').disabled=inside||minimapZoom<=MINI_ZOOM_LEVELS[0];$('miniZoomIn').disabled=inside||minimapZoom>=MINI_ZOOM_LEVELS.at(-1);$('miniZoomReset').disabled=inside;
 $('miniZoomReset').textContent=Number(minimapZoom.toFixed(2))+'×';$('miniZoomReset').title='目前 '+minimapZoom+' 倍；點一下回復預設';
 $('minimapScale').hidden=inside;if(metrics){$('minimapScaleText').textContent=metrics.label;$('minimapScaleBar').style.width=metrics.barPixels+'px';$('minimapScale').setAttribute('aria-label','此線段代表 '+metrics.label);}
}
function changeMinimapZoom(value){if(state.mode==='interior')return;minimapZoom=miniZoom(value);settings.minimapZoom=minimapZoom;saveSettings();minimapControlKey='';syncMinimapControls(miniMapMetrics({mode:state.mode,zoom:minimapZoom,mapScale,canvasSize:mini.width,displaySize:minimapDisplaySize}));}
function drawMinimap(now){
 if(!minimapBudget.due(now,state.mode))return;
 if(state.mode==='interior'&&indoor.plan){syncMinimapControls(null);indoor.drawMap(mctx,mini.width);return;}
 const s=mini.width,metrics=miniMapMetrics({mode:state.mode,zoom:minimapZoom,mapScale,canvasSize:s,displaySize:minimapDisplaySize}),zoom=metrics.scale,ratio=metrics.pixelRatio,icon=ratio/zoom;syncMinimapControls(metrics);mctx.save();mctx.clearRect(0,0,s,s);mctx.beginPath();mctx.arc(s/2,s/2,s/2,0,Math.PI*2);mctx.clip();
 mctx.fillStyle='#1c252b';mctx.fillRect(0,0,s,s);mctx.translate(s/2,s/2);mctx.rotate(state.yaw);mctx.scale(zoom,zoom);
 const cx=MAP/2+state.camX*mapScale,cz=MAP/2+state.camZ*mapScale;mctx.drawImage(mapImg,-cx,-cz);
 const tx=(truck.x-state.camX)*mapScale,tz=(truck.z-state.camZ)*mapScale;
 if(state.mode==='walk'){mctx.fillStyle='#e8303a';mctx.fillRect(tx-6*icon,tz-6*icon,12*icon,12*icon);}
 for(const v of gis?.data?.vehicles??[]){if(v.unitId==='engine1'||v.unitId==='commander')continue;mctx.fillStyle=v.unitId==='aerial'?'#ffb34e':v.unitId==='ambulance'?'#f5f5f5':'#ff7a7a';const px=(v.x-state.camX)*mapScale,pz=(v.z-state.camZ)*mapScale;mctx.fillRect(px-5*icon,pz-5*icon,10*icon,10*icon);}
 if(state.route?.length>1){mctx.strokeStyle='rgba(255,211,107,.95)';mctx.lineWidth=3*icon;mctx.lineJoin=mctx.lineCap='round';mctx.beginPath();state.route.forEach(([x,z],i)=>{const px=(x-state.camX)*mapScale,pz=(z-state.camZ)*mapScale;i?mctx.lineTo(px,pz):mctx.moveTo(px,pz);});mctx.stroke();}
 for(const mk of mapMarkers()){const px=(mk.x-state.camX)*mapScale,pz=(mk.z-state.camZ)*mapScale;mctx.fillStyle=mk.color;mctx.strokeStyle='#111';mctx.lineWidth=2*icon;mctx.fillRect(px-7*icon,pz-7*icon,14*icon,14*icon);mctx.strokeRect(px-7*icon,pz-7*icon,14*icon,14*icon);}
 if(mission?.site&&mission.phase<6){const px=(mission.site.x-state.camX)*mapScale,pz=(mission.site.z-state.camZ)*mapScale;mctx.fillStyle='#ff3b2f';mctx.strokeStyle='#fff';mctx.lineWidth=2*icon;mctx.beginPath();mctx.arc(px,pz,10*icon,0,Math.PI*2);mctx.fill();mctx.stroke();}
 if(state.waypoint){const px=(state.waypoint.x-state.camX)*mapScale,pz=(state.waypoint.z-state.camZ)*mapScale;mctx.fillStyle='#ffd36b';mctx.strokeStyle='#111';mctx.lineWidth=2*icon;mctx.beginPath();mctx.arc(px,pz,8*icon,0,Math.PI*2);mctx.fill();mctx.stroke();}
 mctx.restore();mctx.save();mctx.translate(s/2,s/2);mctx.scale(ratio,ratio);const facing=(state.mode==='drive'?truck.heading:state.facing)-state.yaw;mctx.rotate(-facing);
 mctx.fillStyle=state.mode==='drive'?'#ff4a4a':'#ffd36b';mctx.strokeStyle='#111';mctx.lineWidth=2;mctx.beginPath();mctx.moveTo(0,-10);mctx.lineTo(7,8);mctx.lineTo(0,4);mctx.lineTo(-7,8);mctx.closePath();mctx.fill();mctx.stroke();mctx.restore();
 mctx.fillStyle='#fff';mctx.font='bold '+13*ratio+'px sans-serif';mctx.textAlign='center';const north=state.yaw;mctx.fillText('N',s/2+Math.sin(north)*(s/2-12*ratio),s/2-Math.cos(north)*(s/2-12*ratio)+5*ratio);
}

// 更新
const clock=new T.Timer();clock.connect(document);let streetTimer=0;const promptBudget=createFrameBudget(10);
function input(){const k=state.keys;let f=(k.has('w')||k.has('arrowup')?1:0)-(k.has('s')||k.has('arrowdown')?1:0),r=(k.has('d')||k.has('arrowright')?1:0)-(k.has('a')||k.has('arrowleft')?1:0);f+=state.stick[1]+state.pad.move[1];r+=state.stick[0]+state.pad.move[0];if(state.mode==='drive')f+=state.pad.throttle-state.pad.reverse;return [Math.max(-1,Math.min(1,f)),Math.max(-1,Math.min(1,r))];}
const playerGait=createWalkMotion();
function updateWalk(dt){
 const beforeX=state.x,beforeZ=state.z;
 const [f,r]=input(),len=Math.hypot(f,r);
 if(len>.05){const speed=(state.keys.has('shift')||state.run||state.pad.held.run?6:2.6)*Math.min(1,len)*(mission&&state.air<=0?.5:1),fx=-Math.sin(state.yaw),fz=-Math.cos(state.yaw),rx=Math.cos(state.yaw),rz=-Math.sin(state.yaw),dx=(fx*f+rx*r)/len,dz=(fz*f+rz*r)/len;
  let p=colliders.resolve(state.x+dx*speed*dt,state.z+dz*speed*dt,.38);
  // 消防車車身也視為障礙（三個圓近似）。
  for(const c of truckCircles()){const ex=p.x-c[0],ez=p.z-c[1],d=Math.hypot(ex,ez);if(d<c[2]+.38&&d>1e-6){p={x:c[0]+ex/d*(c[2]+.38),z:c[1]+ez/d*(c[2]+.38)};}}
  for(const c of sceneCircles(false)){const ex=p.x-c[0],ez=p.z-c[1],d=Math.hypot(ex,ez);if(d<c[2]+.38&&d>1e-6)p={x:c[0]+ex/d*(c[2]+.38),z:c[1]+ez/d*(c[2]+.38)};}
  for(const c of gis?.circles()??[]){const ex=p.x-c[0],ez=p.z-c[1],d=Math.hypot(ex,ez);if(d<c[2]+.38&&d>1e-6)p={x:c[0]+ex/d*(c[2]+.38),z:c[1]+ez/d*(c[2]+.38)};}
  for(const c of aerial?.circles()??[]){const ex=p.x-c[0],ez=p.z-c[1],d=Math.hypot(ex,ez);if(d<c[2]+.38&&d>1e-6)p={x:c[0]+ex/d*(c[2]+.38),z:c[1]+ez/d*(c[2]+.38)};}
  for(const c of life.circles()){const ex=p.x-c[0],ez=p.z-c[1],d=Math.hypot(ex,ez);if(d<c[2]+.38&&d>1e-6)p={x:c[0]+ex/d*(c[2]+.38),z:c[1]+ez/d*(c[2]+.38)};}
  state.x=p.x;state.z=p.z;const target=Math.atan2(-dx,-dz);state.facing=smoothHeading(state.facing,target,dt);state.walkT+=dt*speed*2.2;
 }
 const gait=playerGait.update(dt,Math.hypot(state.x-beforeX,state.z-beforeZ)),stride=gait.swing;person.legs[0].rotation.x=stride;person.legs[1].rotation.x=-stride;person.arms[0].rotation.x=-stride*.8;person.arms[1].rotation.x=stride*.8;
 player.position.set(state.x,walkSurface.at(state.x,state.z)+gait.bob,state.z);player.rotation.y=state.facing;
 if(promptBudget.due(clock.getElapsed()*1000,state.mode)){const ne=nearEntry();$('prompt').hidden=!nearTruck()&&!ne;$('prompt').textContent=ne?(matchMedia('(pointer:coarse)').matches?'點「上車」進入建物（示意）':'按 E 進入建物（示意平面）'):matchMedia('(pointer:coarse)').matches?'點「上車」駕駛消防車':'按 E 駕駛消防車；按 U 選攜帶裝備';}

}
function truckCircles(){const f=[-Math.sin(truck.heading),-Math.cos(truck.heading)];return [-2.4,0,2.4].map(o=>[truck.x+f[0]*o,truck.z+f[1]*o,1.45]);}
function updateDrive(dt){
 if(!stationTeam.readyToDrive()){truck.v=0;truck.steer=0;state.x=truck.x;state.z=truck.z;$('kmh').textContent='0';$('prompt').hidden=true;return;}
 const [f,r]=input(),brake=state.keys.has(' ')||state.pad.held.brake||state.touchBrake;
 // 遊戲式操控：極速約 120 km/h，非實車性能。
 if(brake)truck.v*=Math.max(0,1-dt*3.5);else if(f>0)truck.v+=(truck.v<0?14:8.5-truck.v*.12)*f*dt;else if(f<0)truck.v+=(truck.v>0?14:4)*f*dt;else truck.v*=Math.max(0,1-dt*.45);
 truck.v=Math.max(-8,Math.min(33.4,truck.v));if(Math.abs(truck.v)<.05&&!f)truck.v=0;
 truck.steer+=((-r)*.55/(1+Math.abs(truck.v)*.06)-truck.steer)*Math.min(1,dt*5);
 const old={x:truck.x,z:truck.z,h:truck.heading};truck.heading+=truck.v/4.3*Math.tan(truck.steer)*dt;
 truck.x+=-Math.sin(truck.heading)*truck.v*dt;truck.z+=-Math.cos(truck.heading)*truck.v*dt;
 let hit=false;for(const c of truckCircles()){const p=colliders.resolve(c[0],c[1],c[2]);if(p.hit){hit=true;truck.x+=p.x-c[0];truck.z+=p.z-c[1];}}
 if(hit){if(Math.abs(truck.v)>3){rumble(state.padRef,Math.min(1,Math.abs(truck.v)/20+.3),180);truck.v*=-.25;}else truck.v*=.5;for(const c of truckCircles())if(colliders.resolve(c[0],c[1],c[2]).hit){truck.x=old.x;truck.z=old.z;truck.heading=old.h;break;}}
 // NPC 車輛：與消防車重疊時退回原位並減速（NPC 會在前方自動停車）。
 for(const c of truckCircles())if(life.circles().some(o=>Math.hypot(o[0]-c[0],o[1]-c[1])<o[2]+c[2]*.8)){truck.x=old.x;truck.z=old.z;truck.heading=old.h;truck.v*=Math.abs(truck.v)>3?-.2:0;break;}
 // 已配置的雲梯車（含支腿）視為障礙。
  for(const c of truckCircles())if([...(aerial?.circles()??[]),...(gis?.circles()??[]),...sceneCircles(true)].some(o=>Math.hypot(o[0]-c[0],o[1]-c[1])<o[2]+c[2]*.85)){truck.x=old.x;truck.z=old.z;truck.heading=old.h;truck.v=0;break;}
 truck.rig?.update(truck.v*dt,truck.steer);
 state.x=truck.x;state.z=truck.z;$('kmh').textContent=Math.round(Math.abs(truck.v)*3.6);$('prompt').hidden=true;
}
// 遊戲手把：每幀讀取，動作與鍵盤相同。Start＝暫停選單、Back／View＝地圖、B 關閉選單或地圖。
// 回傳 true 表示本幀已切換暫停／地圖（跳過模擬）。
let padNotice=false;
function pollPad(){
 const pad=pickPad(navigator.getGamepads?.());state.padRef=pad;
 if(!pad){state.pad=readPad(null);state.padPrev=[];return false;}
 const p=readPad(pad,state.padPrev),justB=(p.buttons[BUTTONS.b]??0)>.5&&!((state.padPrev[BUTTONS.b]??0)>.5);state.padPrev=p.buttons;
 if(!padNotice){padNotice=true;audio.unlock();$('prompt').hidden=false;$('prompt').textContent='已偵測到手把：選單「操作說明」有按鍵配置';setTimeout(()=>{if($('prompt').textContent.startsWith('已偵測到手把'))$('prompt').hidden=true;},3500);}
 if(bigmap.open){state.pad=readPad(null);if(justB||p.pressed.includes('map')){closeMap();return true;}return false;}
 if(state.paused){state.pad=readPad(null);if(justB||p.pressed.includes('pause')){setPaused(false);return true;}return false;}
 // 對話框開啟時，B 關閉。
 if(!$('triage').hidden||!$('transport').hidden){state.pad=readPad(null);if(justB){closeTriage();closeTransport();}return false;}
 if(p.pressed.includes('pause')){setPaused(true);return true;}
 if(justB&&(state.mode==='walk'||state.mode==='interior')&&mission?.hose)toggleNozzle();
 if(state.mode==='interior'){if(p.pressed.includes('map')){openMap();return true;}state.pad=p;const M={vehicle:'e',hose:'f',siren:'c',triage:'i',aerial:'x',zoomIn:'1',zoomOut:'2',mission:'3',supply:'4',transport:'5'};for(const a of p.pressed)if(M[a])interiorKey(M[a]);state.pad.held.use=(p.buttons[BUTTONS.x]??0)>.5;return false;}
 if(p.pressed.includes('map')){openMap();return true;}
 state.pad=p;
 for(const a of p.pressed){if(a==='vehicle')toggleVehicle();else if(a==='hose')toggleHose();else if(a==='siren')toggleSiren();else if(a==='mission')startMission();else if(a==='time')cycleTime();else if(a==='aerial')aerialAction();else if(a==='triage')openTriage();else if(a==='transport')openTransport();else if(a==='supply')supplyAction();
  else if(a==='zoomIn')state.dist=Math.max(3,state.dist/1.15);else if(a==='zoomOut')state.dist=Math.min(40,state.dist*1.15);else if(a==='resetCam'){state.yaw=state.mode==='drive'?truck.heading:state.facing;state.pitch=.32;}}
 return false;
}
function lookPad(dt){const [x,y]=state.pad.look;if(!x&&!y)return;const k=settings.sens;state.yaw-=x*2.6*k*dt;state.pitch=Math.min(1.25,Math.max(state.mode==='interior'?-.75:.05,state.pitch+y*1.8*k*dt*(settings.invertY?-1:1)));state.camHold=1.5;}
addEventListener('gamepadconnected',()=>{padNotice=false;});
let lastFrame=0;
function frame(now){
 requestAnimationFrame(frame);
 // 30 FPS 省電：未到間隔就跳過這一幀；暫停時停止模擬與繪製。
 if(settings.fps===30&&now-lastFrame<1000/30-2)return;lastFrame=now;
 if(document.hidden||pollPad()||state.paused||bigmap.open){clock.update(now);return;}
 clock.update(now);const rawDt=clock.getDelta(),dt=Math.min(rawDt,.05),t=clock.getElapsed();quality.sample(rawDt);
 lookPad(dt);
 stationTeam.update(dt,{mode:state.mode,truck,leader:state,blockers:[...truckCircles(),...life.circles(),...(aerial?.circles()??[])]});
 zhuangjing?.update(state);
 const crewStatus=zhuangjing&&Math.hypot(state.x-zhuangjing.layout.x,state.z-zhuangjing.layout.z)<28?zhuangjing.status:stationTeam.status();if($('stationCrewStatus').textContent!==crewStatus)$('stationCrewStatus').textContent=crewStatus;
 if(!grassReview&&!sidewalkReview){state.mode==='walk'?updateWalk(dt):state.mode==='drive'?updateDrive(dt):updateInterior(dt);}
 eocDetail?.update(t,camera.position);treeForest?.update(camera.position);shortGrass?.update(t,camera.position);youBike?.update(camera.position);shophouse?.update(camera.position,QUALITY[quality.level].detail);
 life.update(dt,t,[...(state.mode!=='walk'?truckCircles():[[state.x,state.z,.5],...truckCircles()]),...(aerial?.circles()??[]),...(gis?.circles()??[]),...sceneCircles(true)],{eye:camera.position,siren:[truck.siren?{x:truck.x,z:truck.z}:null,...squadKit.squads.flatMap(sq=>sq.vehicles.filter(v=>v.state==='driving').map(v=>({x:v.x,z:v.z})))]});
 updateAerial(dt);
 updateMission(dt,t);updateAir(dt);actionKit.updateCharacters(dt,{eye:camera.position});if(state.mode==='walk')placeCharacterFeet(player,person,walkSurface);
 if(state.mode==='interior'){updateNavigation(dt);{const dTruck=30;audio.update({t,siren:truck.siren?1/(1+dTruck/25):0,speed:0,driving:false,ambient:.3});}drawMinimap(now);indoor.render(renderer,camera,state.yaw,fpPitch());return;}
 // 消防車貼地，依前後輪地面高差俯仰。
 const fx=-Math.sin(truck.heading),fz=-Math.cos(truck.heading),yf=ground.at(truck.x+fx*2.3,truck.z+fz*2.3),yr=ground.at(truck.x-fx*2.1,truck.z-fz*2.1);
 truck.root.position.set(truck.x,(yf+yr)/2,truck.z);truck.root.rotation.set(Math.atan2(yf-yr,4.4),truck.heading,0,'YXZ');
 for(const m of truck.beacons){const on=truck.siren&&Math.sin(t*14+(m.id%2)*Math.PI)>0;m.emissiveIntensity=truck.siren?(on?6:.2):1;}
 // 相機
 state.camHold=Math.max(0,(state.camHold||0)-dt);
 if(state.mode==='drive'&&!state.camHold&&Math.abs(truck.v)>.5){const want=truck.heading;state.yaw+=Math.atan2(Math.sin(want-state.yaw),Math.cos(want-state.yaw))*Math.min(1,dt*2.5);}
 const tx=state.x,tz=state.z,ty=(state.mode==='walk'?walkSurface.at(tx,tz):ground.at(tx,tz))+(state.mode==='drive'?2.8:1.5);state.camX=tx;state.camZ=tz;
 let d=state.dist+(state.mode==='drive'?Math.abs(truck.v)*.22:0);
 // 相機碰撞：沿視線往外取樣，碰到落地牆面就把相機拉到牆前，避免鏡頭穿進建物。
 for(let s=1.5;s<=d;s+=.6){const x=tx+Math.sin(state.yaw)*Math.cos(state.pitch)*s,z=tz+Math.cos(state.yaw)*Math.cos(state.pitch)*s;if(colliders.resolve(x,z,.3).hit){d=Math.max(1.4,s-.6);break;}}
 const cx=tx+Math.sin(state.yaw)*Math.cos(state.pitch)*d,cz=tz+Math.cos(state.yaw)*Math.cos(state.pitch)*d;
 camera.position.set(cx,Math.max(ty+Math.sin(state.pitch)*d,ground.at(cx,cz)+.6),cz);camera.lookAt(tx,ty,tz);if(grassReview&&shortGrass){const pose=shortGrass.reviewPose();camera.position.copy(pose.eye);camera.lookAt(pose.target);}if(sidewalkReview&&sidewalks){const pose=sidewalks.reviewPose();camera.position.copy(pose.eye);camera.lookAt(pose.target);}sky.position.copy(camera.position);
 sun.position.set(tx+sunDir.x*250,ground.at(tx,tz)+sunDir.y*250,tz+sunDir.z*250);sun.target.position.set(tx,ground.at(tx,tz),tz);
 updateNavigation(dt);
 {const dTruck=Math.hypot(state.x-truck.x,state.z-truck.z),driving=state.mode==='drive';audio.update({t,siren:truck.siren?(driving?1:1/(1+dTruck/25)):0,speed:truck.v,driving,ambient:state.time==='night'?.6:1});}
 streetTimer-=dt;if(streetTimer<0){streetTimer=.4;$('street').textContent=nearestStreet(navigationFeatures,state.x,state.z)??'信義區（無道路名稱）';}
 drawMinimap(now);renderer.render(scene,camera);
}
// 直式手機：垂直視角放大（60°→最多 80°），左右才看得到街道兩側（移植自 main）。
const portrait=()=>innerWidth<innerHeight;
function resize(){renderer.setPixelRatio(quality.pixelRatio());renderer.setSize(innerWidth,innerHeight,false);const a=innerWidth/innerHeight;camera.aspect=a;camera.fov=a<1?Math.min(80,Math.max(60,2*Math.atan(Math.tan(35*Math.PI/180)/a)*180/Math.PI)):60;camera.updateProjectionMatrix();const s=TOUCH?120:innerWidth<=640?140:220;mini.width=mini.height=s*Math.min(devicePixelRatio,2);minimapDisplaySize=mini.clientWidth||s-6;minimapControlKey='';}
// ---------- 設定與暫停選單 ----------
// 設定只存在本機瀏覽器（localStorage）；無法存取時仍以預設值運作。
const SETTINGS_KEY='xinyiStreetSettings',DEFAULTS={quality:'auto',fps:60,showFps:false,sens:1,invertY:false,life:{traffic:true,people:true,shops:true,markings:true,trees:true},audio:{muted:false,master:.8,siren:.7,engine:.6,ambient:.5},load:{firefighter:75,gear:25,equipment:15,stretcher:15,capacity:500},missionType:'fire'};
const settings=(()=>{try{const v=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');return {...DEFAULTS,...v,life:{...DEFAULTS.life,...v.life},audio:{...DEFAULTS.audio,...v.audio},load:{...DEFAULTS.load,...v.load}};}catch{return structuredClone(DEFAULTS);}})();
const saveSettings=()=>{try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{}};
minimapZoom=miniZoom(settings.minimapZoom);
$('miniZoomOut').onclick=()=>changeMinimapZoom(stepMiniZoom(minimapZoom,-1));$('miniZoomIn').onclick=()=>changeMinimapZoom(stepMiniZoom(minimapZoom,1));$('miniZoomReset').onclick=()=>changeMinimapZoom(1);
for(const id of ['miniZoomOut','miniZoomIn','miniZoomReset'])$(id).addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter')e.stopPropagation();});
$('minimapPanel').addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();if(e.deltaY)changeMinimapZoom(stepMiniZoom(minimapZoom,e.deltaY<0?1:-1));},{passive:false});
// 畫質：解析度倍率、陰影、NPC 密度、可視距離。自動模式依裝置起始，實測平均幀率過低時逐級降低。
const QUALITY={low:{label:'低',detail:160,pr:.75,shadow:0,density:.35,far:.7},medium:{label:'中',detail:300,pr:1.25,shadow:1024,density:.7,far:.85},high:{label:'高',detail:450,pr:2,shadow:2048,density:1,far:1}};
const quality={level:'medium',auto:matchMedia('(pointer:coarse)').matches||Math.min(screen.width,screen.height)<700?'low':'medium',meter:createFrameWindow(),
 resolved(){return settings.quality==='auto'?this.auto:settings.quality;},
 pixelRatio(){return Math.min(devicePixelRatio,QUALITY[this.resolved()].pr,settings.quality==='auto'?1:Infinity);},
 apply(){const q=QUALITY[this.level=this.resolved()];forestQuality=this.level;treeForest?.setQuality(forestQuality);shortGrass?.setQuality(forestQuality);renderer.setPixelRatio(this.pixelRatio());renderer.setSize(innerWidth,innerHeight,false);
  sun.castShadow=q.shadow>0;if(q.shadow&&sun.shadow.mapSize.x!==q.shadow){sun.shadow.mapSize.set(q.shadow,q.shadow);sun.shadow.map?.dispose();sun.shadow.map=null;}
  life.setDensity(q.density);camera.far=2500*q.far;camera.updateProjectionMatrix();scene.fog.far=TIME_PRESETS[state.time].fogFar*q.far;
  $('qualityDetail').textContent=`目前：${q.label}（解析度 ${Math.round(this.pixelRatio()*100)}%、陰影${q.shadow?q.shadow+' px':'關閉'}、車流行人 ${Math.round(q.density*100)}%）`+(settings.quality==='auto'?'，自動模式':'');},
 sample(dt){const sample=this.meter.sample(dt);if(!sample)return;const fps=sample.fps;$('fps').textContent=Math.round(fps)+' FPS · '+QUALITY[this.level].label;
  const target=settings.fps===30?26:50;if(settings.quality==='auto'&&fps<target&&this.auto!=='low'){this.auto=this.auto==='high'?'medium':'low';this.apply();}}};
function setPaused(on,page){if(on)syncGisLink();state.paused=on;on?audio.suspend():audio.resume();$('menu').hidden=!on;state.keys.clear();state.stick=[0,0];if(on)showPage(page??'settings');}
function showPage(page){for(const b of document.querySelectorAll('.menu-nav [data-page]'))b.classList.toggle('active',b.dataset.page===page);for(const sec of document.querySelectorAll('.menu-body [data-page]'))sec.hidden=sec.dataset.page!==page;}
for(const b of document.querySelectorAll('.menu-nav [data-page]'))b.onclick=()=>showPage(b.dataset.page);
// 暫停選單：以目前位置開啟 GIS 頁；把水箱車（第一車組）與雲梯車位置存回 GIS 部署。
function syncGisLink(){const [lon,lat]=unproject(state.x,state.z),h=Math.round(((-state.yaw*180/Math.PI)%360+360)%360);$('gisLink').href=`taipei-map.html?place=xinyi&lon=${lon.toFixed(6)}&lat=${lat.toFixed(6)}&heading=${h}`;}
$('gisSave').onclick=()=>{if(!geoModels){$('gisSaveNote').textContent='車型清單未載入，無法存回。';return;}
 const ap=aerial&&aerial.state.phase!=='idle'&&aerial.state.frame?{x:aerial.state.frame.x,z:aerial.state.frame.z,heading:aerial.state.frame.heading+Math.PI/2}:null;
 const saved=writeBack(gis?.load(),{engine:{x:truck.x,z:truck.z,heading:truck.heading},aerial:ap},geoModels);
 if(!saved){$('gisSaveNote').textContent='無法存入這台裝置的瀏覽器（可能停用了網站資料）。';return;}
 gisDep=saved;applyGis();$('gisSaveNote').textContent='已存回：第一車組'+(ap?'與雲梯車':'')+'位置。開啟 GIS 頁的部署試用即可看到（同一瀏覽器）。';};
$('resume').onclick=()=>setPaused(false);$('help').onclick=()=>setPaused(!state.paused);
$('menu').addEventListener('pointerdown',e=>{if(e.target===$('menu'))setPaused(false);});
function bindSeg(id,get,set){const seg=$(id),sync=()=>{for(const b of seg.children)b.classList.toggle('on',b.dataset.v===String(get()));};for(const b of seg.children)b.onclick=()=>{set(b.dataset.v);sync();saveSettings();};sync();return sync;}
bindSeg('quality',()=>settings.quality,v=>{settings.quality=v;quality.apply();});
bindSeg('fpsCap',()=>settings.fps,v=>{settings.fps=+v;});
bindSeg('missionType',()=>settings.missionType,v=>{settings.missionType=v;});
const syncTime=bindSeg('timeSeg',()=>state.time,v=>{applyTime(v);quality.apply();});
$('showFps').checked=settings.showFps;$('fps').hidden=!settings.showFps;$('showFps').onchange=()=>{settings.showFps=$('showFps').checked;$('fps').hidden=!settings.showFps;saveSettings();};
$('sens').value=settings.sens;$('sensValue').textContent=(+settings.sens).toFixed(1)+'×';$('sens').oninput=()=>{settings.sens=+$('sens').value;$('sensValue').textContent=settings.sens.toFixed(1)+'×';saveSettings();};
$('invertY').checked=settings.invertY;$('invertY').onchange=()=>{settings.invertY=$('invertY').checked;saveSettings();};
function setLifeVisible(group,visible){life.groups[group].visible=group==='trees'&&treeForest?false:visible;if(group==='trees'){forestVisible=visible;treeForest?.setVisible(visible);}if(group==='markings'&&laneMesh)for(const m of laneMesh.children)if(m.userData.inferredPaint)m.visible=visible;}
for(const [id,group] of [['lifeTraffic','traffic'],['lifePeople','people'],['lifeShops','shops'],['lifeMarkings','markings'],['lifeTrees','trees']]){const box=$(id);box.checked=settings.life[group];setLifeVisible(group,box.checked);box.onchange=()=>{setLifeVisible(group,box.checked);settings.life[group]=box.checked;saveSettings();};}
$('sidewalkReviewButton').onclick=reviewSidewalks;
$('sidewalkAppearance').onchange=()=>{sidewalks?.setVisible($('sidewalkAppearance').checked);};
$('grassReviewButton').onclick=reviewShortGrass;
$('shortGrass').onchange=()=>{shortGrass?.setVisible($('shortGrass').checked);if(!$('shortGrass').checked&&grassReview){grassReview=false;$('grassReviewButton').textContent='近看短草';$('grassReviewButton').setAttribute('aria-pressed','false');}};$('shortGrassLocate').onclick=()=>{if(!grassReview)reviewShortGrass();};
$('youBike').checked=settings.youBike!==false;youBike?.setVisible($('youBike').checked);
$('youBike').disabled=!youBike;
$('youBike').onchange=()=>{settings.youBike=$('youBike').checked;youBike?.setVisible(settings.youBike);saveSettings();};
const stationSelect=$('youBikeStation');
for(const s of youBike?.records??[]){const o=document.createElement('option');o.value=s.id;o.textContent=s.name;stationSelect.append(o);}
stationSelect.value='500112017';
function describeYouBike(){const s=youBike?.records.find(s=>s.id===stationSelect.value);$('youBikeStationDetail').textContent=s?s.address+'｜官方柱位總數 '+s.capacity+(s.renderable?'（照片配置已通過模型車道檢查；尺寸待量測）':'（僅保留站點資料；實體排列待核對，暫不顯示車柱與自行車）'):'';}
stationSelect.onchange=describeYouBike;describeYouBike();
$('youBikeLocate').disabled=!youBike;$('youBikeLocate').onclick=()=>{const s=youBike.records.find(s=>s.id===stationSelect.value);if(s){setWaypoint(s.x,s.z,'YouBike・'+s.name);setPaused(false);openMap();}};
$('youBikeStatus').textContent=youBike?'已保留信義區 '+youBike.records.length+' 站官方座標與容量；'+youBike.stats.reviewed+' 站照片配置通過模型車道重疊檢查，'+youBike.stats.pending+' 站排列待核對，僅顯示地圖站點。官方代表座標不當作整排車柱中心；不依容量自動鋪車。現場尺寸、路緣及可借數仍待確認。':'YouBike 資料未載入；請重新整理。';
$('yellowBoxes').checked=settings.yellowBoxes!==false;if(yellowBoxes)yellowBoxes.group.visible=$('yellowBoxes').checked;
$('yellowBoxes').onchange=()=>{settings.yellowBoxes=$('yellowBoxes').checked;if(yellowBoxes)yellowBoxes.group.visible=settings.yellowBoxes;saveSettings();};
$('yellowBoxStatus').textContent=yellowBoxData?'網狀黃線：已掃描 '+yellowBoxData.coverage.tilesScanned+' 個影像分區，匯入 '+yellowBoxes.count+' 處，另 '+yellowBoxData.counts.deferredBoundary+' 筆候選外框待核對。來源為2025影像；線寬、間距及目前現況待核對，遮蔽處可能漏辨。':'網狀黃線資料未載入，請重新整理後核對。';
$('zebraMapped').checked=settings.zebraMapped!==false;zebraCrossings.groups.mapped.visible=$('zebraMapped').checked;
$('zebraReview').checked=settings.zebraReview!==false;zebraCrossings.groups.review.visible=$('zebraReview').checked;
$('zebraMapped').onchange=()=>{settings.zebraMapped=$('zebraMapped').checked;zebraCrossings.groups.mapped.visible=settings.zebraMapped;saveSettings();};
$('zebraReview').onchange=()=>{settings.zebraReview=$('zebraReview').checked;zebraCrossings.groups.review.visible=settings.zebraReview;saveSettings();};
$('zebraStatus').textContent='黑白斑馬線：'+zebraCrossings.counts.mapped+' 段有 OSM 斑馬線標記；另 '+zebraCrossings.counts.review+' 段已有穿越道位置，條紋樣式待核對。寬度、條紋與間距仍為示意。';
$('officialPaint').checked=settings.officialPaint!==false;if(officialPaint)officialPaint.visible=$('officialPaint').checked;if(mappedPaint)mappedPaint.visible=$('officialPaint').checked;
$('officialPaint').onchange=()=>{settings.officialPaint=$('officialPaint').checked;if(officialPaint)officialPaint.visible=settings.officialPaint;if(mappedPaint)mappedPaint.visible=settings.officialPaint;saveSettings();};
addEventListener('resize',resize);applyTime('afternoon');quality.apply();resize();
addEventListener('blur',()=>{if(bigmap.open)closeMap();if(!state.paused)setPaused(true);});
// 音效設定
$('muted').checked=settings.audio.muted;audio.setMuted(settings.audio.muted);$('muted').onchange=()=>{settings.audio.muted=$('muted').checked;audio.setMuted(settings.audio.muted);saveSettings();};
for(const name of ['master','siren','engine','ambient']){const el=$('vol-'+name),out=$('vol-'+name+'Value'),show=()=>out.textContent=Math.round(settings.audio[name]*100)+'%';el.value=settings.audio[name];show();audio.setVolume(name,settings.audio[name]);el.oninput=()=>{settings.audio[name]=+el.value;audio.setVolume(name,+el.value);show();saveSettings();};}
addEventListener('pointerdown',()=>audio.unlock());
// 雲梯籃架載重設定
for(const k of ['firefighter','gear','equipment','stretcher','capacity']){const el=$('load-'+k);el.value=settings.load[k];el.oninput=()=>{const v=+el.value;if(Number.isFinite(v)&&v>=0){settings.load[k]=v;saveSettings();renderLoad();}};}
$('loadReset').onclick=()=>{settings.load={...DEFAULTS.load};for(const k of Object.keys(settings.load))$('load-'+k).value=settings.load[k];saveSettings();renderLoad();};
renderLoad();
$('loading').hidden=true;
{const at=new URLSearchParams(location.search).get('at');if(at)goToLandmark(at);}
// 測試用：以固定時間步推進模擬（不渲染）。
grassReviewUiReady=true;if(sidewalks&&new URLSearchParams(location.search).get('review')==='sidewalk'&&!sidewalkReview)reviewSidewalks();if(shortGrass&&new URLSearchParams(location.search).get('review')==='grass'&&!grassReview)reviewShortGrass();
window.__xinyiStreet={get sidewalks(){return sidewalks;},get shortGrass(){return shortGrass;},get treeForest(){return treeForest;},get tankerKit(){return tankerKit;},get surveyKit(){return surveyKit;},walkSurface,youBike,zhuangjing,stationTeam,squadKit,openSquads,renderSquads,squadCtx,resetIndoor(closed){mission.indoor=setupIndoor(mission.site,closed);mission.intensity=closed?.3:.55;renderIndoorLine();},indoor,enterBuilding,exitBuilding,openEquip,nearEntry,interiorKey,supplyAction,toggleNozzle,fireList,get upperFx(){return upperFx;},missionRecord,sceneCircles,mapMarkers,openTransport,renderTransport,openTriage,submitTriage,renderer,gis,get gisDep(){return gisDep;},syncGisLink,get aerial(){return aerial;},aerialAction,setAerialMode,get aerialPreview(){return aerialPreview;},fireFx,scene,camera,get mission(){return mission;},startMission,toggleHose,state,truck,colliders,ground,life,applyTime,quality,settings,setPaused,bigmap,openMap,closeMap,setWaypoint,audio,routeGraphs,pollPad,tick(dt,n=1){for(let i=0;i<n;i++){zhuangjing?.update(state);stationTeam.update(dt,{mode:state.mode,truck,leader:state,blockers:[...truckCircles(),...life.circles(),...(aerial?.circles()??[])]});state.mode==='walk'?updateWalk(dt):state.mode==='drive'?updateDrive(dt):updateInterior(dt);updateAerial(dt);updateMission(dt,i*dt);updateAir(dt);actionKit.updateCharacters(dt);if(state.mode==='walk')placeCharacterFeet(player,person,walkSurface);}}};
requestAnimationFrame(frame);
