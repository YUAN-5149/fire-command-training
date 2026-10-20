// 信義街景漫遊：行道樹（assets/street-furniture-xinyi.json 的 trees）。
// 三種臺北常見樹形：樟樹（圓冠）、榕樹（寬冠下垂）、台灣欒樹（高瘦），每種先建一棵模型，
// 再用 InstancedMesh 依位置隨機旋轉、縮放、色調鋪滿全區。樹冠由數團凹凸的葉團組成，
// 上亮下暗；樹幹漸細並分出枝幹伸入樹冠。樹種依位置雜湊指定，非實際樹種調查。

export const TREE_KINDS={
 camphor:{label:'樟樹',trunkH:2.4,trunkR:[.13,.22],crown:{y:5.2,rx:2.4,ry:1.5},lumps:8,lumpR:[1.4,2.0],leaf:'#6a9a55',bark:'#463a2e'},
 banyan:{label:'榕樹',trunkH:2.2,trunkR:[.16,.28],crown:{y:4.7,rx:3.3,ry:1.2},lumps:9,lumpR:[1.3,1.9],leaf:'#58884a',bark:'#544839'},
 goldenrain:{label:'台灣欒樹',trunkH:3.0,trunkR:[.11,.18],crown:{y:6.2,rx:1.7,ry:2.2},lumps:7,lumpR:[1.1,1.6],leaf:'#88a95a',bark:'#3f362c'}
};
const KINDS=Object.keys(TREE_KINDS);

function rand(seed){let s=seed>>>0||1;return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
// 平滑的三維起伏（不需雜訊庫）：幾組正弦相乘，讓葉團表面有凹凸
function bumps(x,y,z,s){return Math.sin(x*3.1+s)*Math.sin(y*2.7+s*1.3)*Math.sin(z*3.3+s*.7)+.5*Math.sin(x*6.3+z*5.1+s*2.1)*Math.sin(y*7.7+s);}
// 頂點色是線性色彩：sRGB 十六進位先轉線性
const lin=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
const hex=h=>[1,3,5].map(i=>lin(parseInt(h.slice(i,i+2),16)/255));

// 純函式：每棵樹的實例參數 {x,z,ry,s,kind}。
export function treeInstances(trees){
 return trees.map(([x,z],i)=>{const r=rand(Math.floor(Math.abs(x*73856093^z*19349663))+i);
  return {x,z,ry:r()*Math.PI*2,s:.8+r()*.4,kind:KINDS[Math.floor(r()*3)%3],tint:.9+r()*.18};});
}

// three.js：建一棵樹的幾何（含頂點色），葉團用 mergeVertices 後平滑法線。
export function buildTreeGeometry(T,{mergeGeometries,mergeVertices},kind){
 const k=TREE_KINDS[kind],r=rand(KINDS.indexOf(kind)*977+13),parts=[],leaf=hex(k.leaf),bark=hex(k.bark);
 const paint=(g,fn)=>{const p=g.attributes.position,c=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){const [a,b,d]=fn(p.getX(i),p.getY(i),p.getZ(i));c[i*3]=a;c[i*3+1]=b;c[i*3+2]=d;}g.setAttribute('color',new T.BufferAttribute(c,3));return g;};
 const barkCol=(x,y)=>{const v=.85+.15*Math.sin(y*9+x*13);return bark.map(c=>c*v);};
 // 樹幹
 const trunk=new T.CylinderGeometry(k.trunkR[0],k.trunkR[1],k.trunkH+.6,9,4);trunk.translate(0,(k.trunkH+.6)/2,0);
 parts.push(paint(trunk,barkCol));
 // 葉團中心
 const C=k.crown,centres=[];
 for(let i=0;i<k.lumps;i++){const a=i/k.lumps*Math.PI*2+r()*.6,rad=.35+r()*.65;
  centres.push([Math.cos(a)*C.rx*rad,C.y+(r()-.4)*C.ry*1.2,Math.sin(a)*C.rx*rad,k.lumpR[0]+r()*(k.lumpR[1]-k.lumpR[0])]);}
 centres.push([0,C.y+C.ry*.55,0,k.lumpR[1]*1.05]);
 // 枝幹：從樹幹頂伸向其中三團
 const up=new T.Vector3(0,1,0);
 for(let i=0;i<3;i++){const [cx,cy,cz]=centres[i*2%centres.length],from=new T.Vector3(0,k.trunkH*.85,0),to=new T.Vector3(cx*.7,cy-.6,cz*.7),dir=to.clone().sub(from),len=dir.length();
  const b=new T.CylinderGeometry(k.trunkR[0]*.45,k.trunkR[0]*.85,len,6);b.translate(0,len/2,0);
  b.applyQuaternion(new T.Quaternion().setFromUnitVectors(up,dir.normalize()));b.translate(from.x,from.y,from.z);parts.push(paint(b,barkCol));}
 // 葉團：凹凸的二十面體球，上亮下暗、外亮內暗
 const lo=C.y-C.ry-1.5,hi=C.y+C.ry+2;
 centres.forEach(([cx,cy,cz,R],j)=>{
  let g=new T.IcosahedronGeometry(1,2);g.deleteAttribute('normal');g.deleteAttribute('uv');g=mergeVertices(g);
  const p=g.attributes.position,s=j*1.7+KINDS.indexOf(kind)*3;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),f=R*(1+.2*bumps(x,y,z,s));p.setXYZ(i,cx+x*f,cy+y*f*.82,cz+z*f);}
  g.computeVertexNormals();
  const shade=.88+r()*.2;
  paint(g,(x,y,z)=>{const h=Math.min(1,Math.max(0,(y-lo)/(hi-lo))),out=Math.min(1,Math.hypot(x,z)/(C.rx+1.5)),v=(.78+.42*h)*(.9+.2*out)*shade*(.94+.12*Math.sin(x*5.3+z*4.1+y*3.7));return leaf.map((c,ci)=>Math.min(1,c*v*(ci===1?1.04:1)));});
  parts.push(g);
 });
 // 合併前統一屬性（position、normal、color，皆有索引）
 for(const g of parts){for(const n of Object.keys(g.attributes))if(!['position','normal','color'].includes(n))g.deleteAttribute(n);}
 const merged=mergeGeometries(parts.map(g=>g.index?g:mergeVertices(g)),false);merged.computeBoundingSphere();
 return merged;
}

