import assert from 'node:assert/strict';
import fs from 'node:fs';
import {offsetPoint, rectangle, overlaps} from '../dist/geo-deployment.js';
for(const point of [{longitude:121.5654,latitude:25.0338},{longitude:121.5077,latitude:25.0421}]){
 const a={point,width:3,length:10,heading:0};
 assert(overlaps(a,{...a,point:offsetPoint(point,2.9,0)}));
 assert(!overlaps(a,{...a,point:offsetPoint(point,3.1,0)}));
 assert(!overlaps(a,{...a,point:offsetPoint(point,0,10.1)}));
 assert(overlaps(a,{...a,heading:90,point:offsetPoint(point,5,0)}));
 assert(!overlaps(a,{...a,heading:90,point:offsetPoint(point,7,0)}));
 assert(rectangle(a).every(p=>Number.isFinite(p.longitude)&&Number.isFinite(p.latitude)));
 for(let heading=0;heading<360;heading+=5){const b={...a,heading,point:offsetPoint(point,4,4)};assert.equal(overlaps(a,b),overlaps(b,a));}
}
const models=JSON.parse(fs.readFileSync(new URL('../dist/assets/geo-models.json',import.meta.url)));
for(const [key,m] of Object.entries(models)){
 const buffer=fs.readFileSync(new URL('../dist/'+m.file,import.meta.url));
 assert.equal(buffer.toString('ascii',0,4),'glTF');assert.equal(buffer.readUInt32LE(4),2);assert.equal(buffer.readUInt32LE(8),buffer.length);
 const gltf=JSON.parse(buffer.toString('utf8',20,20+buffer.readUInt32LE(12)));
 assert(gltf.meshes.length>0);assert(gltf.scenes.length>0);
 assert([m.width,m.height,m.depth].every(n=>Number.isFinite(n)&&n>0));
 if(['commander','leader','squad','crew'].includes(key))assert(m.height>1.6&&m.height<2);
}
assert(models.aerial.length>models.engine.length);
console.log('Taipei metre geometry, collision rotation/symmetry, and seven GLB assets passed.');
