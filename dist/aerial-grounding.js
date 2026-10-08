import * as T from 'three';
// Model-space dimensions; fixed beam sockets stay attached to the authored chassis.
export function createGrounding(source){
 const get=n=>source.getObjectByName(n),steel=new T.MeshStandardMaterial({color:'#aab2b7',metalness:.8,roughness:.3});
 const box=(name,w,h,d,x,y,z,material=steel)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),material);m.name=name;m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;source.add(m);return m};
 const jacks=[];
 for(let i=0;i<4;i++){
  const suffix=i?String(i).padStart(3,'0'):'',side=i%2===0?1:-1,x=i<2?-1.9:4.45;
  const moving=['Jack_beam','Jack_leg','Jack_leg_slide','Jack_foot','Jack_pivot_pin','Jack_warning_light'].map(n=>get(n+suffix)).filter(Boolean).map(o=>({o,rest:o.position.clone()}));
  const bridge=box('Connected_outrigger_'+i,.43,.27,1,x,1.08,side*1.05);
  const piston=box('Continuous_jack_piston_'+i,.21,1,.2,x,.6,side*1.115);
  jacks.push({moving,bridge,piston,side,x});
 }
 // Add the missing lowest folding tread and top transition at the model's side access well.
 for(const side of [-1,1]){box('Access_bottom_tread_'+side,.45,.04,.32,2.64,.4,side*1.34);box('Access_top_tread_'+side,.45,.04,.25,2.64,2.37,side*1.13);}
 function update(spread,down){for(const j of jacks){const travel=1.15*spread,drop=.495*down;
  j.bridge.scale.z=.4+travel;j.bridge.position.z=j.side*(1.055+travel/2);
  for(const {o,rest} of j.moving){o.position.copy(rest);o.position.z+=j.side*travel;if(/Jack_(foot|pivot_pin|leg_slide)/.test(o.name))o.position.y-=drop;}
  // The barrel remains fixed in height; a continuous inner ram joins it to the foot.
  const bottom=.59-drop,top=.86;j.piston.scale.y=top-bottom;j.piston.position.set(j.x,(top+bottom)/2,j.side*(1.115+travel));
 }}
 const local=(x,y,z)=>source.localToWorld(new T.Vector3(x,y,z));
 const steps=[local(2.64,0,-1.65),local(2.64,.42,-1.34)];
 for(const name of ['Lower_step002','Lower_step003','Well_tread003','Well_tread004','Well_tread005']){const o=get(name);const b=new T.Box3().setFromObject(o);steps.push(new T.Vector3((b.min.x+b.max.x)/2,b.max.y,(b.min.z+b.max.z)/2));}
 steps.push(local(2.64,2.39,-1.13),local(3.1,2.675,-.8));
 return {update,jacks,steps,local};
}
export function walkBoarding(p,points,q,feet){
 const n=points.length-1,s=T.MathUtils.clamp(q,0,1)*n,i=Math.min(n-1,Math.floor(s)),f=s-i,start=points[i],end=points[i+1];
 const u=f*f*(3-2*f),pos=start.clone().lerp(end,u),climbing=end.y-start.y>.15;
 // Lift one boot, plant it on the next tread, then transfer body weight.
 p.legs.forEach((leg,k)=>{leg.rotation.x=climbing?(k===i%2?-.55*Math.sin(Math.PI*f):.12*Math.sin(Math.PI*f)):Math.sin(s*Math.PI*2+k*Math.PI)*.22;});
 p.arms.forEach((arm,k)=>arm.rotation.x=climbing?-.95+(k===i%2?.18:0):.15);
 const direction=end.clone().sub(start);if(direction.x*direction.x+direction.z*direction.z>.001)p.body.rotation.y=Math.atan2(-direction.x,-direction.z);
 feet(p,pos);
}
