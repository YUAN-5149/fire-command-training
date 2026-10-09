// 信義街景 ↔ GIS 部署頁：讀取 GIS 頁配置的車組、人員、搶救建物與第一正面入口並放到街景；
// 也可把街景中的水箱車（第一車組）與雲梯車位置寫回，讓 GIS 頁顯示。資料只存在這台裝置的瀏覽器。
// 車輛使用 GIS 頁同一批模型（geo-*.glb）；人員使用街景既有角色造型與制服階級。
import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {project,unproject} from './xinyi-street-world.js?v=s13';
import {GEO_UNITS,CREW_RANK,loadDeployment,saveDeployment,gisToStreetHeading,streetToGisHeading,crewOffsets} from './deployment-store.js?v=s13';

const PLACE='xinyi';
// 純函式：GIS 部署 → 街景座標（x 東、z 南，公尺；heading 為街景弧度）。
export function deploymentToStreet(dep){
 if(!dep)return null;
 const vehicles=[],crew=[];
 for(const [key,item] of Object.entries(dep.items??{})){
  const unit=GEO_UNITS.find(u=>u.id===item.unitId);if(!unit||!item.point)continue;
  const [x,z]=project(item.point.longitude,item.point.latitude),heading=gisToStreetHeading(item.heading||0);
  if(item.kind==='crew'){crewOffsets(item.heading||0,unit.crew.length).forEach(([e,n],i)=>crew.push({unitId:unit.id,key:unit.crew[i],rank:CREW_RANK[unit.crew[i]]??'隊員',x:x+e,z:z-n,heading}));}
  else vehicles.push({id:key,unitId:unit.id,name:unit.name,model:unit.model,x,z,heading,task:item.task||'待命'});
 }
 const pt=p=>p?project(p.longitude,p.latitude):null;
 const target=dep.target?{id:dep.target.id,height:dep.target.height,point:dep.target.point,xz:pt(dep.target.point)}:null;
 return {vehicles,crew,target,entrance:dep.entrance?{point:dep.entrance,xz:pt(dep.entrance)}:null,logs:dep.logs??[],source:dep.source};
}
// 純函式：街景位置 → GIS 部署紀錄（車位尺寸與 GIS 頁放置時相同）。
export function streetToRecord(unitId,x,z,heading,models,previous={}){
 const unit=GEO_UNITS.find(u=>u.id===unitId),m=models[unit.model],[longitude,latitude]=unproject(x,z);
 return {...previous,kind:'vehicle',unitId,point:{longitude,latitude},heading:Math.round(streetToGisHeading(heading)),width:unitId==='aerial'?Math.max(m.span+4,7):m.span+.6,length:m.length+(unitId==='aerial'?2:1),task:previous.task||'待命'};
}
export function writeBack(dep,{engine=null,aerial=null},models,storage){
 const state={items:{...(dep?.items??{})},logs:[...(dep?.logs??[])],target:dep?.target??null,entrance:dep?.entrance??null},now=new Date().toISOString(),notes=[];
 if(engine){state.items.engine1=streetToRecord('engine1',engine.x,engine.z,engine.heading,models,state.items.engine1);notes.push('第一車組・水箱車（朝向 '+state.items.engine1.heading+'°）');}
 if(aerial){state.items.aerial=streetToRecord('aerial',aerial.x,aerial.z,aerial.heading,models,state.items.aerial);notes.push('雲梯車（朝向 '+state.items.aerial.heading+'°）');}
 if(!notes.length)return false;
 state.logs.unshift({time:now,message:'由信義街景帶回位置：'+notes.join('、')+'；未經 GIS 頁建物遮擋與車位重疊檢查'});
 return saveDeployment(PLACE,state,'street',storage)?state:false;
}

function label(text,color='#ffb34e'){
 const c=document.createElement('canvas'),g=c.getContext('2d');g.font='bold 30px sans-serif';const w=Math.ceil(g.measureText(text).width)+28;c.width=w;c.height=48;
 g.fillStyle='rgba(10,16,22,.78)';g.beginPath();g.roundRect(0,0,w,48,10);g.fill();g.fillStyle=color;g.font='bold 30px sans-serif';g.textBaseline='middle';g.fillText(text,14,25);
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const s=new T.Sprite(new T.SpriteMaterial({map:tex,depthTest:false,transparent:true}));s.scale.set(w/48*.9,.9,1);s.renderOrder=6;return s;
}

