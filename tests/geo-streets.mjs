import assert from 'node:assert/strict';
import fs from 'node:fs';
import {metres,pointAlong,pathLength} from '../dist/geo-streets.js';
const path=[[121.5,25],[121.501,25],[121.501,25.001]];
assert.equal(pointAlong(path,0).longitude,121.5);
assert.equal(pointAlong(path,1e6).latitude,25.001);
assert(Math.abs(pointAlong(path,5).heading-90)<.001);
assert(Math.abs(pointAlong(path,pathLength(path)-5).heading)<.001);
assert(metres(path[0],path[1])>100&&metres(path[0],path[1])<102);
for(const place of ['xinyi','ximen']){
 const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/streets-'+place+'.json',import.meta.url)));
 assert(data.features.length>500);
 const ids=new Set();
 for(const f of data.features){
  assert(!ids.has(f.id));ids.add(f.id);assert(f.width>0&&f.width<=45);
  assert(['tag','estimate'].includes(f.widthSource));
  if(f.widthSource==='tag')assert(f.tags.width);
  if(f.kind==='sidewalk')assert.equal(f.tags.footway,'sidewalk');
  for(const line of f.paths){assert(line.length>=2);assert(pathLength(line)>0);for(const [x,y] of line){assert(x>=data.bbox[0]-1e-7&&x<=data.bbox[2]+1e-7&&y>=data.bbox[1]-1e-7&&y<=data.bbox[3]+1e-7);}}
 }
 console.log(place+': '+ids.size+' source ways, bounded coordinates and width provenance verified');
}
