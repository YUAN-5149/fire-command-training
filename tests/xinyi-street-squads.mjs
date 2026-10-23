import assert from 'node:assert/strict';
import {SQUAD,squadCrew,squadDeparturePath,stagingPoses,homePositions,offsetRight,along,polyLength,pickFloor,graphEdges} from '../dist/xinyi-street-squads.js';

// 分隊人員：5 人含分隊長、小隊長；4 人無分隊長。
assert.deepEqual(squadCrew(5),['分隊長','小隊長','隊員','隊員','隊員']);assert.deepEqual(squadCrew(4),['小隊長','隊員','隊員','隊員']);
assert.equal(SQUAD.count,3);assert.equal(SQUAD.vehicles,2);
// 方格路網（每 40 m），起火面朝南（nz=+1）位於 (0,-10)。
const nodes=[],adj=[],idx=(i,j)=>i*7+j;for(let i=0;i<7;i++)for(let j=0;j<7;j++){nodes.push({x:(j-3)*40,z:(i-3)*40});adj.push([]);}
for(let i=0;i<7;i++)for(let j=0;j<7;j++){if(j<6){adj[idx(i,j)].push([idx(i,j+1),40]);adj[idx(i,j+1)].push([idx(i,j),40]);}if(i<6){adj[idx(i,j)].push([idx(i+1,j),40]);adj[idx(i+1,j)].push([idx(i,j),40]);}}
const graph={nodes,adj},site={x:0,z:-10,nx:0,nz:1};
assert.equal(graphEdges(graph).length,7*6*2);
const block=(x,z)=>x>-15&&x<15&&z>-30&&z<-10;// 起火建物量體
const free=(x,z,r)=>!block(x,z)&&!block(x+r,z)&&!block(x-r,z)&&!block(x,z+r)&&!block(x,z-r);
const poses=stagingPoses(site,graph,free,6);
assert.equal(poses.length,6,'6 部車都有停車點');
for(const p of poses){assert(p.dist>=SQUAD.stagingMin&&p.dist<=SQUAD.stagingMax,'距離 '+p.dist);assert(free(p.x,p.z,1.4));
 // 順向：停車點在行車方向右側（車道中心線往右偏移）。
 const rx=Math.cos(p.heading),rz=-Math.sin(p.heading);const onLineX=p.x-rx*SQUAD.laneOffset,onLineZ=p.z-rz*SQUAD.laneOffset;assert(Math.abs(onLineX%40)<1e-6||Math.abs(onLineZ%40)<1e-6,'偏移前在道路中心線上');}
for(let i=0;i<poses.length;i++)for(let j=i+1;j<poses.length;j++)assert(Math.hypot(poses[i].x-poses[j].x,poses[i].z-poses[j].z)>=SQUAD.spacing,'停車點間距');
// 既有車輛（中隊長的車）旁不重疊
const busy=stagingPoses(site,graph,free,2,{existing:[{x:poses[0].x,z:poses[0].z}]});assert(busy.every(p=>Math.hypot(p.x-poses[0].x,p.z-poses[0].z)>=SQUAD.spacing));
// 駐地：3 個、彼此分散、距離在範圍內（此小路網最遠約 170 m，放寬範圍測試）。
const homes=homePositions(site,graph,3,{min:60,max:180});assert.equal(homes.length,3);for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)assert(Math.hypot(homes[i].x-homes[j].x,homes[i].z-homes[j].z)>=100);
// 車道偏移與取樣
const line=[[0,0],[0,-40],[40,-40]],off=offsetRight(line,2);assert.deepEqual(off[0],[0,0]);assert.deepEqual(off[2],[40,-40]);assert(off[1][0]>0,'往北行駛時右側是東');
assert.equal(polyLength(line),80);const a=along(line,20);assert(Math.abs(a.z+20)<1e-9&&!a.done);assert(Math.abs(a.heading)<1e-9,'朝北 heading 0');const e=along(line,999);assert(e.done&&e.x===40);
// 室內任務樓層
const ctx={fireFloor:4,floors:[1,2,3,4,5],burning:{4:.8,5:.3,3:0},assigned:[]};
assert.equal(pickFloor('attack',ctx),4);assert.equal(pickFloor('attack',{...ctx,assigned:[{task:'attack',floor:4}]}),5);assert.equal(pickFloor('attack',{...ctx,burning:{}}),null);
assert.equal(pickFloor('search',ctx),5);assert.equal(pickFloor('search',{...ctx,assigned:[{task:'search',floor:5}]}),4);assert.equal(pickFloor('search',{...ctx,assigned:[5,4,3,2,1].map(f=>({task:'search',floor:f}))}),null);
console.log('xinyi-street-squads: ok');

for(const route of [null,[[56,-15],[56,0],[80,0]]]){const p=squadDeparturePath({x:56,z:-32,stationExit:{x:56,z:-15},pose:{x:80,z:0}},route);assert.deepEqual(p.slice(0,2),[[56,-32],[56,-15]]);assert.deepEqual(p.at(-1),[80,0]);assert(p.slice(2).every(q=>q[1]>=-15),'does not return through garage rear wall');}
