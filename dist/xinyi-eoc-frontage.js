import * as T from 'three';
import {project} from './xinyi-street-world.js';
export const EOC_PHOTO_REVIEW={stationId:'500112017',photoDate:'2025-01',status:'photo-layout-dimensions-unmeasured',rowNorth:-6.8,front:[0,-8,64,0],plaza:[37.6,0,64,44],trees:Array.from({length:9},(_,i)=>2+i*7)};
export function eocWorld(anchor,x,north){const [ox,oz]=project(anchor.lon,anchor.lat),h=anchor.heading*Math.PI/180;return [ox+Math.cos(h)*x-Math.sin(h)*north,oz-Math.sin(h)*x-Math.cos(h)*north];}
export function eocLocal(anchor,x,z){const [ox,oz]=project(anchor.lon,anchor.lat),h=anchor.heading*Math.PI/180,dx=x-ox,dz=z-oz;return [Math.cos(h)*dx-Math.sin(h)*dz,-Math.sin(h)*dx-Math.cos(h)*dz];}
export function frontageSlots(capacity=53){const candidates=[];for(let x=.5;x<=63.5;x+=.75)if(EOC_PHOTO_REVIEW.trees.every(t=>Math.abs(t-x)>=1.05))candidates.push(x);if(capacity>candidates.length)throw Error('Photo frontage cannot fit requested capacity');
 return Array.from({length:capacity},(_,i)=>({x:candidates[Math.round(i*(candidates.length-1)/Math.max(1,capacity-1))],z:-EOC_PHOTO_REVIEW.rowNorth,occupied:i%3===1}));
}
// Convex half-plane clipping. Triangulate original greens before subtraction so concave areas stay valid.
function split(poly,axis,value,sign){const inside=[],outside=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-value)*sign,db=(b[axis]-value)*sign;(da>=0?inside:outside).push(a);if((da>=0)!==(db>=0)){const t=da/(da-db),p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];inside.push(p);outside.push(p);}}return {inside,outside};}
function subtract(poly,box){let pending=poly,out=[];for(const [axis,value,sign] of [[0,box[0],1],[0,box[2],-1],[1,box[1],1],[1,box[3],-1]]){if(pending.length<3)break;const q=split(pending,axis,value,sign);if(q.outside.length>=3)out.push(q.outside);pending=q.inside;}return out;}
export function reviewEocGreen(data,anchor){if(!anchor)return data;let changed=0;const green=[];
 for(const ring of data.green??[]){const p=[];let area=0;for(let i=0;i<ring.length;i+=2){p.push(eocLocal(anchor,ring[i],ring[i+1]));const j=(i+2)%ring.length;area+=ring[i]*ring[j+1]-ring[j]*ring[i+1];}
  const minX=Math.min(...p.map(q=>q[0])),maxX=Math.max(...p.map(q=>q[0])),minY=Math.min(...p.map(q=>q[1])),maxY=Math.max(...p.map(q=>q[1]));const intersects=[EOC_PHOTO_REVIEW.front,EOC_PHOTO_REVIEW.plaza].some(b=>maxX>=b[0]&&minX<=b[2]&&maxY>=b[1]&&minY<=b[3]);
  if(Math.abs(area/2)<100||!intersects){green.push(ring);continue;}
  const tris=T.ShapeUtils.triangulateShape(p.map(q=>new T.Vector2(...q)),[]);let pieces=tris.map(t=>t.map(i=>p[i]));for(const box of [EOC_PHOTO_REVIEW.front,EOC_PHOTO_REVIEW.plaza])pieces=pieces.flatMap(poly=>subtract(poly,box));for(const poly of pieces)green.push(poly.flatMap(q=>eocWorld(anchor,...q)));changed++;
 }return {...data,green,eocReview:{changed,status:EOC_PHOTO_REVIEW.status}};
}
const applied=new WeakMap();
export function applyEocFrontage(root){if(applied.has(root))return applied.get(root);const group=new T.Group();group.name='EOC photo reviewed frontage — dimensions unmeasured';root.add(group);
 const positions=[],indices=[];for(let x=0;x<64;x+=2)for(let n=-8;n<0;n+=2){const k=positions.length/3;positions.push(x,.15,-n,x+2,.15,-n,x+2,.15,-n-2,x,.15,-n-2);indices.push(k,k+1,k+2,k,k+2,k+3);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const paving=new T.Mesh(geometry,new T.MeshStandardMaterial({name:'Plaza paving',color:'#9f9785',roughness:.9}));paving.name='EOC frontage paved walk';paving.userData.drape='surface';group.add(paving);
 const soil=new T.MeshStandardMaterial({color:'#5e5038',roughness:1}),leaf=new T.MeshStandardMaterial({color:'#547444',roughness:1}),bedGeometry=new T.BoxGeometry(2,.08,1.7),bushGeometry=new T.IcosahedronGeometry(.5,1);
 for(const x of EOC_PHOTO_REVIEW.trees){const bed=new T.Group();bed.name='EOC tree island '+x;bed.position.set(x,.15,7.1);bed.userData.drape='object';const earth=new T.Mesh(bedGeometry,soil);earth.position.y=.04;bed.add(earth);for(const dx of [-.65,0,.65]){const bush=new T.Mesh(bushGeometry,leaf);bush.position.set(dx,.18,0);bush.scale.set(.75,.35,1.5);bed.add(bush);}group.add(bed);}
 const result={group,paving,islands:EOC_PHOTO_REVIEW.trees.length,status:EOC_PHOTO_REVIEW.status};applied.set(root,result);return result;
}
