import * as T from 'three';
export const TREE_ASSET_ROOT=new URL('./assets/plants-ez-v2/',import.meta.url);
const TYPE={camphor:['broad','open'],banyan:['spreading','wide'],goldenrain:['upright','column']},QUALITY={low:[40,110,300],medium:[60,180,450],high:[80,250,650]};
export function decodeTreeAssets(catalog,binary,textures){
 const models=catalog.models.map(m=>({...m,levels:m.levels.map(l=>({...l,parts:l.parts.map(p=>{const g=new T.BufferGeometry();for(const [name,a] of Object.entries(p.attributes)){if(a.type!=='Float32Array'||a.offset+a.length*4>binary.byteLength)throw Error('Invalid tree attribute');g.setAttribute(name,new T.BufferAttribute(new Float32Array(binary,a.offset,a.length),a.itemSize));}g.setIndex(new T.BufferAttribute(new Uint32Array(binary,p.index.offset,p.index.length),1));g.computeBoundingBox();g.computeBoundingSphere();return {...p,geometry:g};})}))}));
 const bark=new T.MeshStandardMaterial({map:textures.bark,color:'#b9b1a4',roughness:.95}),leaves=new T.MeshStandardMaterial({map:textures.leaves,color:'#a2b286',roughness:.95,alphaTest:.45,side:T.DoubleSide,transparent:false,depthWrite:true});leaves.alphaToCoverage=true;
 return {catalog,models,materials:{branches:bark,leaves}};
}
let assetsPromise;
export function loadTreeAssets(){return assetsPromise??=Promise.all([fetch(new URL('catalog.json',TREE_ASSET_ROOT)).then(r=>{if(!r.ok)throw Error('Tree catalog '+r.status);return r.json();}),fetch(new URL('geometry.bin',TREE_ASSET_ROOT)).then(r=>{if(!r.ok)throw Error('Tree geometry '+r.status);return r.arrayBuffer();}),new T.TextureLoader().loadAsync(new URL('bark.jpg',TREE_ASSET_ROOT).href),new T.TextureLoader().loadAsync(new URL('leaves.png',TREE_ASSET_ROOT).href)]).then(([c,b,bark,leaves])=>{for(const tex of [bark,leaves]){tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=2;}bark.wrapS=bark.wrapT=T.RepeatWrapping;return decodeTreeAssets(c,b,{bark,leaves});}).catch(e=>{assetsPromise=null;throw e;});}
export function chooseTreeLevel(distance,previous=-1,quality='medium'){
 const t=QUALITY[quality]??QUALITY.medium;if(distance>t[2]+(previous===2?25:0))return -1;
 if(distance<t[0]+(previous===0?8:0))return 0;if(distance<t[1]+(previous===1?15:0))return 1;return 2;
}
export function plantVariant(r,i=0){const kinds=TYPE[r.kind]??['broad','spreading','upright','open','wide','column'];const h=Math.abs(Math.round(r.x*11)+Math.round(r.z*17)+i*31);return kinds[h%kinds.length];}
export function createRealisticTrees({scene,assets,ground,street=[],supplemental=null}){
 const treeModels=assets.models.filter(m=>m.category==='tree'),shrubModels=assets.models.filter(m=>m.category==='shrub');const eocCache=new WeakMap();const group=new T.Group();group.name='GitHub EZ-Tree foliage';scene.add(group);const records=street.map((r,i)=>({...r,id:'street-'+i,kind:plantVariant(r,i),scale:r.s??1,source:'street',level:-1})),batches=[];let quality='medium',force=true,lastX=Infinity,lastZ=Infinity,revision=ground.revision;
 // Existing supplemental trees are a separate layer; preserve its instance anchors.
 if(supplemental){supplemental.updateWorldMatrix(true,false);const m=new T.Matrix4(),p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();for(let i=0;i<supplemental.count;i++){supplemental.getMatrixAt(i,m);m.premultiply(supplemental.matrixWorld).decompose(p,q,s);records.push({id:'supplemental-'+i,x:p.x,z:p.z,ry:new T.Euler().setFromQuaternion(q,'YXZ').y,scale:s.x*.65,kind:treeModels[i%treeModels.length].kind,source:'supplemental',level:-1});}}
 function rebuild(){for(const b of batches){group.remove(b.mesh);b.mesh.dispose();}batches.length=0;
  for(const model of assets.models)for(let level=0;level<3;level++)for(const part of model.levels[level].parts){const count=records.filter(r=>r.kind===model.kind).length;if(!count)continue;const mesh=new T.InstancedMesh(part.geometry,assets.materials[part.name],count);mesh.name=model.kind+' LOD '+level+' '+part.name;mesh.count=0;mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);batches.push({kind:model.kind,level,part:part.name,mesh,triangles:part.index.length/3});}force=true;
 }
 const matrix=new T.Matrix4(),q=new T.Quaternion(),pos=new T.Vector3(),scale=new T.Vector3(),color=new T.Color();const stats={records:records.length,drawn:0,triangles:0,batches:0,levels:[0,0,0]};rebuild();
 function update(eye){if(!group.visible)return;if(revision!==ground.revision){revision=ground.revision;force=true;}if(!force&&Math.hypot(eye.x-lastX,eye.z-lastZ)<4)return;force=false;lastX=eye.x;lastZ=eye.z;
  for(const b of batches)b.mesh.count=0;stats.levels=[0,0,0];stats.drawn=stats.triangles=stats.batches=0;
  for(const r of records){const distance=Math.hypot(r.x-eye.x,r.z-eye.z);r.level=r.source==='shrub'&&distance>(quality==='low'?45:quality==='high'?120:80)?-1:chooseTreeLevel(distance,r.level,quality);if(r.level<0||r.hiddenDuplicate)continue;stats.levels[r.level]++;stats.drawn++;pos.set(r.x,r.fixedY??ground.at(r.x,r.z),r.z);q.setFromAxisAngle(T.Object3D.DEFAULT_UP,r.ry??0);scale.setScalar(r.scale);matrix.compose(pos,q,scale);const tint=r.tint??1;color.setRGB(tint,tint,tint);
   for(const b of batches)if(b.kind===r.kind&&b.level===r.level){const n=b.mesh.count++;b.mesh.setMatrixAt(n,matrix);b.mesh.setColorAt(n,color);stats.triangles+=b.triangles;}
  }
  for(const b of batches){b.mesh.instanceMatrix.needsUpdate=true;if(b.mesh.instanceColor)b.mesh.instanceColor.needsUpdate=true;b.mesh.computeBoundingSphere();if(b.mesh.count)stats.batches++;}stats.records=records.length;
 }
 function replaceEoc(root){if(eocCache.has(root))return eocCache.get(root);root.updateMatrixWorld(true);const trees=[];root.traverse(o=>{if(o.userData?.drape==='object'&&/^EOC[ _]tree[ _]\d+$/i.test(o.name))trees.push(o);});
  const p=new T.Vector3(),rot=new T.Quaternion();trees.forEach((o,i)=>{o.getWorldPosition(p);o.getWorldQuaternion(rot);const model=treeModels[i%treeModels.length],box=new T.Box3().setFromObject(o),size=box.getSize(new T.Vector3()),bounds=new T.Box3();for(const part of model.levels[0].parts)bounds.union(part.geometry.boundingBox);const s=bounds.getSize(new T.Vector3());const fitted=Math.min(size.y/s.y,size.x/s.x,size.z/s.z);if(!Number.isFinite(fitted)||fitted<=0)return;
   records.push({id:'eoc-'+i,x:p.x,z:p.z,fixedY:box.min.y,ry:new T.Euler().setFromQuaternion(rot,'YXZ').y,scale:fitted,kind:model.kind,source:'eoc',original:o,level:-1});o.visible=false;
   for(const r of records)if(r.source!=='eoc'&&Math.hypot(r.x-p.x,r.z-p.z)<1.5)r.hiddenDuplicate=true;
  });
  // Replace only the photo-reviewed island shrubs; never scatter plants onto walks or docks.
  const beds=[];root.traverse(o=>{if(/^EOC tree island /.test(o.name))beds.push(o);});
  beds.forEach((bed,bi)=>{for(const o of bed.children)if(o.isMesh&&o.geometry?.type==='IcosahedronGeometry')o.visible=false;
   [[-.65,-.4],[.65,-.4],[-.65,.4],[0,.4],[.65,.4]].forEach(([x,z],j)=>{const model=shrubModels[(bi+j)%shrubModels.length];if(!model)return;const p=bed.localToWorld(new T.Vector3(x,.08,z));records.push({id:'shrub-'+bi+'-'+j,x:p.x,z:p.z,fixedY:p.y,ry:(bi+j)*2.4,scale:1,kind:model.kind,source:'shrub',level:-1,tint:.88+((bi*3+j)%5)*.035});});
  });rebuild();eocCache.set(root,trees.length);return trees.length;
 }
 function setQuality(value){if(quality!==value){quality=value;force=true;}}
 function setVisible(on){group.visible=!!on;force=true;}
 return {group,records,batches,stats,update,replaceEoc,setQuality,setVisible};
}
