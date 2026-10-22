// 擷取自 slop-newyork 的車輛與行人（vendor/slop + slop-webgl.js）：幾何完整、骨架姿勢有限值、
// 注入的 GLSL 沒有「--常數」這類無法編譯的寫法、人群依距離分到近／遠兩層且不超量。
import assert from 'node:assert/strict';
import {BODY_SPECS,buildCarGeometry,CAR_PARTS} from '../dist/vendor/slop/actor-models.js';
import {buildPersonGeometry,PersonRig,STRIDE} from '../dist/vendor/slop/pedestrians.js';
import {createCarMaterialGL,PersonCrowdGL} from '../dist/slop-webgl.js';

const valid=g=>{const n=g.attributes.position.count;for(const v of g.attributes.position.array)assert(Number.isFinite(v));for(const i of g.index.array)assert(i<n);return n;};
for(const [k,spec] of Object.entries(BODY_SPECS)){
 const g=buildCarGeometry(spec),n=valid(g);assert(n>1500&&n<6000,k+' verts '+n);
 const parts=new Set(g.attributes.partId.array);for(const p of [CAR_PARTS.BODY,CAR_PARTS.WINDOW,CAR_PARTS.TYRE])assert(parts.has(p),k+' has part '+p);
 // 以 three.js 的 include 標記模擬編譯，檢查注入後的著色器
 const sh={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>\n#include <beginnormal_vertex>',
  fragmentShader:'#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <emissivemap_fragment>'};
 createCarMaterialGL(spec).onBeforeCompile(sh);
 for(const src of [sh.vertexShader,sh.fragmentShader]){assert(!/--\s*\d/.test(src),k+' GLSL has "--<number>"');assert(!/\bNaN\b|undefined/.test(src),k+' GLSL has NaN/undefined');}
 assert(sh.fragmentShader.includes('pdSide'),k+' plate/door shapes injected');}
for(const d of [1,0])assert(valid(buildPersonGeometry(d))>300);

const r=new PersonRig({seed:.3});let x=0;for(let i=0;i<90;i++){x+=1.3/30;r.update(1/30,x,0,Math.PI/2,()=>0);}
assert.equal(r.pose.length,STRIDE*4);for(const v of r.pose)assert(Number.isFinite(v));
assert(Math.abs(r.x-x)<.5,'rig follows its target');

const crowd=new PersonCrowdGL(3,{farDistance:30,castShadow:false});
crowd.begin();for(const dist of [5,10,50,60,70,80])crowd.add(r,dist);crowd.end();
assert.deepEqual(crowd.lods.map(l=>l.g.instanceCount),[2,3],'near/far split, capped at max');
console.log('slop traffic ok:',Object.keys(BODY_SPECS).join('/'),'person stride',STRIDE);
