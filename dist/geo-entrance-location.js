// Annotation only: selected official wall, approximate centre and size, no opening cut.
export function entranceCandidate(buildings){
 const building=buildings.find(b=>b.id===357399),wall=building?.walls.find(w=>w.n[0]<-.9&&w.w>45);
 if(!wall)throw Error('入口候選量體讀取失敗');
 const {a,b,w,h,n}=wall,width=Math.min(16.2,w),height=Math.min(8.4,h),centre=w/2;
 const point=(u,z,offset=.25)=>[a[0]+(b[0]-a[0])*u/w+n[0]*offset/100850,a[1]+(b[1]-a[1])*u/w+n[1]*offset/110574,a[2]+z];
 const ring=[[centre-width/2,0],[centre+width/2,0],[centre+width/2,height],[centre-width/2,height],[centre-width/2,0]].map(([u,z])=>point(u,z));
 return {objectId:building.id,ring,width,height,centre:point(centre,0,0),normal:n,wall};
}
