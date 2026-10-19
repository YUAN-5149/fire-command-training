// 信義區逐車道路面：以 osm2streets（a-b-street/osm2streets, Apache-2.0）把 OSM 道路轉成
// 車道多邊形、標線與路口，存成本地公尺座標（與 xinyi-street-world.js 的 project() 相同：
// x 東、z 南，原點 XINYI_ORIGIN），供信義街景漫遊與 Blender 使用。
//
//   npm i --no-save osm2streets-js@0.1.4
//   node scripts/build-lanes.mjs <xinyi-osm.xml> [node_modules/osm2streets-js]
//
// OSM 原始檔用 scripts/build-streets.py 相同的 bbox 下載
// （https://api.openstreetmap.org/api/0.6/map?bbox=…），寫出 dist/assets/lanes-xinyi.json。
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {project,XINYI_ORIGIN} from '../dist/xinyi-street-world.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const osmFile=process.argv[2],pkg=path.resolve(process.argv[3]||path.join(ROOT,'node_modules/osm2streets-js'));
const mod=await import(pathToFileURL(path.join(pkg,'osm2streets_js.js')).href);
mod.initSync(fs.readFileSync(path.join(pkg,'osm2streets_js_bg.wasm')));
const version=JSON.parse(fs.readFileSync(path.join(pkg,'package.json'),'utf8')).version;

const district=JSON.parse(fs.readFileSync(path.join(ROOT,'dist/assets/district-xinyi.json'),'utf8'));
const [w,s,e,n]=district.bbox;
const clip=JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]}}]});
// 臺灣右側通行；人行道、路緣依 OSM 標記推定。
const opts={osm2lanes:false,debug_each_step:false,dual_carriageway_experiment:false,sidepath_zipping_experiment:false,inferred_sidewalks:true,inferred_kerbs:true,override_driving_side:'Right'};
const log=console.log;console.log=()=>{};console.warn=()=>{};          // osm2streets 會逐條印出幾何警告
const net=new mod.JsStreetNetwork(fs.readFileSync(osmFile,'utf8'),clip,opts);
console.log=log;

const r2=v=>Math.round(v*100)/100;
function rings(geometry){
 const polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
 // 只取外環；osm2streets 的車道與標線沒有內洞。
 return polys.map(p=>p[0]).filter(r=>r.length>=4).map(r=>{const out=[];for(const [lon,lat] of r.slice(0,-1)){const [x,z]=project(lon,lat);out.push(r2(x),r2(z));}return out;});
}
const out={place:'xinyi',bbox:district.bbox,origin:XINYI_ORIGIN,units:'m; x east, z south (xinyi-street-world.js project())',
 generator:`osm2streets-js ${version} (Apache-2.0)`,source:'OpenStreetMap',license:'ODbL 1.0 © OpenStreetMap contributors',
 lanes:{},intersections:[],markings:{},corners:[]};