export function createGisLayer(scene,{ground,createPerson,models,preloaded={}}){
 const group=new T.Group();group.name='GIS_deployment';scene.add(group);
 const cache=new Map(),loader=new GLTFLoader();
 // 已載入的車型（例如可駕駛水箱車的同一車型）直接複製，不重複下載。
 const model=key=>{if(!cache.has(key))cache.set(key,(preloaded[key]?Promise.resolve({scene:preloaded[key]}):loader.loadAsync(models[key].file)).then(g=>{g.scene.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;const m=o.material;if(/beacon|warning|LED strip|red.*lens|emergency.*lens|red.*flasher/i.test(m?.name||'')){o.material=m.clone();o.material.color?.set('#c61f16');o.material.emissive?.set('#ff180a');}}});return g.scene;}));return cache.get(key);};
 let data=null,hidden=new Set(),ticket=0;const nodes=new Map();
 async function apply(dep,{skip=['engine1']}={}){
  const my=++ticket;data=deploymentToStreet(dep);
  for(const o of [...group.children])group.remove(o);nodes.clear();
  if(!data)return data;
  for(const v of data.vehicles){if(skip.includes(v.unitId))continue;const root=new T.Group();root.position.set(v.x,ground.at(v.x,v.z),v.z);root.rotation.y=v.heading;root.userData.unitId=v.unitId;
   const tag=label(v.name.replace('・待命','')+'・'+v.task);tag.position.y=(models[v.model]?.height??3)+1.2;root.add(tag);group.add(root);nodes.set(v.unitId,root);root.visible=!hidden.has(v.unitId);
   model(v.model).then(src=>{if(my!==ticket)return;const m=src.clone(true);m.rotation.y=-Math.PI/2;root.add(m);}).catch(e=>console.error('GIS 模型無法載入',v.model,e));}
  for(const c of data.crew){const g=new T.Group();g.position.set(c.x,ground.at(c.x,c.z),c.z);g.rotation.y=c.heading;group.add(g);const p=createPerson(g,c.rank);p.body.traverse(o=>{if(o.isMesh)o.castShadow=true;});}
  if(data.target?.xz){const [x,z]=data.target.xz,y=Math.max(ground.at(x,z)+6,(data.target.point?.z??0)+3);const t=label('搶救目標（GIS）','#ff8b49');t.position.set(x,Math.min(y,ground.at(x,z)+60),z);group.add(t);}
  if(data.entrance?.xz){const [x,z]=data.entrance.xz,y=ground.at(x,z),pole=new T.Mesh(new T.CylinderGeometry(.12,.12,3,10),new T.MeshStandardMaterial({color:'#60d6be',emissive:'#1b5e54'}));pole.position.set(x,y+1.5,z);group.add(pole);const t=label('第一正面入口（GIS）','#60d6be');t.position.set(x,y+3.6,z);group.add(t);}
  return data;
 }
 function circles(){if(!data)return [];const out=[];for(const v of data.vehicles){if(!nodes.has(v.unitId)||hidden.has(v.unitId))continue;const len=models[v.model]?.length??6,f=[-Math.sin(v.heading),-Math.cos(v.heading)],r=(models[v.model]?.span??2.5)/2+.1;
  if(len<2){out.push([v.x,v.z,.45]);continue;}const n=Math.max(2,Math.ceil(len/(2*r)));for(let i=0;i<n;i++){const o=(i/(n-1)-.5)*(len-2*r);out.push([v.x+f[0]*o,v.z+f[1]*o,r]);}}
  for(const c of data.crew)out.push([c.x,c.z,.35]);return out;}
 function hide(unitId,on=true){on?hidden.add(unitId):hidden.delete(unitId);const n=nodes.get(unitId);if(n)n.visible=!on;}
 return {group,apply,circles,hide,get data(){return data;},load:()=>loadDeployment(PLACE)};
}
