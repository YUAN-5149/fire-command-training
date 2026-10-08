// 信義街景導航：路網連通、路線長度不短於直線、駕駛遵守單行道、路名標籤。
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {project} from '../dist/xinyi-street-world.js';
import {buildRouteGraph,findRoute,nearestNode,roadLabels} from '../dist/xinyi-street-nav.js';
const streets=JSON.parse(await fs.readFile(new URL('../dist/assets/streets-xinyi.json',import.meta.url),'utf8')),f=streets.features;
const walk=buildRouteGraph(f),drive=buildRouteGraph(f,{vehicle:true});
assert.ok(walk.nodes.length>drive.nodes.length&&drive.nodes.length>100);
// 跨區兩點：西南角附近到東北角附近
const r=findRoute(walk,-400,350,380,-380);assert.ok(r,'walk route');const straight=Math.hypot(780,730);assert.ok(r.length>=straight*.98&&r.length<straight*2,'route length '+r.length);
for(let i=1;i<r.points.length;i++)assert.ok(Math.hypot(r.points[i][0]-r.points[i-1][0],r.points[i][1]-r.points[i-1][1])<300);
const d=findRoute(drive,-400,350,380,-380);assert.ok(d&&d.length>=straight*.98,'drive route');
// 單行道：駕駛圖中 a→b 存在、b→a 不存在
const one=f.find(w=>w.kind==='road'&&w.tags.oneway==='yes'&&w.paths[0].length>=2);assert.ok(one);
const [a,b]=one.paths[0].slice(0,2).map(p=>{const [x,z]=project(p[0],p[1]);return nearestNode(drive,x,z);});
assert.ok(drive.adj[a].some(([v])=>v===b),'forward edge');assert.ok(!drive.adj[b].some(([v])=>v===a),'no reverse edge on oneway');
const labels=roadLabels(f);assert.ok(labels.length>=10&&labels.some(l=>l.name==='松智路'));for(const l of labels)assert.ok(Math.abs(l.angle)<=Math.PI/2+1e-9);
console.log(`Navigation: ${walk.nodes.length} walk / ${drive.nodes.length} drive nodes; cross-area route ${Math.round(r.length)} m walk, ${Math.round(d.length)} m drive; oneway respected; ${labels.length} road labels.`);
