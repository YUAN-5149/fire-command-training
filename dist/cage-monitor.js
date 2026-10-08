import * as T from 'three';
// RM8/RM8M appearance reference. Rated 1900 L/min at 10 bar is not a measured scene flow.
export function createCageMonitor(basket,scene){
 const red=new T.MeshStandardMaterial({color:'#b92421',metalness:.4,roughness:.3}),silver=new T.MeshStandardMaterial({color:'#b5bdc5',metalness:.8,roughness:.25}),black=new T.MeshStandardMaterial({color:'#1b252d',roughness:.65});
 const base=new T.Group();base.position.set(.44,.83,-.46);basket.add(base);
 function cylinder(parent,r1,r2,h,x,y,z,mat){const m=new T.Mesh(new T.CylinderGeometry(r1,r2,h,20),mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m}
 cylinder(base,.16,.16,.065,0,0,0,silver);cylinder(base,.085,.085,.26,0,.14,0,red);
 for(let i=0;i<6;i++){const a=i*Math.PI/3;cylinder(base,.017,.017,.025,Math.cos(a)*.125,.045,Math.sin(a)*.125,black)}
 const elbow=new T.Mesh(new T.SphereGeometry(.115,16,12),red);elbow.position.y=.26;base.add(elbow);
 const barrel=new T.Group();barrel.position.y=.26;base.add(barrel);
 cylinder(barrel,.09,.085,.3,0,0,.14,red).rotation.x=Math.PI/2;
 cylinder(barrel,.13,.1,.18,0,0,.35,silver).rotation.x=Math.PI/2;
 cylinder(barrel,.145,.145,.12,0,0,.47,black).rotation.x=Math.PI/2;
 cylinder(barrel,.112,.112,.022,0,0,.54,silver).rotation.x=Math.PI/2;
 cylinder(barrel,.082,.082,.024,0,0,.554,black).rotation.x=Math.PI/2;
 for(let i=0;i<12;i++){const a=i*Math.PI/6;const grip=new T.Mesh(new T.BoxGeometry(.025,.025,.12),silver);grip.position.set(Math.cos(a)*.142,Math.sin(a)*.142,.47);barrel.add(grip)}
 // Rear handle and elevation lock, clear of the front basket gate.
 for(const x of [-.16,.16])cylinder(barrel,.024,.024,.28,x,-.02,-.18,black).rotation.x=Math.PI/2;
 cylinder(barrel,.027,.027,.32,0,-.02,-.32,black).rotation.z=Math.PI/2;
 cylinder(base,.065,.065,.07,.14,.24,0,black).rotation.z=Math.PI/2;
 const muzzle=new T.Object3D();muzzle.position.z=.57;barrel.add(muzzle);
 const fogMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{opacity:{value:.32}},
  vertexShader:`varying float vFade;attribute float fade;void main(){vFade=fade;vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=clamp(65.0/max(1.0,-p.z),2.0,24.0);}`,
  fragmentShader:`uniform float opacity;varying float vFade;void main(){float r=length(gl_PointCoord-vec2(.5))*2.0;float a=exp(-3.8*r*r)*(1.0-smoothstep(.65,1.0,r))*opacity*vFade;gl_FragColor=vec4(.83,.94,1.0,a);}`});
 const count=2400,geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(count*3),3));geometry.setAttribute('fade',new T.BufferAttribute(new Float32Array(count),1));
 const spray=new T.Points(geometry,fogMaterial);scene.add(spray);
 // A faint cone supplies continuous fine mist between the individual droplets.
 const jet=new T.Group();scene.add(jet);
 const coneGeometry=new T.BufferGeometry();const coneVertices=new T.BufferAttribute(new Float32Array(48*6*3),3);coneGeometry.setAttribute('position',coneVertices);
 const cone=new T.Mesh(coneGeometry,new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
  vertexShader:`varying float worldZ;void main(){vec4 world=modelMatrix*vec4(position,1.0);worldZ=world.z;gl_Position=projectionMatrix*viewMatrix*world;}`,
  fragmentShader:`varying float worldZ;void main(){if(worldZ<4.15)discard;gl_FragColor=vec4(.83,.94,1.0,.045);}`}));jet.add(cone);
 let native=null;const origin=new T.Vector3(),axis=new T.Vector3(),right=new T.Vector3(),up=new T.Vector3();
 let lastOrigin=new T.Vector3(),lastDirection=new T.Vector3(),lastRange=0;
 function hide(){spray.visible=false;jet.visible=false;}hide();
 function bindNative(rig){native=rig;base.visible=false;hide();}
 function update(aim,enabled,time){
  if(!enabled){hide();return;}
  if(native){if(native.aimAt(aim)===false){hide();return;}native.muzzle.getWorldPosition(origin);axis.copy(native.direction());}
  else{basket.updateWorldMatrix(true,true);barrel.lookAt(aim);barrel.updateWorldMatrix(true,true);muzzle.getWorldPosition(origin);muzzle.getWorldDirection(axis);}
  const range=Math.min(12,origin.distanceTo(aim));right.crossVectors(axis,new T.Vector3(0,1,0));if(right.lengthSq()<.001)right.set(1,0,0);else right.normalize();up.crossVectors(right,axis).normalize();
  jet.position.copy(scene.worldToLocal(origin.clone()));jet.quaternion.copy(scene.getWorldQuaternion(new T.Quaternion()).invert()).multiply(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),axis));jet.scale.set(1,1,1);
  let cursor=0;for(let sector=0;sector<48;sector++)for(const [edge,q] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){
   const angle=(sector+edge)*Math.PI*2/48,radius=.026+q*range*Math.tan(Math.PI/6);coneVertices.setXYZ(cursor++,Math.cos(angle)*radius,Math.sin(angle)*radius,q*range);
  }coneVertices.needsUpdate=true;coneGeometry.computeBoundingSphere();
  const pos=spray.geometry.attributes.position,fade=spray.geometry.attributes.fade;
  for(let i=0;i<count;i++){
   const q=i===0?0:((time*.7+i/count)%1),distance=q*range,angle=i*2.3999632297;
   const radial=Math.sqrt(((i*73)%997)/997),radius=(.026+distance*Math.tan(Math.PI/6))*radial;
   const p=origin.clone().addScaledVector(axis,distance).addScaledVector(right,Math.cos(angle)*radius).addScaledVector(up,Math.sin(angle)*radius);
   // Terminate spray at the front facade rather than drawing droplets indoors.
   const visible=p.z>=4.15;p.copy(scene.worldToLocal(p));pos.setXYZ(i,p.x,p.y,p.z);fade.setX(i,visible?Math.min(1,1.3-q)*(.45+.55*radial):0);
  }
  pos.needsUpdate=fade.needsUpdate=true;spray.geometry.computeBoundingSphere();spray.visible=jet.visible=true;
  lastOrigin.copy(origin);lastDirection.copy(axis);lastRange=range;
 }
 return {base,barrel,get muzzle(){return native?.muzzle??muzzle},spray,jet,hide,update,bindNative,get diagnostics(){return {origin:lastOrigin.clone(),direction:lastDirection.clone(),range:lastRange,mode:'wide-fog',halfAngle:Math.PI/6,native:Boolean(native)}}};
}
