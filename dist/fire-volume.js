import * as T from 'three';
import {spreadSources,rearSources} from './fire-spread.js';
// Layered ribbons convey plume/ceiling/opening motion; thresholds are visual only.
export function createFireVolume(scene,baseMaterial){
 const material=baseMaterial.clone();material.uniforms=baseMaterial.uniforms;
 material.vertexShader='varying float vStrength;\n'+baseMaterial.vertexShader.replace('uvv=uv;','uvv=uv;vStrength=instanceColor.r;').replace('vec4(bent,1.)','instanceMatrix*vec4(bent,1.)');
 material.fragmentShader='varying float vStrength;\n'+baseMaterial.fragmentShader.replace('a*.86','a*.72*vStrength');
 const ribbons=new T.InstancedMesh(new T.PlaneGeometry(1,1,6,12),material,700);ribbons.name='火羽流・天花板延展・開口火舌';ribbons.instanceMatrix.setUsage(T.DynamicDrawUsage);ribbons.frustumCulled=false;ribbons.count=0;scene.add(ribbons);
 const dummy=new T.Object3D(),up=new T.Vector3(0,1,0),color=new T.Color();let count=0;
 function segment(a,b,width,power,roll=0){if(count>=700||power<.005)return;const delta=b.clone().sub(a),length=delta.length();dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(up,delta.normalize());dummy.rotateY(roll);dummy.scale.set(width,length*1.5,1);dummy.updateMatrix();ribbons.setMatrixAt(count,dummy.matrix);ribbons.setColorAt(count,color.setRGB(power,power,power));count++;}
 const v=(x,y,z)=>new T.Vector3(x,y,z),clamp=x=>Math.max(0,Math.min(1,x));
 return {ribbons,update(t,s){count=0;const vent=clamp(s.vent||0),gust=.7+.3*Math.sin(t*1.7),flow=vent*gust;const height=s.flameHeight,energy=clamp(s.heatKW/3500);const sources=spreadSources(s).map(p=>({...p,z:2.7,out:1}));rearSources(s).forEach((p,i)=>{if(i%3===1)sources.push({...p,out:s.rearCells[i+1],z:-2.2,rear:true})});
 for(const src of sources){const power=src.strength*clamp(height/.8);if(power<.005)continue;const floor=src.floor*3.2+.31,ceiling=floor+2.72,h=Math.min(2.7,height*src.strength);
 // Two crossed winding flame ribbons rise from each burning room's fuel region.
 for(let axis=0;axis<2;axis++)for(let n=0;n<4;n++){const q=n/4,r=(n+1)/4;const point=k=>v(src.x+Math.sin(t*(3+vent)+k*5+axis)*(.13+flow*.18)*k,floor+h*k,src.z+Math.cos(t*2+k*4+axis)*.12*k+(src.rear?-.35:.35)*flow*k*k);segment(point(q),point(r),(.35+s.diameter*.35)*(1-q*.65),power,axis*Math.PI/2);}
 const ceilingPower=power*clamp((height*src.strength-2)/1.3);
 if(ceilingPower>.005){for(const sign of [-1,1])for(let n=0;n<3;n++){const length=.5+energy*1.3+flow*.35,xa=T.MathUtils.clamp(src.x+sign*length*n/3,-4.8,4.8),xb=T.MathUtils.clamp(src.x+sign*length*(n+1)/3,-4.8,4.8);segment(v(xa,ceiling-.1-Math.sin(t*5+n)*.05,src.z),v(xb,ceiling-.12,src.z+.1*Math.sin(t*3+n)),.34+energy*.3,ceilingPower*(1-n*.18),Math.PI/2);}}
 // Opening flames arc outward and then upward, anchored to each opening's upper edge.
 const outward=src.rear?-1:1,opening=src.rear?-4.05:4.2,tonguePower=power*clamp((height-1.4)/2)*(src.rear?src.out:1);
 if(tonguePower>.005){const reach=(.35+energy*1.7)*(1+flow*.7);for(let axis=0;axis<2;axis++)for(let n=0;n<3;n++){const point=q=>v(src.x+.13*Math.sin(t*4+q*5+axis),floor+2.35+q*q*(.4+energy*1.5)*(1-flow*.2),opening+outward*q*reach);segment(point(n/3),point((n+1)/3),(.4+energy*.5)*(1-n*.2),tonguePower,axis*Math.PI/2);}}
 }
 // A deliberate whole-floor exercise effect, gated by the instructor's flashover choice.
 for(let f=0;f<5;f++){const p=s.flashover?.[f]?.progress||0;if(p<.005)continue;const base=f*3.2+.31;
 for(const x of [-4,-2.7,-1.4,1.4,2.8,4.2])for(const z of [-2.5,1.4,2.7]){const h=(1.1+1.5*p)*(.9+.1*Math.sin(t*4+x+z));for(let axis=0;axis<2;axis++)segment(v(x,base,z),v(x+.12*Math.sin(t*3+z),base+h,z),.5+.5*p,p,axis*Math.PI/2);segment(v(x-.5,base+2.5,z),v(x+.5,base+2.55,z),.5,p,Math.PI/2);}
 for(const x of [-4,-1.4,1.4,4]){if(f===0&&Math.abs(x)<2)continue;for(let n=0;n<2;n++)segment(v(x,base+2,4.2),v(x+.15*Math.sin(t*4+x),base+2.4,4.7+p+flow),.55,p,n*Math.PI/2);}
 segment(v(2.825,base+2,-4.05),v(2.825,base+2.5,-4.5-p-flow),.7,p);
 }
 ribbons.count=count;ribbons.instanceMatrix.needsUpdate=true;if(ribbons.instanceColor)ribbons.instanceColor.needsUpdate=true;
 }};
}
