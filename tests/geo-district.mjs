import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildDistrictBatch,districtRenderer} from '../dist/geo-district.js';
assert.equal(districtRenderer().field,'H');
for(const place of ['ximen','xinyi']){
 const d=JSON.parse(fs.readFileSync(new URL('../dist/assets/district-'+place+'.json',import.meta.url)));
 assert(d.buildings.length>100);let count=0,faces=0;
 for(let i=0;i<d.buildings.length;i+=60){const group=d.buildings.slice(i,i+60),mesh=buildDistrictBatch(group);assert.equal(mesh.position.length/3,mesh.color.length/4);assert.equal(mesh.faces.length%3,0);count+=mesh.position.length/3;faces+=mesh.faces.length/3;
  for(const n of mesh.position)assert(Number.isFinite(n));
  for(const n of mesh.faces)assert(n>=0&&n<mesh.position.length/3);
  for(const building of group){assert.equal(building.roofs.length%3,0);for(const wall of building.walls){assert(wall.w>=1&&wall.h>=1);assert(Math.abs(Math.hypot(...wall.n)-1)<.001);if(building.id===17697)assert(!(wall.n[0]<-.7&&wall.w>30));}}
 }
 assert(count<4000000,'Keep each district below the geometry memory budget');
 console.log(place,d.buildings.length,'official volumes;',count,'vertices;',faces,'triangles; target frontage preserved');
}
