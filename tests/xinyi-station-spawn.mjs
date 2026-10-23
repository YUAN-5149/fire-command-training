import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnPoint,project,unproject,buildHeightField,buildColliders} from '../dist/xinyi-street-world.js';
import {footprintBuilding,localToLonLat} from '../dist/landmarks-real.js';
import {stationSurface,stationCollisionBuildings,XINYI_STATION} from '../dist/xinyi-station-spawn.js';
const load=async p=>JSON.parse(await readFile(new URL('../dist/'+p,import.meta.url),'utf8'));
const [district,streets,hq]=await Promise.all([load('assets/district-xinyi.json'),load('assets/streets-xinyi.json'),load('assets/hq-anchor.json')]);
const buildings=[...district.buildings,footprintBuilding(hq)],ground=buildHeightField(buildings,district.bbox),baseAt=ground.at.bind(ground);ground.at=stationSurface(ground,project,hq);const colliders=buildColliders(stationCollisionBuildings(buildings,hq),ground),spawn=spawnPoint(streets.features,[hq]);
assert.equal(spawn.station,'信義分隊');assert.equal(spawn.address,'臺北市信義區忠孝東路5段32號');assert.equal(XINYI_STATION.modelPlacementVerified,false);
assert.ok(Math.abs(spawn.heading-hq.heading*Math.PI/180)<1e-10);
const truckPoint=localToLonLat(hq,61.6,-32),actual=unproject(spawn.truck.x,spawn.truck.z);assert.ok(Math.hypot(actual[0]-truckPoint[0],actual[1]-truckPoint[1])<1e-9);
assert.ok(Math.hypot(spawn.x-spawn.truck.x,spawn.z-spawn.truck.z)>2.9,'crew clear of truck');assert.equal(colliders.resolve(spawn.x,spawn.z,.4).hit,false);
for(const vehicle of [spawn.truck,spawn.support])for(let t=0;t<=25;t+=.5)for(const offset of [-2.4,0,2.4]){const d=t+offset,p={x:vehicle.x-Math.sin(spawn.heading)*d,z:vehicle.z-Math.cos(spawn.heading)*d};assert.equal(colliders.resolve(p.x,p.z,1.45).hit,false,'garage and apron departure path stays clear of walls');}
assert.ok(ground.at(spawn.x,spawn.z)>=baseAt(spawn.x,spawn.z));assert.equal(ground.at(0,0),baseAt(0,0),'no unrelated terrain changes');
const fallback=spawnPoint(streets.features);assert.ok(Math.hypot(fallback.x-spawn.x,fallback.z-spawn.z)<.001,'landmark load failure retains station location');
for(const [x,y] of [[59.425,-32],[63.775,-32],[61.6,-36.95],[64.4,-27],[30,-40]]){const p=project(...localToLonLat(hq,x,y));assert.ok(colliders.resolve(...p,.4).hit,'garage wall / pier retains collision');}
const originals=JSON.stringify(buildings);stationCollisionBuildings(buildings,hq);assert.equal(JSON.stringify(buildings),originals,'GIS source remains unchanged');
console.log('Xinyi station: station identity, garage coordinates, outward heading, person/truck clearance, 25 m departure path and existing surface passed.');
