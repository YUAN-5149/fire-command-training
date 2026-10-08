import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFacade} from '../dist/geo-target.js';
const d=JSON.parse(fs.readFileSync(new URL('../dist/assets/ximen-target.json',import.meta.url)));
const m=buildFacade(d),p=m.position;
assert.equal(d.objectId,17697);assert(Math.abs(d.roofElevation-d.groundElevation-d.height)<.0001);
assert(d.front.width>35&&d.front.width<36);assert(p.length>1000&&p.length%3===0);
let maximumOffset=0;
for(let i=0;i<p.length;i+=3){
 const v=p.slice(i,i+3);assert(v.every(Number.isFinite));assert(v[2]>=d.front.a[2]-1e-6&&v[2]<=d.front.a[2]+d.front.height+1e-6);
 const x=(v[0]-d.front.a[0])*100850,y=(v[1]-d.front.a[1])*110574;
 const n=d.front.normal,off=x*n[0]+y*n[1],u=x*n[1]-y*n[0];
 assert(off>=.0349&&off<=.1801);assert(u>=-.0001&&u<=d.front.width+.0001);maximumOffset=Math.max(maximumOffset,off);
}
for(const c of m.components){assert(c.faces.length%3===0);for(const n of c.faces)assert(Number.isInteger(n)&&n>=0&&n<p.length/3);}
assert(fs.existsSync(new URL('../dist/assets/target-street-reference.png',import.meta.url)));
console.log('17697: verified height, front bounds, finite mesh indices, reference asset; facade offset ≤ '+maximumOffset.toFixed(2)+' m.');
