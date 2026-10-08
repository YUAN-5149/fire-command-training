import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildStreetDetail} from '../dist/geo-street-detail.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/streets-xinyi.json',import.meta.url)));
const before=JSON.stringify(data),detail=buildStreetDetail(data.features);
assert.equal(JSON.stringify(data),before);assert.ok(detail.paths>0);assert.ok(detail.position.every(Number.isFinite));assert.equal(detail.position.length/3,detail.uv.length/2);assert.ok(detail.position.length/3<20000);
for(const faces of Object.values(detail.groups))assert.ok(faces.every(i=>i>=0&&i<detail.position.length/3));
const line={width:8,kind:'road',tags:{},paths:[[[121.5654,25.0338],[121.5654,25.0339]]]};const m=buildStreetDetail([line]);for(let i=0;i<m.position.length;i+=3){assert.ok(Math.abs((m.position[i]-121.5654)*111320*Math.cos(25.03385*Math.PI/180))<=4.00001);assert.ok(Math.abs(m.position[i+2]-.037)<1e-10);}
assert.equal(buildStreetDetail([{...line,tags:{bridge:'yes'}}]).position.length,0);
assert.equal(buildStreetDetail([{...line,tags:{tunnel:'yes'}}]).position.length,0);
assert.equal(buildStreetDetail([{...line,paths:[[[121,25],[121,25.0001]]]}]).position.length,0);
console.log(`Street rendering: ${detail.paths} source paths, ${detail.position.length/3} vertices; source preservation, widths, heights, indices, focus and exclusions passed.`);
