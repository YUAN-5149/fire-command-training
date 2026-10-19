import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFacadeBatch,facadeProps,styleOf,STYLE} from '../dist/xinyi-facades.js';
import {project} from '../dist/xinyi-street-world.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+f,import.meta.url)));
const district=read('district-xinyi.json'),data=read('building-styles-xinyi.json'),styles=data.buildings;
// 每棟官方量體都有外觀分類，且各類都有
const ids=district.buildings.filter(b=>b.walls.length).map(b=>String(b.id));
assert(ids.filter(id=>styles[id]).length/ids.length>.99,'almost every LOD1 volume has a style');
for(const [style,levels,shop,colour] of Object.values(styles)){assert(style>=0&&style<=6);assert(levels>=1&&levels<120);assert(shop===0||shop===1);assert.match(colour,/^#[0-9a-f]{6}$/i);}
const counts=[0,1,2,3,4,5,6].map(s=>Object.values(styles).filter(v=>v[0]===s).length);
assert(counts[0]>300&&counts[1]>300&&counts[3]>100,'old apartments, residential towers and offices present');
assert(Object.values(styles).filter(v=>v[2]).length>200,'ground-floor shops present');
assert.match(data.source,/OpenStreetMap/);
// 立面：每面牆一個四邊形，屬性長度一致；整區頂點遠低於舊的逐窗網格
const batch=buildFacadeBatch(district.buildings,styles),n=batch.position.length/3;
assert.equal(batch.fuv.length/2,n);assert.equal(batch.fac.length/4,n);assert.equal(batch.fac2.length/2,n);assert.equal(batch.color.length/4,n);
for(const i of batch.index)assert(i>=0&&i<n);
assert(n<400000,'whole-district facades stay within 400k vertices');
for(let i=0;i<batch.fac.length;i+=4){const code=batch.fac[i];assert(code===STYLE.ROOF||(code%10>=0&&code%10<=6));assert(batch.fac[i+1]>0);}
assert.equal(styleOf({},{id:1,walls:[{h:12}]}).style,STYLE.OLD);
// 小物件：數量有上限，且都落在信義範圍內
const props=facadeProps(district.buildings,styles,{project});
const [x0,z1]=project(district.bbox[0],district.bbox[1]),[x1,z0]=project(district.bbox[2],district.bbox[3]);
for(const [kind,list] of Object.entries(props)){
 assert(list.length<=30000,kind+' capped');
 for(const p of list){assert(p.x>x0-60&&p.x<x1+60&&p.z>z0-60&&p.z<z1+60,kind+' inside district');assert(Number.isFinite(p.y)&&p.sx>0&&p.sy>0&&p.sz>0);}
}
assert(props.ac.length>1000&&props.tank.length>300&&props.sign.length>100);
console.log('facades',n,'vertices; props',Object.fromEntries(Object.entries(props).map(([k,v])=>[k,v.length])));