const add=(obj,key,list)=>{(obj[key]??=[]).push(...list);};
for(const f of JSON.parse(net.toLanePolygonsGeojson()).features)add(out.lanes,f.properties.type||'Other',rings(f.geometry));
for(const f of JSON.parse(net.toGeojsonPlain()).features)if(f.properties.type==='intersection')out.intersections.push(...rings(f.geometry));
const MARK={'center line':'center','lane separator':'separator','lane arrow':'arrow','vehicle stop line':'stop','buffer edge':'buffer','bike lane':'bike'};
for(const f of JSON.parse(net.toLaneMarkingsGeojson()).features)add(out.markings,MARK[f.properties.type]||f.properties.type,rings(f.geometry));
for(const f of JSON.parse(net.toIntersectionMarkingsGeojson()).features)out.corners.push(...rings(f.geometry));
// osm2streets 沿每條車道每隔數公尺放一個箭頭；實際只畫在路口前，所以只保留
// 距最近路口中心 14–24 m 的箭頭，且 2.5 m 內只留一個（約每車道每個路口一個）。
{const centres=out.intersections.map(r=>{let x=0,z=0;for(let i=0;i<r.length;i+=2){x+=r[i];z+=r[i+1];}return [x*2/r.length,z*2/r.length];});
 const cell=40,grid=new Map();for(const c of centres){const k=Math.floor(c[0]/cell)+','+Math.floor(c[1]/cell);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(c);}
 const nearest=(x,z)=>{let d=Infinity;const i0=Math.floor(x/cell),j0=Math.floor(z/cell);for(let i=i0-1;i<=i0+1;i++)for(let j=j0-1;j<=j0+1;j++)for(const c of grid.get(i+','+j)??[])d=Math.min(d,Math.hypot(c[0]-x,c[1]-z));return d;};
 out.markings.arrow=(out.markings.arrow??[]).filter(r=>{let x=0,z=0;for(let i=0;i<r.length;i+=2){x+=r[i];z+=r[i+1];}const d=nearest(x*2/r.length,z*2/r.length);return d>=14&&d<=24;});
 const kept=[],seen=new Map(),k=(x,z)=>Math.floor(x/2.5)+','+Math.floor(z/2.5);
 for(const r of out.markings.arrow){let x=0,z=0;for(let i=0;i<r.length;i+=2){x+=r[i];z+=r[i+1];}x*=2/r.length;z*=2/r.length;
  let clash=false;const i0=Math.floor(x/2.5),j0=Math.floor(z/2.5);
  for(let i=i0-1;i<=i0+1&&!clash;i++)for(let j=j0-1;j<=j0+1&&!clash;j++)for(const c of seen.get(i+','+j)??[])if(Math.hypot(c[0]-x,c[1]-z)<2.5){clash=true;break;}
  if(clash)continue;kept.push(r);const key=k(x,z);if(!seen.has(key))seen.set(key,[]);seen.get(key).push([x,z]);}
 out.markings.arrow=kept;}

// 路口範圍內不畫中線、車道線、箭頭（osm2streets 在重疊路段交會處會留下穿越路口的虛線）。
{const boxes=out.intersections.map(r=>{let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(let i=0;i<r.length;i+=2){a=Math.min(a,r[i]);c=Math.max(c,r[i]);b=Math.min(b,r[i+1]);d=Math.max(d,r[i+1]);}return [a,b,c,d,r];});
 const inside=(x,z,r)=>{let hit=false;for(let i=0,j=r.length-2;i<r.length;j=i,i+=2){const xi=r[i],zi=r[i+1],xj=r[j],zj=r[j+1];if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)hit=!hit;}return hit;};
 const inJunction=(x,z)=>boxes.some(([a,b,c,d,r])=>x>=a&&x<=c&&z>=b&&z<=d&&inside(x,z,r));
 let dropped=0;
 for(const k of ['center','separator','arrow']){out.markings[k]=(out.markings[k]??[]).filter(r=>{let x=0,z=0;for(let i=0;i<r.length;i+=2){x+=r[i];z+=r[i+1];}const keep=!inJunction(x*2/r.length,z*2/r.length);if(!keep)dropped++;return keep;});}
 // OSM 的 footway=crossing 等穿越步道會變成斜穿路口的細長人行多邊形；路口內的行人穿越
 // 已由斑馬線呈現，所以去掉中心落在路口內的人行／自行車類多邊形（只看中點與兩端）。
 let walks=0;
 for(const k of ['Footway','Sidewalk','SharedUse','Biking']){out.lanes[k]=(out.lanes[k]??[]).filter(r=>{let x=0,z=0;for(let i=0;i<r.length;i+=2){x+=r[i];z+=r[i+1];}const keep=!inJunction(x*2/r.length,z*2/r.length);if(!keep)walks++;return keep;});}
 console.error('markings inside junctions dropped',dropped,'walkway polygons dropped',walks);}
const dest=path.join(ROOT,'dist/assets/lanes-xinyi.json');
fs.writeFileSync(dest,JSON.stringify(out));
const count=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,v.length]));
console.log('lanes',count(out.lanes),'intersections',out.intersections.length,'markings',count(out.markings),'corners',out.corners.length,'bytes',fs.statSync(dest).size);
