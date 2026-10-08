import fs from 'node:fs/promises';
import * as T from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {createActionScene} from '../dist/action-scene.js';
const dir=new URL('../dist/assets/',import.meta.url),manifest={};
function pack(json,bin){let j=Buffer.from(JSON.stringify(json));j=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);bin=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);const header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+j.length+bin.length,8);jh.writeUInt32LE(j.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,jh,j,bh,bin]);}
const loader=new GLTFLoader();loader.register(()=>({name:'headless-textures',loadTexture:()=>Promise.resolve(new T.Texture())}));
for(const [key,file] of [['engine','fire-engine.glb'],['ambulance','ambulance-detailed.glb'],['aerial','aerial-ladder.glb']]){
 const bytes=await fs.readFile(new URL(file,dir)),jlen=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jlen)),bin=bytes.subarray(28+jlen);
 let changed=0;for(const m of json.materials??[]){if(/beacon|warning|LED strip|red.*lens|emergency.*lens|red.*flasher/i.test(m.name||'')){m.pbrMetallicRoughness??={};m.pbrMetallicRoughness.baseColorFactor=[.57,.006,.003,1];m.emissiveFactor=[.8,.004,.002];changed++;}}
 const result=pack(json,bin),name='geo-'+file;await fs.writeFile(new URL(name,dir),result);
 const model=(await loader.parseAsync(result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength),'')).scene;const b=new T.Box3().setFromObject(model),size=b.getSize(new T.Vector3());
 manifest[key]={file:'assets/'+name,width:size.x,height:size.y,depth:size.z,headingOffset:90,length:size.x,span:size.z};console.log(key,size.toArray(),changed);
}
const action=createActionScene(new T.Scene());
for(const [key,rank] of [['commander','中隊長'],['leader','分隊長'],['squad','小隊長'],['crew','隊員']]){
 const root=new T.Group(),p=action.createPerson(root,rank);root.updateMatrixWorld(true);const json={asset:{version:'2.0',generator:'Existing fire-command-training character export'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[]},chunks=[];let offset=0;const mats=new Map();
 const box=new T.Box3();root.traverseVisible(o=>{if(o.isMesh){o.geometry.computeBoundingBox();box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));}});root.position.y=-box.min.y;root.updateMatrixWorld(true);
 function access(array,type,componentType,components){const buf=Buffer.from(array.buffer,array.byteOffset,array.byteLength);const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buf.length});chunks.push(buf);offset+=buf.length;const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}const a={bufferView:view,componentType,count:array.length/components,type};if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<array.length;i++) {a.min[i%3]=Math.min(a.min[i%3],array[i]);a.max[i%3]=Math.max(a.max[i%3],array[i]);}}json.accessors.push(a);return json.accessors.length-1;}
 root.traverseVisible(o=>{if(!o.isMesh)return;const g=o.geometry.clone().applyMatrix4(o.matrixWorld),m=o.material;if(!mats.has(m)){mats.set(m,json.materials.length);json.materials.push({pbrMetallicRoughness:{baseColorFactor:[m.color.r,m.color.g,m.color.b,1],metallicFactor:m.metalness??0,roughnessFactor:m.roughness??.7},doubleSided:true});}
 const primitive={attributes:{POSITION:access(g.attributes.position.array,'VEC3',5126,3),NORMAL:access(g.attributes.normal.array,'VEC3',5126,3)},material:mats.get(m)};if(g.index){const a=new Uint32Array(g.index.array);primitive.indices=access(a,'SCALAR',5125,1);}json.scenes[0].nodes.push(json.nodes.length);json.nodes.push({mesh:json.meshes.length});json.meshes.push({primitives:[primitive]});g.dispose();});
 json.buffers=[{byteLength:offset}];const file='geo-'+key+'.glb';await fs.writeFile(new URL(file,dir),pack(json,Buffer.concat(chunks)));const size=box.getSize(new T.Vector3());manifest[key]={file:'assets/'+file,width:size.x,height:size.y,depth:size.z,headingOffset:0,length:size.z,span:size.x};
}
await fs.writeFile(new URL('geo-models.json',dir),JSON.stringify(manifest,null,2));
