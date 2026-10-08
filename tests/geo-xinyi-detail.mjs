import assert from 'node:assert/strict';
import fs from 'node:fs';
import {focus,focusedBuilding,buildXinyiDetail} from '../dist/geo-xinyi-detail.js';
import {buildDistrictBatch} from '../dist/geo-district.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/district-xinyi.json',import.meta.url)));
const near=data.buildings.filter(focusedBuilding),far=data.buildings.filter(b=>!focusedBuilding(b));
assert(near.length>0&&far.length>0);
let count=0;
for(const building of near){const mesh=buildXinyiDetail([building]),points=[...building.roofs,...building.walls.flatMap(w=>[w.a,w.b,[w.a[0],w.a[1],w.a[2]+w.h],[w.b[0],w.b[1],w.b[2]+w.h]])];
 const bounds=[0,1,2].map(i=>[Math.min(...points.map(p=>p[i])),Math.max(...points.map(p=>p[i]))]);
 assert.equal(mesh.uv.length/2,mesh.position.length/3);assert.equal(mesh.color.length/4,mesh.position.length/3);
 for(const f of Object.values(mesh.groups)){assert.equal(f.length%3,0);for(const index of f)assert(index>=0&&index<mesh.position.length/3);}
 for(let i=0;i<mesh.position.length;i+=3){for(let k=0;k<3;k++){const value=mesh.position[i+k],tolerance=k===0?.181/100850:k===1?.181/110574:.181;assert(Number.isFinite(value));assert(value>=bounds[k][0]-tolerance&&value<=bounds[k][1]+tolerance,'Keep appearance inside source bounds plus 0.18 m skin');}}
 count+=mesh.position.length/3;
}
count+=buildDistrictBatch(far).position.length/3;
assert(count<4000000,'Combined detail and distant district must fit existing geometry budget');
assert.equal(focus.radius,250);
const sample=data.buildings.find(b=>b.id===357399),wall=sample.walls[8],sampleMesh=buildXinyiDetail([sample]);
assert(sampleMesh.groups.screen.length>0);
for(const index of new Set(sampleMesh.groups.screen)){
 const lon=sampleMesh.position[index*3],lat=sampleMesh.position[index*3+1],z=sampleMesh.position[index*3+2];
 const dx=(lon-wall.a[0])*100850,dy=(lat-wall.a[1])*110574;
 assert(Math.abs(dx*wall.n[0]+dy*wall.n[1]-.09)<.02,'Photo-reference screen must stay on the selected official wall');
 assert(z>=wall.a[2]&&z<=wall.a[2]+wall.h);
}
assert.equal(buildXinyiDetail(near.filter(b=>b.id!==357399)).groups.screen.length,0,'Do not apply the sample facade to unrelated buildings');
const signCentres={};
for(const kind of ['maxMaraSign','pradaSign']){
 const indices=[...new Set(sampleMesh.groups[kind])];assert.equal(indices.length,4);
 for(const index of indices){
  const dx=(sampleMesh.position[index*3]-wall.a[0])*100850,dy=(sampleMesh.position[index*3+1]-wall.a[1])*110574;
  assert(Math.abs(dx*wall.n[0]+dy*wall.n[1]-.175)<.02,'Sign studies must stay on selected wall skin');
 }
 signCentres[kind]=indices.reduce((sum,index)=>sum+sampleMesh.position[index*3+1],0)/indices.length;
 assert.equal(buildXinyiDetail(near.filter(b=>b.id!==357399)).groups[kind].length,0);
}
assert(signCentres.maxMaraSign>signCentres.pradaSign,'Keep official floor-plan north/south shop order');
console.log(`Xinyi: ${near.length} refined volumes, ${count} total vertices; source bounds, UVs, indices and memory budget passed.`);