// 加入場景：每種樹形一個 InstancedMesh；回傳群組。
export function addTreesToScene({T,scene,trees,ground,utils}){
 const group=new T.Group();group.name='street trees';
 const inst=treeInstances(trees),mat=new T.MeshStandardMaterial({vertexColors:true,roughness:.88,metalness:0});
 // 葉面質感：依世界座標的細碎明暗與法線擾動，打散葉團的平面感（只作用在綠色的葉，不動樹幹）
 mat.onBeforeCompile=sh=>{
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vLeafPos;')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvLeafPos=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vLeafPos;\nfloat lh(vec3 p){return fract(sin(dot(floor(p),vec3(12.9898,78.233,37.719)))*43758.5453);}\nfloat ln(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(lh(i),lh(i+vec3(1,0,0)),f.x),mix(lh(i+vec3(0,1,0)),lh(i+vec3(1,1,0)),f.x),f.y),mix(mix(lh(i+vec3(0,0,1)),lh(i+vec3(1,0,1)),f.x),mix(lh(i+vec3(0,1,1)),lh(i+vec3(1,1,1)),f.x),f.y),f.z);}')
   .replace('#include <color_fragment>','#include <color_fragment>\nfloat isLeaf=step(diffuseColor.r*1.12,diffuseColor.g);\nfloat sp=ln(vLeafPos*5.)*.6+ln(vLeafPos*13.)*.4;\ndiffuseColor.rgb*=mix(1.,.62+.62*sp,isLeaf);')
   .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=normalize(normal+isLeaf*.55*(vec3(ln(vLeafPos*7.),ln(vLeafPos*7.+3.1),ln(vLeafPos*7.+7.3))-.5));');
 };
 mat.customProgramCacheKey=()=>'xinyi-trees-1';
 const m4=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),v=new T.Vector3(),sc=new T.Vector3(),c=new T.Color();
 for(const kind of KINDS){
  const list=inst.filter(t=>t.kind===kind);if(!list.length)continue;
  const im=new T.InstancedMesh(buildTreeGeometry(T,utils,kind),mat,list.length);im.name='tree '+kind;
  list.forEach((t,i)=>{e.set(0,t.ry,0);q.setFromEuler(e);m4.compose(v.set(t.x,ground.at(t.x,t.z)-.05,t.z),q,sc.set(t.s,t.s,t.s));im.setMatrixAt(i,m4);im.setColorAt(i,c.setRGB(t.tint,t.tint*1.02,t.tint*.96));});
  im.castShadow=im.receiveShadow=true;group.add(im);
 }
 scene.add(group);return group;
}
