// Trial measurements: not a surveyed arcade or certified rescue route.
export const arcadeDimensions={width:16.2,depth:2.5,height:8.4,eye:1.65,margin:.35};
export function arcadeStep(state,du,dd){
 const p=arcadeDimensions;
 return {u:Math.max(-p.width/2+p.margin,Math.min(p.width/2-p.margin,state.u+du)),d:Math.max(-p.depth+p.margin,Math.min(3,state.d+dd))};
}
export function arcadeCamera(candidate,state){
 const {wall}=candidate,{a,b,w,n}=wall,u=w/2+state.u;
 return {position:{longitude:a[0]+(b[0]-a[0])*u/w+n[0]*state.d/100850,latitude:a[1]+(b[1]-a[1])*u/w+n[1]*state.d/110574,z:a[2]+arcadeDimensions.eye},heading:180,tilt:82};
}
