import {focus,inFocus} from './geo-xinyi-detail.js';
// Surface rendering only; never changes OSM centerlines, widths or deployment height.
export function buildStreetDetail(features){
 const position=[],uv=[],groups={asphalt:[],pavers:[],concrete:[],cycle:[],curb:[]};let paths=0;
 function quad(points,kind,coords){const i=position.length/3;for(let j=0;j<4;j++){position.push(...points[j]);uv.push(...coords[j]);}groups[kind].push(i,i+1,i+2,i,i+2,i+3);}
 for(const f of features){if(!(f.width>0)||f.tags?.bridge==='yes'||f.tags?.tunnel==='yes'||f.tags?.indoor==='yes')continue;let used=false;
  const raised=f.kind==='sidewalk',walk=raised||f.kind==='walk';
  const kind=f.kind==='cycle'?'cycle':walk?(f.tags?.surface==='concrete'?'concrete':'pavers'):'asphalt';
  const z=(raised?.12:.025)+.012,period=walk?1.2:2;
  for(const path of f.paths){let distance=0;for(let j=1;j<path.length;j++){
   const a=path[j-1],b=path[j],sx=111320*Math.cos((a[1]+b[1])/2*Math.PI/180),sy=110574;
   const dx=(b[0]-a[0])*sx,dy=(b[1]-a[1])*sy,len=Math.hypot(dx,dy);if(len<.01)continue;
   const nx=-dy/len,ny=dx/len,count=Math.ceil(len/8),at=(t,offset,height)=>[a[0]+(b[0]-a[0])*t+nx*offset/sx,a[1]+(b[1]-a[1])*t+ny*offset/sy,height];
   for(let k=0;k<count;k++){const t0=k/count,t1=(k+1)/count,mid=at((t0+t1)/2,0,z);if(!inFocus(mid[0],mid[1]))continue;used=true;
    const left=-f.width/2,right=f.width/2,v0=(distance+len*t0)/period,v1=(distance+len*t1)/period;
    quad([at(t0,left,z),at(t0,right,z),at(t1,right,z),at(t1,left,z)],kind,[[0,v0],[f.width/period,v0],[f.width/period,v1],[0,v1]]);
    if(raised)for(const edge of [left,right])quad([at(t0,edge,.025),at(t1,edge,.025),at(t1,edge,z),at(t0,edge,z)],'curb',[[v0,0],[v1,0],[v1,.12],[v0,.12]]);
   }distance+=len;
  }}if(used)paths++;
 }
 return {position,uv,groups,paths};
}
export function createStreetMaterials(Material){
 const result={};for(const kind of ['asphalt','pavers','concrete','cycle','curb']){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');
  const base={asphalt:58,pavers:177,concrete:166,cycle:96,curb:183}[kind];
  const pixels=ctx.createImageData(256,256);let seed=137;
  for(let i=0;i<256*256;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=((seed>>>24)/255-.5)*(kind==='asphalt'?29:13);const c=Math.max(0,Math.min(255,base+noise));pixels.data.set(kind==='cycle'?[c*.76,c,c*.94,255]:[c,c+(kind==='pavers'?0:2),c-(kind==='pavers'?7:0),255],i*4);}
  ctx.putImageData(pixels,0,0);
  if(kind==='pavers'){ctx.strokeStyle='#85867e';ctx.lineWidth=1.5;for(let row=0;row<4;row++){const y=row*64;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();for(let x=(row%2)*64;x<=256;x+=128){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+64);ctx.stroke();}}}
  if(kind==='concrete'){ctx.strokeStyle='#8d918f';ctx.lineWidth=1;ctx.strokeRect(.5,.5,255,255);}
  if(kind==='curb'){ctx.strokeStyle='#85877f';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,256);ctx.stroke();}
  result[kind]=new Material({color:'white',colorTexture:{data:canvas,wrap:'repeat'},metallic:0,roughness:kind==='asphalt'?.98:.9,doubleSided:true});
 }return result;
}
