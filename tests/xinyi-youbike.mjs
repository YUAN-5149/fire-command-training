import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {stationSnapshot} from '../scripts/import-xinyi-youbike.mjs';
import {stationPlacements,stationGeometry,addYouBikeStations} from '../dist/xinyi-youbike.js';
import {project} from '../dist/xinyi-street-world.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {drapeSite} from '../dist/eoc-detail.js';
const json=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const data=json('../dist/assets/xinyi-youbike.json'),roads=json('../dist/assets/xinyi-road-network.json');
assert.equal(data.stations.length,129);assert.equal(new Set(data.stations.map(s=>s.id)).size,129);assert.match(data.source.sha256,/^[a-f0-9]{64}$/);assert.ok(data.stations.every(s=>s.positionStatus==='official-point'&&s.layoutStatus==='unverified'));
assert.ok(data.stations.every(s=>!('available_rent_bikes' in s)&&!('available_return_bikes' in s)),'no stale rental counts masquerading as live');
const mock={sno:'a',sna:'YouBike2.0_測試',sarea:'信義區',longitude:121.56,latitude:25.03,Quantity:20,act:'1',ar:'地址'};
assert.equal(stationSnapshot([mock,{...mock,sarea:'其他區'}],{}).stations.length,1);
assert.throws(()=>stationSnapshot([mock,mock],{}),/duplicate/);assert.throws(()=>stationSnapshot([{...mock,latitude:0}],{}),/Invalid/);assert.throws(()=>stationSnapshot([{...mock,Quantity:-1}],{}),/Invalid/);
assert.equal(stationSnapshot([{...mock,Quantity:undefined,tot:5}],{}).stations[0].capacity,5);
const placements=stationPlacements(data,roads.features);for(const s of placements){const [x,z]=project(s.longitude,s.latitude);assert.equal(s.x,x);assert.equal(s.z,z);assert.ok(Number.isFinite(s.heading));assert.ok(s.dockCount<=6&&s.bikeCount<=3);}
const diagonal=stationPlacements({stations:[{...data.stations[0],longitude:121.5654,latitude:25.0338}]},[{kind:'road',paths:[[[121.5653,25.0339],[121.5655,25.0337]]]}])[0];assert.ok(diagonal.heading<0,'row follows source road without moving official point');
const geometries=stationGeometry();for(const g of Object.values(geometries)){assert.ok(g.getAttribute('position').array.every(Number.isFinite));assert.ok(g.boundingBox.min.y>=-.001);assert.ok(g.getAttribute('color').count===g.getAttribute('position').count);}
assert.ok(geometries.bike.boundingBox.max.z-geometries.bike.boundingBox.min.z<2.1);assert.ok(geometries.bike.getAttribute('position').count/3<4000,'bounded bike triangle budget');
const scene=new T.Scene(),ground={at:(x,z)=>10+x*.001+z*.002};const layer=addYouBikeStations({scene,data,features:roads.features,ground});
assert.equal(layer.group.children.length,3);assert.equal(layer.beacons.count,129);assert.equal(layer.docks.count,0);
const eoc=layer.records.find(s=>s.id==='500112017');assert.equal(eoc.name,'台北市災害應變中心');
layer.update(eoc);assert.ok(layer.stats.nearby>0);assert.equal(layer.stats.docks,layer.docks.count);assert.ok(layer.stats.docks<=layer.stats.nearby*6);assert.ok(layer.stats.bikes<=layer.stats.nearby*3);
for(const mesh of [layer.beacons,layer.docks,layer.bikes]){for(let i=0;i<mesh.count;i++){const m=new T.Matrix4();mesh.getMatrixAt(i,m);const p=new T.Vector3().setFromMatrixPosition(m);assert.ok(Math.abs(p.y-ground.at(p.x,p.z)-.025)<.001,'each dock/bike/marker rests on terrain');}assert.ok(Number.isFinite(mesh.boundingSphere.radius));}
assert.equal(layer.nearest(eoc.x,eoc.z).id,eoc.id);assert.ok(layer.markers(eoc.x,eoc.z).some(s=>s.label.includes('災害應變中心')));
const version=layer.bikes.instanceMatrix.version;layer.update({x:eoc.x+1,z:eoc.z});assert.equal(layer.bikes.instanceMatrix.version,version,'no rebatching each frame');
layer.setVisible(false);assert.equal(layer.markers(eoc.x,eoc.z).length,0);layer.update({x:100000,z:100000});assert.equal(layer.bikes.instanceMatrix.version,version,'hidden layer does no work');
layer.setVisible(true);layer.update({x:100000,z:100000});assert.equal(layer.bikes.count,0);assert.equal(layer.docks.count,0);
const b=fs.readFileSync(new URL('../dist/assets/taipei-eoc-core.glb',import.meta.url)),root=(await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;drapeSite(root,ground);
const nodes=[];root.traverse(o=>{if(/^(YouBike station|YouBike_station)$/.test(o.name))nodes.push(o);});assert.equal(nodes.length,1);assert.equal(layer.replaceLegacyEoc(root),1);assert.equal(nodes[0].visible,false,'one prior sketch hidden, not a duplicate station');assert.ok(root.children.length>0,'landmark retained');
const html=fs.readFileSync(new URL('../dist/xinyi-street.html',import.meta.url),'utf8'),main=fs.readFileSync(new URL('../dist/xinyi-street.js',import.meta.url),'utf8');assert.match(html,/xinyi-street.js\?v=[^"]*youbike/);for(const id of ['youBike','youBikeStation','youBikeLocate','youBikeStatus','youBikeStationDetail'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))??[]).length,1);assert.match(main,/youBike\?\.update\(camera.position\)/);assert.match(main,/settings.youBike/);
console.log('YouBike: 129 official points, 3 batches, terrain grounding, distance budget, toggle/navigation integration and real EOC de-duplication passed. Bike triangles: '+geometries.bike.getAttribute('position').count/3);
