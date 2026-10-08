import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {walkRoutes,closestWalkRoute,advanceWalk,walkFocus} from '../dist/geo-streetwalk.js';
import {metres,pointAlong} from '../dist/geo-streets.js';
const data=JSON.parse(await readFile(new URL('../dist/assets/streets-xinyi.json',import.meta.url)));
const routes=walkRoutes(data.features);assert.ok(routes.length>10);
assert.equal(new Set(routes.map(r=>r.id)).size,routes.length);
for(const r of routes){assert.ok(['sidewalk','walk','crossing'].includes(r.kind));assert.ok(r.path.every(p=>metres(p,[walkFocus.longitude,walkFocus.latitude])<=walkFocus.radius));const original=data.features.find(f=>f.id===r.osmId);assert.ok(original.paths.some(p=>JSON.stringify(p)===JSON.stringify(r.path)));assert.equal(advanceWalk(r,0,-3).along,0);assert.equal(advanceWalk(r,r.length,3).along,r.length);}
const near=closestWalkRoute(routes,[121.56562,25.03387]);assert.ok(near&&near.distance<30);const p=pointAlong(near.route.path,near.along);assert.ok(metres([p.longitude,p.latitude],[121.56562,25.03387])<30);
const invalid=walkRoutes([{id:1,kind:'walk',tags:{highway:'steps'},paths:[[[121.5654,25.0338],[121.5654,25.034]]]}]);assert.equal(invalid.length,0);
console.log('Streetwalk: '+routes.length+' original OSM walking paths, radius boundary, nearest point, endpoint clamping, and no assumed stairs verified.');
