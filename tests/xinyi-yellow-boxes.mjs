import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {yellowBoxRings,buildYellowBoxGeometry,addYellowBoxes} from '../dist/xinyi-yellow-boxes.js';
import {project} from '../dist/xinyi-street-world.js';
const d=JSON.parse(fs.readFileSync(new URL('../dist/assets/xinyi-yellow-boxes.json',import.meta.url))),saved=JSON.stringify(d);
assert.equal(d.imageryYear,2025);assert.ok(d.features.length>32);assert.equal(d.counts.imported,d.features.length);assert.equal(d.counts.visualReviewed,1648);assert.equal(d.counts.rawCandidates,1648);assert.equal(d.pending.length,d.counts.deferredBoundary);
const audit=JSON.parse(fs.readFileSync(new URL('../docs/sources/yellow-box-audit-20261023.json',import.meta.url)));assert.equal(audit.dispositions.length,1648);assert.equal(new Set(audit.dispositions.map(d=>d.candidate)).size,1648);assert.ok(audit.dispositions.every(d=>['imported','pending','duplicate','outside-district','rejected'].includes(d.status)));assert.equal(d.counts.imported+d.counts.deferredBoundary+d.counts.duplicateTraces+d.counts.outsideDistrict+d.counts.rejected,1648);assert.equal(audit.dispositions.filter(d=>d.status==='imported').length,d.features.length);
for(const dup of d.duplicates)assert.ok(d.features.some(f=>f.id===dup.sameFootprintAs));
for(const f of d.features){const i=+f.id.replace('ortho2025-','');assert.ok(audit.dispositions.some(d=>d.candidate===i&&d.status==='imported'));assert.ok(!d.pending.some(p=>p.candidate===i));}
assert.equal(d.coverage.tilesExpected,71);assert.equal(d.coverage.tilesDownloaded,71);assert.equal(d.coverage.tilesScanned,71);assert.equal(new Set(d.tiles.map(t=>t.sha256)).size,71,'unique imagery exports');
assert.ok(d.features.every(f=>f.lineWidth===null&&f.spacing===null&&f.currentStatus==='pending-current-site-check'));
const has=(p,q,tol=.001)=>{let sign=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],v=(b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]);if(Math.abs(v)<tol)continue;const s=Math.sign(v);if(sign&&sign!==s)return false;sign=s;}return true;};
for(const f of d.features){assert.match(f.sourceSha256,/^[a-f0-9]{64}$/);assert.ok(d.tiles.some(t=>t.file===f.sourceTile&&t.sha256===f.sourceSha256));assert.ok(f.polygon.length>=3);assert.ok(f.sourcePixels.flat().every(Number.isFinite));assert.ok(f.sourceTiles.length);for(const tile of f.sourceTiles)assert.ok(d.tiles.some(t=>t.file===tile.file&&t.sha256===tile.sha256));const poly=f.polygon.map(p=>project(...p));for(const ring of yellowBoxRings(poly,{angles:f.displayAngles})){assert.ok(ring.length>=3);for(const v of ring)assert.ok(has(poly,v),'entire paint ribbon must stay inside source boundary');}}
// Includes the station-near markings missed by strict grid-family filtering, with manual image review.
assert.ok(d.features.some(f=>f.id==='ortho2025-470'));
const quad=[[0,0],[8,1],[10,8],[1,10]],rings=yellowBoxRings(quad,{angles:[20,110]});assert.ok(rings.length>10);for(const r of rings)for(const p of r)assert.ok(has(quad,p));assert.equal(yellowBoxRings([[0,0],[0,0],[0,0]]).length,0);
assert.throws(()=>yellowBoxRings([[0,0],[10,0],[2,2],[10,10],[0,10]]),/Non-convex/);
const ground=(x,z)=>15+x*.001+z*.002,built=buildYellowBoxGeometry(d.features,ground);assert.equal(built.count,d.features.length);assert.ok(built.position.length>1000);for(let i=0;i<built.position.length;i+=3){const p=built.position;assert.ok(Number.isFinite(p[i]+p[i+1]+p[i+2]));assert.ok(Math.abs(p[i+1]-ground(p[i],p[i+2])-.128)<.001);}
assert.equal(buildYellowBoxGeometry([{...d.features[0],review:'pending'}],ground).count,0,'unreviewed geometry not imported');
const scene=new T.Scene(),result=addYellowBoxes({T,scene,data:d,ground:{at:ground}});assert.equal(result.group.children.length,1);assert.equal(result.group.children[0].castShadow,false);assert.equal(JSON.stringify(d),saved,'source positions immutable');
console.log('Yellow boxes:',built.count,'image-reviewed footprints; 71 unique source exports, explicit pending statuses, clipped paint strips, projected/draped geometry and unreviewed exclusion passed.');
