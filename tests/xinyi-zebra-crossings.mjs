import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {buildZebraSurfaces,addZebraCrossings} from '../dist/xinyi-zebra-crossings.js';
const source=JSON.parse(fs.readFileSync(new URL('../dist/assets/xinyi-road-network.json',import.meta.url))),before=JSON.stringify(source);
const ground=(x,z)=>10+x*.003+z*.001;
const data=buildZebraSurfaces(source.features,{groundAt:ground});
assert.equal(data.mapped.ids.length,100);assert.ok(data.review.ids.length>500);
const features=new Map(source.features.map(f=>[f.id,f]));
for(const id of data.mapped.ids)assert.equal(features.get(id).tags['crossing:markings'],'zebra');
for(const id of data.review.ids)assert.notEqual(features.get(id).tags['crossing:markings'],'zebra');
assert.ok(data.review.ids.includes(1456398789),'mapped crossing near Zhuangjing is visible as pending, not silently omitted');
for(const layer of Object.values(data))for(const c of ['black','white']){const p=layer[c];assert.ok(p.length>0&&p.length%9===0);for(let i=0;i<p.length;i+=3){assert.ok(Number.isFinite(p[i]+p[i+1]+p[i+2]));assert.ok(Math.abs(p[i+1]-ground(p[i],p[i+2])-(c==='white'?.12:.116))<.001);}}
assert.equal(JSON.stringify(source),before,'source position and width preserved');
const f={id:1,kind:'crossing',width:2,tags:{'crossing:markings':'zebra'},paths:[[[0,0],[.8,0],[2.2,0]]]};
const sample=buildZebraSurfaces([f],{projector:(x,z)=>[x,z]});
// White stripes at 0..0.55 and 1.1..1.65, with dark gaps; phase remains continuous over the 0.8m vertex.
let whiteArea=0;for(let i=0;i<sample.mapped.white.length;i+=18){const p=sample.mapped.white.slice(i,i+18),xs=[p[0],p[3],p[6],p[9],p[12],p[15]],lo=Math.min(...xs),hi=Math.max(...xs);whiteArea+=(hi-lo)*2;assert.ok(Math.floor((lo+1e-5)/1.1)===Math.floor((hi-1e-5)/1.1));assert.ok(hi-Math.floor((lo+1e-5)/1.1)*1.1<=.55001);}
assert.ok(Math.abs(whiteArea-2.2)<.0001,'alternating equal white and dark lengths');
for(const overrides of [{tags:{'crossing:markings':'no'}},{tags:{crossing:'unmarked'}},{tags:{bridge:'yes'}},{tags:{tunnel:'yes'}},{kind:'walk'}]){const result=buildZebraSurfaces([{...f,...overrides}],{projector:(x,z)=>[x,z]});assert.equal(result.mapped.ids.length+result.review.ids.length,0);}
const scene=new T.Scene(),out=addZebraCrossings({T,scene,features:source.features,ground:{at:ground}});
assert.equal(out.root.children.length,2);assert.equal(out.groups.mapped.children.length,2);assert.equal(out.groups.review.children.length,2);
for(const g of Object.values(out.groups))for(const m of g.children){assert.equal(m.castShadow,false);assert.ok(m.geometry.attributes.normal.getY(0)>.99,'stripe normal faces sky');}
out.groups.review.visible=false;assert.ok(out.groups.mapped.visible,'pending style toggle independent');
console.log('Zebra crossings:',out.counts,'four batched black/white meshes; source preservation, raised surface visibility, alternating stripes and pending/explicit filtering passed.');
