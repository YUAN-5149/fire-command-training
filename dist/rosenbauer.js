import * as T from 'three';
export const rosenbauerProfile={model:'Rosenbauer L32A-XS 3.2',configuration:'A2EA068 · MB Atego 1530F 4×2',workingHeight:32,rescueHeight:30,maxBasketPayload:500,monitor:'RM8',maxMonitorFlowLpm:1900,articulatedLength:4.35,jackingMin:2.5,jackingMax:4.8,length:10.05,width:2.5,height:3.3,wheelbase:4.76,source:'https://www.rosenbauer.com/Sharepoint/aerial/Sales/Rosenbauer_L32A-XS_A2EA068_EN.pdf'};
export function createRosenbauer(scene){
 const root=new T.Group();root.position.z=11.3;root.name=rosenbauerProfile.model;scene.add(root);const lights=[];
 const mat=(c,m=.3,r=.4)=>new T.MeshStandardMaterial({color:c,metalness:m,roughness:r});
 const red=mat('#ba2925'),silver=mat('#b5bdc1',.7),black=mat('#172129',.1),glass=mat('#234452',.4,.13),lime=mat('#e5ed61'),white=mat('#eff3ec');
 const box=(w,h,d,x,y,z,m)=>{let geo=new T.BoxGeometry(w,h,d);if(w>1&&h>1&&d>.5){const b=.055,shape=new T.Shape();shape.moveTo(-w/2+b,-h/2+b);shape.lineTo(w/2-b,-h/2+b);shape.lineTo(w/2-b,h/2-b);shape.lineTo(-w/2+b,h/2-b);shape.closePath();geo=new T.ExtrudeGeometry(shape,{depth:d-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:3,steps:1});geo.translate(0,0,-d/2+b)}const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;root.add(o);return o};
 box(9.6,.3,2.15,-.975,.47,0,black);box(2.45,1.83,2.42,-4.775,1.6,0,red);box(2.48,.12,2.48,-4.775,2.575,0,red);
 box(.04,.82,2.08,-6.015,2,0,glass);box(.06,.85,.055,-6.04,2,0,silver);box(.06,.47,1.3,-6.035,1.16,0,black);
 for(let i=0;i<5;i++)box(.075,.025,1.26,-6.08,.98+i*.075,0,silver);
 box(.13,.2,2.5,-6.05,.68,0,silver);
 box(7.1,.48,2.44,.3,1.12,0,red);box(6.95,.07,2.45,.3,1.92,0,silver);
 for(const side of [-1,1]){
  for(const x of [-4.1,.66]){const wheel=new T.Mesh(new T.CylinderGeometry(.565,.565,.22,24),black);wheel.rotation.x=Math.PI/2;wheel.position.set(x,.5,side*1.14);wheel.castShadow=true;root.add(wheel);const hub=new T.Mesh(new T.CylinderGeometry(.3,.3,.24,20),silver);hub.rotation.x=Math.PI/2;hub.position.copy(wheel.position);root.add(hub)}
  box(1.65,.78,.035,-4.8,2,side*1.225,glass);box(.05,.8,.045,-4.6,2,side*1.245,silver);
  box(2.35,.12,.035,-4.78,1.45,side*1.235,lime);box(.25,.04,.07,-4.05,1.39,side*1.25,silver);
  box(.28,.4,.13,-5.91,1.97,side*1.4,black);box(.2,.3,.035,-5.91,1.98,side*1.48,silver);
  box(.07,.3,.44,-6.06,.99,side*.87,white);
  for(let i=0;i<3;i++){const x=-2.5+i*2.05;box(1.85,.86,.045,x,1.45,side*1.235,silver);for(let k=0;k<10;k++)box(1.8,.013,.05,x,1.07+k*.077,side*1.26,black);box(.42,.04,.065,x,1.13,side*1.28,white)}
  box(7.05,.1,.04,.3,.94,side*1.25,lime);
  const blue=mat('#163d91');blue.emissive.set('#3182ff');blue.emissiveIntensity=2;
  for(const x of [-5.2,3.6]){box(.5,.07,.3,x,x<0?2.66:1.99,side*.93,black);const o=box(.42,.17,.26,x,x<0?2.77:2.1,side*.93,blue.clone());lights.push(o)}
 }
 box(.12,.24,2.48,3.99,.72,0,silver);box(.06,.6,2.25,3.95,1.34,0,red);
 for(const side of [-1,1])box(.08,.25,.18,4.025,1.15,side*1.03,lime);
 // Body details follow the Atego reference: framed shutters, access steps and wheel surrounds.
 const line=(a,b,r,m)=>{const d=b.clone().sub(a),o=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),10),m);o.position.copy(a).lerp(b,.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());root.add(o);return o};
 const v=(x,y,z)=>new T.Vector3(x,y,z);
 for(const side of [-1,1]){
  for(const x of [-4.1,.66]){
   const arch=new T.Mesh(new T.TorusGeometry(.64,.07,8,24,Math.PI),black);arch.position.set(x,.5,side*1.27);root.add(arch);
   const rim=new T.Mesh(new T.TorusGeometry(.29,.035,8,24),silver);rim.position.set(x,.5,side*1.275);root.add(rim);
   for(let n=0;n<8;n++){const a=n*Math.PI/4;const bolt=new T.Mesh(new T.SphereGeometry(.028,6,6),black);bolt.position.set(x+Math.cos(a)*.22,.5+Math.sin(a)*.22,side*1.282);root.add(bolt)}
   box(.15,.34,.06,x+.59,.32,side*1.17,black);
  }
  for(let n=0;n<2;n++){box(.68,.09,.28,-5.25,.51+n*.23,side*1.23,silver);for(let k=0;k<6;k++)box(.035,.014,.25,-5.52+k*.1,.56+n*.23,side*1.23,black)}
  for(const x of [-5.62,-3.87])box(.018,1.03,.045,x,1.49,side*1.235,black);
  box(1.8,.025,.045,-4.76,.99,side*1.238,black);
  line(v(-5.76,2.1,side*1.22),v(-5.91,2.15,side*1.42),.025,black);
  for(let i=0;i<3;i++){const x=-2.5+i*2.05;for(const dx of [-.94,.94])box(.055,.92,.075,x+dx,1.45,side*1.255,red);box(1.9,.04,.08,x,1.9,side*1.255,red);box(.09,.09,.075,x+.42,1.13,side*1.29,black)}
  for(const x of [-2.9,-1.1,1.1,3.2]){const marker=mat('#ee9d2d');marker.emissive.set('#a75d12');box(.16,.07,.04,x,.9,side*1.275,marker)}
  line(v(-2.9,1.99,side*.97),v(-1.5,1.99,side*.97),.025,silver);
  for(const x of [-2.9,-1.5])line(v(x,1.93,side*.97),v(x,2.15,side*.97),.025,silver);
 }
 // Wipers, lamps, grille badge, rear clusters and reflective chevrons.
 for(const z of [-.54,.54])line(v(-6.045,1.68,z-.18),v(-6.05,2.1,z+.24),.018,black);
 const badge=new T.Mesh(new T.TorusGeometry(.12,.018,6,24),silver);badge.rotation.y=Math.PI/2;badge.position.set(-6.09,1.32,0);root.add(badge);
 for(let n=0;n<3;n++){const a=n*Math.PI*2/3;line(v(-6.09,1.32,0),v(-6.09,1.32+Math.cos(a)*.105,Math.sin(a)*.105),.012,silver)}
 for(const side of [-1,1]){box(.09,.37,.28,4.035,1.05,side*1.02,black);for(let n=0;n<3;n++)box(.105,.09,.21,4.05,.95+n*.11,side*1.02,n===1?white:red);for(let k=0;k<5;k++){const stripe=box(.025,.08,.38,3.99,1.18+k*.12,side*.46,lime);stripe.rotation.x=side*.65}}
 function lettering(text,x,y,z,rotation,w){if(typeof document==='undefined')return;const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#f5f5ed';ctx.font='bold 72px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,64);const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;const o=new T.Mesh(new T.PlaneGeometry(w,.22),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));o.position.set(x,y,z);o.rotation.y=rotation;root.add(o)}
 for(const side of [-1,1]){lettering('ROSENBAUER',-.6,1.83,side*1.295,side<0?Math.PI:0,2.05);lettering('L32A-XS',-4.75,1.24,side*1.27,side<0?Math.PI:0,1.12)}
 return {root,lights};
}
// Five nested lattice sections; pose remains a deliberately simplified training mechanism.
export function createLattice(parent,sections=1){
 const group=new T.Group();parent.add(group);const metal=new T.MeshStandardMaterial({color:'#b9c1c5',metalness:.65,roughness:.32});
 const add=(a,b,width)=>{const delta=b.clone().sub(a),m=new T.Mesh(new T.CylinderGeometry(width,width,delta.length(),6),metal);m.position.copy(a).lerp(b,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());group.add(m)};
 const v=(x,y,z)=>new T.Vector3(x,y,z);
 for(let s=0;s<sections;s++){const w=.48-s*.065,z=.2-s*.024,start=-.5+s*.04,finish=.5-s*.04;
  for(const x of [-w,w])for(const zz of [-z,z])add(v(x,start,zz),v(x,finish,zz),.022);
  for(let i=0;i<13;i++){const y=start+(finish-start)*i/12;add(v(-w,y,-z),v(w,y,-z),.014);if(i<12)for(const x of [-w,w])add(v(x,y,i%2?z:-z),v(x,y+(finish-start)/12,i%2?-z:z),.012)}
 }
 return group;
}
