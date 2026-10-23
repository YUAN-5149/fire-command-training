import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {paintStrips,explicitDivider,addRoadPaint,outerGroundGeometry} from '../dist/xinyi-road-paint.js';
import {buildZebraCrossings} from '../dist/geo-street-fixtures.js';
import {project,unproject} from '../dist/xinyi-street-world.js';
import {buildRouteGraph,findRoute} from '../dist/xinyi-street-nav.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+f,import.meta.url)));
const roads=read('xinyi-road-network.json'),paint=read('xinyi-curb-markings.json');
const inside=(x,y)=>{const ring=roads.boundary.coordinates[0];let v=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])v=!v;}return v;};
const [w,s,e,n]=roads.bbox;
assert.equal(roads.districtCode,'63002');assert.ok(e-w>.039&&n-s>.04,'whole administrative district, not original core');
assert.equal(new Set(roads.features.map(f=>f.id)).size,roads.features.length,'OSM tile deduplication');
assert.ok(roads.features.length>3500&&roads.outerFeatures.length>2500);
for(const f of roads.features)for(const path of f.paths)for(const [x,y] of path){assert.ok(x>=w-1e-6&&x<=e+1e-6&&y>=s-1e-6&&y<=n+1e-6);assert.ok(Number.isFinite(x+y));}
assert.equal(roads.source.osmTiles.length,20);assert.ok(roads.source.osmTiles.every(t=>/^[a-f0-9]{64}$/.test(t.sha256)));
assert.equal(paint.source.curbSnapshot,'2024-07-12');assert.equal(paint.source.boundarySnapshot,'2022-09-15');
assert.equal(paint.stats.red,paint.features.filter(f=>f.kind==='red').length);assert.equal(paint.stats.yellow,paint.features.filter(f=>f.kind==='yellow').length);
assert.ok(paint.stats.red>10000&&paint.stats.yellow>700);assert.equal(new Set(paint.features.map(f=>f.id)).size,paint.features.length);
assert.match(paint.classification['01'],/紅/);assert.match(paint.classification['02'],/黃/);assert.match(paint.classification['11'],/消防紅/);
assert.equal(paint.status.curbWidth,'display-width-not-measured');assert.equal(roads.status.lanePaint,'inferred-unless-explicit-source');
let inner=0;for(const f of paint.features){assert.ok(['01','06','11','02','12'].includes(f.code));assert.equal(f.kind,['02','12'].includes(f.code)?'yellow':'red');assert.deepEqual(Object.keys(f).sort(),['code','id','kind','label','path']);for(const p of f.path){assert.ok(p.every(Number.isFinite));const [x,y]=unproject(...p);assert.ok(x>=w-1e-6&&x<=e+1e-6&&y>=s-1e-6&&y<=n+1e-6);if(inside(x,y))inner++;}}
assert.ok(inner>20000,'line geometry inside official district');
// Continuous dash phase across source vertices: 0-4, 10-14, 20-24 metres.
const dash=paintStrips([[0,0],[7,0],[25,0]],{width:.15,dash:[4,6]});
let area=0;for(const r of dash){const lo=Math.min(r[0],r[2]),hi=Math.max(r[0],r[2]);assert.ok(hi-lo<=3.00001);assert.ok(Math.floor((lo+1e-5)/10)===Math.floor((hi-1e-5)/10));assert.ok(hi%10<=4.00001);area+=(hi-lo)*.15;}assert.ok(Math.abs(area-1.8)<1e-5);
assert.deepEqual(paintStrips([[0,0],[0,0]]),[]);
const sample={kind:'road',tags:{lanes:'4'},paths:[[[0,0],[0,20]]]};assert.equal(explicitDivider([sample],(x,y)=>[x,y]).length,0,'lane count does not prove double yellow');
assert.equal(explicitDivider([{...sample,tags:{divider:'double_solid_line'}}],(x,y)=>[x,y]).length,2);
assert.equal(explicitDivider([{...sample,tags:{divider:'dashed_line',oneway:'yes'}}],(x,y)=>[x,y]).length,0);
const crossings=buildZebraCrossings(roads.features,{all:true});assert.ok(crossings.length>70);assert.ok(crossings.length>buildZebraCrossings(roads.features).length*5,'crossings extend beyond focus');
const before=JSON.stringify(paint),scene=new T.Scene(),ground={at:(x,z)=>12+x*.001+z*.002};
const start=performance.now(),group=addRoadPaint({T,scene,data:paint,ground});assert.equal(JSON.stringify(paint),before,'source geometry immutable');assert.equal(scene.children[0],group);assert.ok(group.children.length<300,'spatial batching');
let vertices=0;for(const m of group.children){const pos=m.geometry.attributes.position;vertices+=pos.count;assert.equal(m.castShadow,false);for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);assert.ok(Number.isFinite(x+y+z));assert.ok(Math.abs(y-ground.at(x,z)-.145)<.001);}}
const terrain=outerGroundGeometry({bbox:roads.bbox,coreBbox:roads.coreBbox,project,ground});assert.ok(terrain.length>10000);assert.ok(terrain.every(Number.isFinite));
// Navigation now reaches both the commercial core and the western residential street network.
const graph=buildRouteGraph(roads.features,{vehicle:true});assert.ok(graph.nodes.length>2000);const route=findRoute(graph,...project(121.5654,25.0338),...project(121.5570,25.0310));assert.ok(route&&route.length>500,'whole district vehicle graph');
console.log(JSON.stringify({roads:roads.features.length,red:paint.stats.red,yellow:paint.stats.yellow,zebras:crossings.length,drawCalls:group.children.length,vertices,buildMs:Math.round(performance.now()-start)}));
