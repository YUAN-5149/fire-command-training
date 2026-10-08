import {isNeighborFrontage} from './geo-neighbor-frontages.js?v=70';
// Original procedural materials, not photographs or assets from GTA.
export const focus={longitude:121.5654,latitude:25.0338,radius:250};
export function inFocus(lon,lat){return Math.hypot((lon-focus.longitude)*111320*Math.cos(focus.latitude*Math.PI/180),(lat-focus.latitude)*110574)<=focus.radius;}
export function focusedBuilding(building){return building.walls.some(({a,b})=>inFocus((a[0]+b[0])/2,(a[1]+b[1])/2));}
export function buildXinyiDetail(buildings,{arcade=false,attStudy=false}={}){
 const position=[],color=[],uv=[],groups={stone:[],glass:[],frame:[],base:[],roof:[],screen:[],frontage:[],maxMaraSign:[],pradaSign:[],attMesh:[]};
 const tint=(hex)=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16),255];
 function polygon(points,kind,hex,coords){const start=position.length/3;for(let i=0;i<points.length;i++){position.push(...points[i]);color.push(...tint(hex));uv.push(...coords[i]);}for(let i=1;i<points.length-1;i++)groups[kind].push(start,start+i,start+i+1);}
 for(const building of buildings){
  const curtain=building.walls.some(w=>w.h>35),stone=['#c1bfba','#aaaeb0','#b9b0a3','#c9c6bd'][building.id%4];
  for(let i=0;i<building.roofs.length;i+=3){const ps=building.roofs.slice(i,i+3).map(p=>[p[0],p[1],p[2]+.045]);polygon(ps,'roof','#747b7d',ps.map(p=>[(p[0]-focus.longitude)*100850/5,(p[1]-focus.latitude)*110574/5]));}
  for(const wall of building.walls){const {a,b,w,h,n}=wall;
   const p=(u,z,d)=>[a[0]+(b[0]-a[0])*u/w+n[0]*d/100850,a[1]+(b[1]-a[1])*u/w+n[1]*d/110574,a[2]+z];
   const cut=arcade&&building.id===357399&&n[0]<-.9&&w>45;
   const left=(w-16.2)/2,right=(w+16.2)/2;
   function rawRect(x0,x1,z0,z1,kind,hex,d=.08){if(x1<=x0||z1<=z0)return;const coords=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];polygon(coords.map(([x,z])=>p(x,z,d)),kind,hex,coords.map(([x,z])=>(kind==='glass'||kind==='frontage')?[(x-x0)/(x1-x0),(z-z0)/(z1-z0)]:[x/1.5,z/1.5]));}
   function rect(x0,x1,z0,z1,kind,hex,d=.08){
    if(!cut||z0>=8.4||x1<=left||x0>=right){rawRect(x0,x1,z0,z1,kind,hex,d);return;}
    rawRect(x0,Math.min(x1,left),z0,z1,kind,hex,d);
    rawRect(Math.max(x0,right),x1,z0,z1,kind,hex,d);
    rawRect(Math.max(x0,left),Math.min(x1,right),Math.max(z0,8.4),z1,kind,hex,d);
   }
   if(cut){
    const face=(pts,kind,hex)=>polygon(pts.map(([u,z,d])=>p(u,z,d)),kind,hex,[[0,0],[1,0],[1,1],[0,1]]);
    face([[left,0,0],[right,0,0],[right,0,-2.5],[left,0,-2.5]],'stone','#bbb8af');
    face([[left,8.4,0],[right,8.4,0],[right,8.4,-2.5],[left,8.4,-2.5]],'base','#a4a59d');
    face([[left,0,0],[left,0,-2.5],[left,8.4,-2.5],[left,8.4,0]],'stone','#b9b4aa');
    face([[right,0,0],[right,0,-2.5],[right,8.4,-2.5],[right,8.4,0]],'stone','#b9b4aa');
    rawRect(left,right,0,8.4,'frontage','#a6bfc1',-2.5);
    for(let x=left;x<=right;x+=1.55)rawRect(x,Math.min(right,x+.06),0,8.4,'frame','#38494e',-2.48);
    // User entrance photo: central metal panel, upper glazing and fine frame.
    // Layout and dimensions remain a photo study, not a surveyed façade.
    const centre=w/2;
    rawRect(centre-3.1,centre+3.1,3.45,5.85,'frame','#a2a5a3',-2.42);
    for(const z of [3.4,5.9,7.7])rawRect(left,right,z,z+.07,'frame','#4c595b',-2.4);
    for(let x=left+.9;x<right;x+=2.8){const depth=-1.3;face([[x-.22,8.36,depth-.09],[x+.22,8.36,depth-.09],[x+.22,8.36,depth+.09],[x-.22,8.36,depth+.09]],'base','#e8e4ce');}

   }
   rect(0,w,0,h,'stone',stone,.035);
   // One official west-facing podium wall. MJD exterior reference: dark ground glazing,
   // broad piers, fine mullions and glass ribbons between gold screens. Heights/bays
   // are approximate: the photo is oblique, not a surveyed elevation or entrance plan.
   if(building.id===357399&&n[0]<-.9&&w>45){
    const base=Math.min(5.5,h),bay=w/3;
    for(let j=0;j<3;j++){
     const left=j*bay+.42,right=(j+1)*bay-.42;
     rect(left,right,.2,base,'frontage','#b0bbba',.07);
     for(let x=left;x<right;x+=1.55)rect(x,Math.min(right,x+.06),.2,base,'frame','#333c3f',.15);
     rect(left,right,base*.48,base*.48+.065,'frame','#333c3f',.15);
    }
    for(let j=0;j<=3;j++)rect(Math.max(0,j*bay-.42),Math.min(w,j*bay+.42),0,base,'stone','#545753',.16);
    rect(0,w,0,.2,'base','#414945',.11);
    // Official 1F plan places Max Mara north and PRADA south on Songzhi Road.
    // These are approximate sign studies, not surveyed sign/door positions.
    for(const [kind,centre,width] of [['maxMaraSign',bay*.5,4.6],['pradaSign',bay*2.5,4]]){
     const x0=centre-width/2,x1=centre+width/2,z0=4.25,z1=5.05;
     polygon([p(x0,z0,.175),p(x1,z0,.175),p(x1,z1,.175),p(x0,z1,.175)],kind,'#ffffff',[[0,1],[1,1],[1,0],[0,0]]);
    }
    const ribbons=[[10.8,12.1],[16.1,17.4]];
    let bottom=base;
    for(const [start,end] of ribbons){
     rect(0,w,Math.min(bottom,h),Math.min(start,h),'screen','#bba573',.09);
     rect(0,w,Math.min(start,h),Math.min(end,h),'glass','#7b979d',.1);
     for(let x=0;x<w;x+=2.4)rect(x,Math.min(w,x+.065),Math.min(start,h),Math.min(end,h),'frame','#38494e',.15);
     bottom=end;
    }
    rect(0,w,Math.min(bottom,h),h,'screen','#bba573',.09);
    for(const z of [base,10.8,12.1,16.1,17.4,h-.22])rect(0,w,Math.min(z,h),Math.min(z+.12,h),'frame','#5f635d',.18);
    continue;
   }
   if(w<2||h<2.8)continue;
   const rows=Math.max(1,Math.round(h/4)),rh=h/rows,cols=Math.max(1,Math.round(w/(curtain?3.4:3.8))),cw=w/cols;
   for(let r=0;r<rows;r++){const bottom=r*rh,top=Math.min(h,(r+1)*rh),z0=bottom+(r===0?.35:curtain?.25:.8),z1=top-.25;
    for(let c=0;c<cols;c++){const margin=curtain?.1:Math.min(.35,cw*.2),x0=c*cw+margin,x1=(c+1)*cw-margin;
     rect(x0-.065,x1+.065,z0-.065,z1+.065,'base','#343d40',.055);
     rect(x0,x1,z0,z1,'glass',['#7a9caf','#93afbc','#628693','#849eaa'][(building.id+r+c)%4],.07);
     rect(x0-.055,x0,z0-.05,z1+.05,'frame','#919ca0',.15);rect(x1,x1+.055,z0-.05,z1+.05,'frame','#919ca0',.15);
     rect(x0,x1,z0-.055,z0,'frame','#818d92',.15);rect(x0,x1,z1,z1+.055,'frame','#a3aeb0',.15);
     if(!curtain)rect(x0-.08,x1+.08,z0-.13,z0-.06,'stone','#b5b6b2',.18);
    }
    rect(0,w,top-.14,top,'frame',curtain?'#849094':'#9a9b96',.13);
   }
   rect(0,w,0,Math.min(.3,h),'base','#505857',.11);
   if(attStudy&&isNeighborFrontage(building,wall)){
    // ATT 4 FUN photo-reference candidate. Official volume association and dimensions pending.
    rect(0,w,.3,3.8,'frontage','#283335',.17);
    rect(0,w,3.8,Math.min(8.3,h),'attMesh','#d6d4c5',.175);
    // Photo-reference dark frontage framing; opening locations remain unverified.
    for(let x=0;x<w;x+=3.1)rect(x,Math.min(w,x+.08),.3,3.8,'frame','#aeb4ae',.18);
    rect(0,w,2.7,2.78,'frame','#99a29c',.18);
    rect(0,w,.3,.42,'base','#4d5553',.18);
    const bays=2,bay=w/bays;
    for(let j=0;j<bays;j++){
     const mid=(j+.5)*bay;
     for(let step=0;step<24;step++){
      const u0=j*bay+step*bay/24,u1=j*bay+(step+1)*bay/24;
      const z0=2.8+2.2*Math.sqrt(Math.max(0,1-((u0-mid)/(bay/2))**2)),z1=2.8+2.2*Math.sqrt(Math.max(0,1-((u1-mid)/(bay/2))**2));
      polygon([p(u0,z0,.18),p(u1,z1,.18),p(u1,z1+.08,.18),p(u0,z0+.08,.18)],'frame','#c9ccc7',[[0,0],[1,0],[1,1],[0,1]]);
     }
     rect(j*bay,j*bay+.10,.3,2.9,'frame','#babfb9',.18);
    }
   }

  }
 }
 return {position,color,uv,groups};
}
export function createDetailMaterials(Material){
 const textures={};
 const net=document.createElement('canvas');net.width=net.height=128;const nc=net.getContext('2d');nc.fillStyle='#525b55';nc.fillRect(0,0,128,128);nc.strokeStyle='#d6d7ce';nc.lineWidth=1.4;for(let x=-128;x<256;x+=12){nc.beginPath();nc.moveTo(x,0);nc.lineTo(x+64,128);nc.stroke();nc.beginPath();nc.moveTo(x,0);nc.lineTo(x-64,128);nc.stroke();}textures.attMesh=net;
 for(const kind of ['stone','glass','roof','screen','frontage']){const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
  if(kind==='screen'){ctx.fillStyle='#555044';ctx.fillRect(0,0,128,128);for(let row=-1;row<9;row++)for(let col=-1;col<9;col++){const x=col*16+(row%2?8:0),y=row*16;ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.strokeStyle='#ddc58d';ctx.lineWidth=3;ctx.stroke();ctx.beginPath();ctx.arc(x-.5,y-.5,6,Math.PI,Math.PI*1.8);ctx.strokeStyle='#f3dfaf';ctx.lineWidth=1;ctx.stroke();}}
  else if(kind==='frontage'){
   // Original abstract reflection, never an invented shop interior or copied photo.
   const gradient=ctx.createLinearGradient(0,0,0,128);gradient.addColorStop(0,'#596d72');gradient.addColorStop(.44,'#263c3b');gradient.addColorStop(.7,'#1b2825');gradient.addColorStop(1,'#60716d');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
   ctx.fillStyle='rgba(18,33,26,.48)';for(let i=0;i<13;i++){ctx.beginPath();ctx.ellipse((i*37)%128,45+(i*13)%38,12+(i%4)*4,18+(i%3)*5,0,0,Math.PI*2);ctx.fill();}
   ctx.fillStyle='rgba(225,237,237,.08)';for(const x of [12,49,86])ctx.fillRect(x,0,4,128);
  }
  else if(kind==='glass'){const gradient=ctx.createLinearGradient(0,0,25,128);gradient.addColorStop(0,'#5c7687');gradient.addColorStop(.45,'#c0d0d8');gradient.addColorStop(.5,'#93aebc');gradient.addColorStop(1,'#d9e4e9');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(18,0,9,128);}
  else{ctx.fillStyle=kind==='stone'?'#d5d2ca':'#aaaeb0';ctx.fillRect(0,0,128,128);let seed=kind==='stone'?13:41;for(let i=0;i<3000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed%128;seed=(Math.imul(seed,1664525)+1013904223)>>>0;ctx.fillStyle=i%2?'rgba(35,40,44,.09)':'rgba(255,255,255,.18)';ctx.fillRect(x,seed%128,1,1);}if(kind==='stone'){ctx.strokeStyle='rgba(50,52,52,.15)';ctx.strokeRect(.5,.5,127,127);}}
  textures[kind]=canvas;
 }
 // Plain original typesetting: no downloaded logo or photographic storefront texture.
 for(const [kind,label] of [['maxMaraSign','Max Mara'],['pradaSign','PRADA']]){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#1e292b';ctx.fillRect(0,0,1024,256);ctx.fillStyle='#f0eee3';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=kind==='pradaSign'?'bold 145px Georgia, serif':'135px Georgia, serif';ctx.fillText(label,512,137,930);textures[kind]=canvas;
 }
 return Object.fromEntries(Object.entries({attMesh:{metallic:.7,roughness:.55,colorTexture:textures.attMesh},stone:{roughness:.88,colorTexture:textures.stone},glass:{roughness:.17,colorTexture:textures.glass},frontage:{roughness:.24,metallic:.25,colorTexture:textures.frontage},maxMaraSign:{roughness:.7,colorTexture:textures.maxMaraSign},pradaSign:{roughness:.7,colorTexture:textures.pradaSign},frame:{metallic:1,roughness:.38},base:{roughness:.96},roof:{roughness:.93,colorTexture:textures.roof},screen:{metallic:1,roughness:.55,colorTexture:textures.screen}}).map(([kind,opts])=>[kind,new Material({color:'white',metallic:0,doubleSided:true,...opts})]));
}
