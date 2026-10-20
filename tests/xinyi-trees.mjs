// 行道樹（xinyi-trees.js）：三種樹形的幾何完整、尺寸合理、頂點數有上限；實例參數穩定且在範圍內。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {mergeGeometries,mergeVertices} from '../dist/vendor/BufferGeometryUtils.js';
import {TREE_KINDS,treeInstances,buildTreeGeometry} from '../dist/xinyi-trees.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/assets/street-furniture-xinyi.json',import.meta.url)));
const out={};
for(const kind of Object.keys(TREE_KINDS)){
 const g=buildTreeGeometry(T,{mergeGeometries,mergeVertices},kind),p=g.attributes.position;
 assert(g.attributes.normal&&g.attributes.color,'normals and vertex colours');
 assert.equal(g.attributes.color.count,p.count);
 g.computeBoundingBox();const b=g.boundingBox;
 assert(b.min.y>-.01&&b.max.y>5&&b.max.y<11,kind+' height '+b.max.y);
 assert(b.max.x-b.min.x>3&&b.max.x-b.min.x<11,kind+' crown width');
 assert(p.count<12000,kind+' vertex budget '+p.count);
 for(let i=0;i<p.count;i++)assert(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));
 // 葉比樹幹綠（葉色 g>r），樹幹偏褐（r>g 不成立時至少不全是綠）
 let leaf=0;const c=g.attributes.color;for(let i=0;i<c.count;i++)if(c.getY(i)>c.getX(i)*1.1)leaf++;
 assert(leaf/c.count>.6,kind+' mostly foliage');
 out[kind]=p.count;
}
const a=treeInstances(data.trees),b=treeInstances(data.trees);
assert.deepEqual(a,b,'instances are deterministic');
assert.equal(a.length,data.trees.length);
const kinds=new Set(a.map(t=>t.kind));assert.equal(kinds.size,3,'all three tree kinds used');
for(const t of a)assert(t.s>=.8&&t.s<=1.2&&t.ry>=0&&t.ry<Math.PI*2&&TREE_KINDS[t.kind]);
console.log('trees',out,'instances',a.length);
