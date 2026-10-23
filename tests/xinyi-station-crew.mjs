import assert from 'node:assert/strict';
import * as T from 'three';import {readFile} from 'node:fs/promises';
import {createStationCrew,STATION_CREW} from '../dist/xinyi-station-crew.js';
import {spawnPoint,project,buildHeightField,buildColliders} from '../dist/xinyi-street-world.js';
import {stationSurface,stationCollisionBuildings} from '../dist/xinyi-station-spawn.js';
import {footprintBuilding} from '../dist/landmarks-real.js';
import {load} from './load-aerial.mjs';import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {createXinyiAerial} from '../dist/xinyi-street-aerial.js';
const read=async name=>JSON.parse(await readFile('dist/assets/'+name,'utf8'));
const [hq,district,streets]=await Promise.all(['hq-anchor.json','district-xinyi.json','streets-xinyi.json'].map(read));
const buildings=[...district.buildings,footprintBuilding(hq)],ground=buildHeightField(buildings,district.bbox);ground.at=stationSurface(ground,project,hq);
const colliders=buildColliders(stationCollisionBuildings(buildings,hq),ground),spawn=spawnPoint(streets.features,[hq]),truck={...spawn.truck,v:0};
function person(root,rank){const body=new T.Group();root.add(body);const boots=[-1,1].map(x=>{const m=new T.Mesh(new T.BoxGeometry(.2,.2,.2));m.position.set(x*.1,.1,0);body.add(m);return m;});return {rank,body,boots,arms:[new T.Group(),new T.Group()],legs:[new T.Group(),new T.Group()]};}
const scene=new T.Scene(),team=createStationCrew({scene,createPerson:person,ground,colliders,spawn});
assert.deepEqual(team.people.map(p=>p.rank),['小隊長','隊員','隊員','隊員']);assert.equal(team.people.length,4);assert.equal(team.readyToDrive(),false);assert.equal(team.circles().length,4);
const aerial=createXinyiAerial({scene,source:await load(),createPerson:()=>{throw Error('must reuse two crew');},crewMembers:team.people.slice(1,3).map(p=>p.person),onCrewAssign:team.assignAerial,onCrewReturn:team.returnAerial,ground,obstacleIndex:[]});
assert(aerial.park(spawn.aerial));assert(aerial.frame.visible);assert.equal(aerial.state.phase,'idle');assert.equal(aerial.state.stationed,true);assert.equal(aerial.circles().length,3,'stowed supports do not block garage');assert(aerial.grounding.jacks.length===4);
// Actual stowed GLBs fit bay width/height; engine fits depth, ladder nose slightly outside.
for(const [file,pose,inside] of [['geo-fire-engine.glb',spawn.truck,true],['aerial-ladder.glb',spawn.aerial,false]]){
 const bytes=await readFile('dist/assets/'+file),loader=new GLTFLoader();loader.register(()=>({name:'headless-textures',loadTexture:()=>Promise.resolve(new T.Texture())}));const model=(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
 model.rotation.y=-Math.PI/2;const b=new T.Box3().setFromObject(model);assert(b.max.x-b.min.x<4.35);assert(b.max.y<4.27,'stowed vehicle fits open shutter housing');assert.equal(b.max.z-b.min.z<9.95,inside);
}
const update=(mode,leader=spawn,blockers=[...aerial.circles(),...[-2.4,0,2.4].map(o=>[truck.x-Math.sin(truck.heading)*o,truck.z-Math.cos(truck.heading)*o,1.45])])=>team.update(.05,{mode,truck,leader,blockers});
for(let i=0;i<1200&&!team.readyToDrive();i++){update('drive');for(const p of team.people)if(p.root.visible)assert(!colliders.resolve(p.x,p.z,.23).hit,'NPC always outside garage walls');}
assert(team.readyToDrive(),team.status());assert.equal(team.circles().length,0,'passengers are not road obstacles');assert(team.people.every(p=>!p.root.visible));
update('walk');assert.equal(team.circles().length,4);for(let i=0;i<250;i++)update('walk');
// Crew automatically follow on foot, then can reboard without replacing commander.
const leader={x:spawn.x-Math.sin(spawn.heading)*18,z:spawn.z-Math.cos(spawn.heading)*18};const before=team.people[0].root.position.clone();for(let i=0;i<400;i++)update('walk',leader);assert(team.people[0].root.position.distanceTo(before)>5,'NPC follow autonomously');
team.reset();const [first]=team.people,old={x:first.x,z:first.z};for(let i=0;i<200;i++)update('drive',spawn,[[first.x,first.z,100]]);assert(!team.readyToDrive());assert(Math.hypot(first.x-old.x,first.z-old.z)<1e-6,'blocked boarding never teleports');assert(team.status().includes('受阻'));
team.reset();assert.deepEqual(team.people.map(p=>[p.x,p.z]),spawn.crew.map(p=>[p.x,p.z]));assert.equal(team.circles().length,4);
// Use the real deployment/retraction timeline with the same two crew, then restore station parking.
const work=createXinyiAerial({scene:new T.Scene(),source:await load(),createPerson:()=>{throw Error('duplicate');},crewMembers:team.people.slice(1,3).map(p=>p.person),onCrewAssign:team.assignAerial,onCrewReturn:team.returnAerial,ground:{at:()=>0},obstacleIndex:[]});
work.park({x:25,z:30,heading:1});const parked=work.frame.position.clone(),rotation=work.frame.rotation.y;
const fireSite={x:0,z:0,nx:0,nz:1,base:0,floor:3,y:8.5};const result=work.check(fireSite,4,6);assert(result.ok,JSON.stringify(result.issues));assert(work.frame.position.distanceTo(parked)<1e-6,'check restores stationary display');assert.equal(work.frame.rotation.y,rotation);
assert(work.deploy(result,fireSite));assert.equal(team.circles().length,2);assert(!team.readyToDrive());assert(team.people.slice(1,3).every(p=>p.person.body.parent!==p.root));
for(let i=0;i<900&&work.state.phase!=='ready';i++){work.update(.05);update('walk');}assert.equal(work.state.phase,'ready');assert(work.retract());for(let i=0;i<900&&work.state.phase!=='parked';i++)work.update(.05);assert.equal(work.state.phase,'parked');assert(work.dismiss());assert.equal(team.circles().length,4);assert(team.people.every(p=>p.person.body.parent===p.root));assert.deepEqual(team.people.map(p=>p.rank),STATION_CREW);
assert(work.park({x:25,z:30,heading:1}));assert(work.frame.visible);assert(work.dismiss());assert.equal(work.circles().length,0);assert(!work.frame.visible);
console.log('Station crew: actual garage boarding, 4 passengers, blocked route, disembark/follow/reset, shared ladder timeline, original vehicle dimensions and stowed collision passed.');
