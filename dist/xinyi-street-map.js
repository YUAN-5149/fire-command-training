// 信義街景・全區大地圖：北方朝上，可拖曳、縮放、點選設定目標；顯示路名、重點建物、你的位置、消防車與導航路線。
export function createBigMap({overlay,canvas,mapImg,MAP,mapScale,labels,pois,getView,onPick}){
 const g=canvas.getContext('2d'),view={cx:0,cz:0,scale:1.2},pointers=new Map();let drag=null,pinch=null,open=false;
 const W=()=>canvas.width/devicePixelRatio,H=()=>canvas.height/devicePixelRatio;
 const toScreen=(x,z)=>[(x-view.cx)*view.scale+W()/2,(z-view.cz)*view.scale+H()/2];
 const toWorld=(sx,sy)=>[(sx-W()/2)/view.scale+view.cx,(sy-H()/2)/view.scale+view.cz];
 const clampScale=s=>Math.min(6,Math.max(.35,s));
 function resize(){canvas.width=innerWidth*devicePixelRatio;canvas.height=innerHeight*devicePixelRatio;}
 function arrow(x,y,rot,fill,size=11){g.save();g.translate(x,y);g.rotate(rot);g.fillStyle=fill;g.strokeStyle='#111';g.lineWidth=2;g.beginPath();g.moveTo(0,-size);g.lineTo(size*.7,size*.8);g.lineTo(0,size*.4);g.lineTo(-size*.7,size*.8);g.closePath();g.fill();g.stroke();g.restore();}
 function draw(){
  if(!open)return;const st=getView(),dpr=devicePixelRatio;g.setTransform(dpr,0,0,dpr,0,0);g.fillStyle='#141c22';g.fillRect(0,0,W(),H());
  const k=view.scale/mapScale;g.save();g.setTransform(dpr*k,0,0,dpr*k,dpr*(W()/2-(MAP/2+view.cx*mapScale)*k),dpr*(H()/2-(MAP/2+view.cz*mapScale)*k));g.imageSmoothingEnabled=true;g.drawImage(mapImg,0,0);g.restore();
  // 導航路線
  if(st.route?.length>1){g.strokeStyle='rgba(255,211,107,.95)';g.lineWidth=5;g.lineJoin=g.lineCap='round';g.beginPath();st.route.forEach(([x,z],i)=>{const [sx,sy]=toScreen(x,z);i?g.lineTo(sx,sy):g.moveTo(sx,sy);});g.stroke();}
  // 路名
  if(view.scale>.8){g.font=`600 ${Math.min(15,9+view.scale*2)}px "Noto Sans TC","PingFang TC",sans-serif`;g.textAlign='center';g.textBaseline='middle';
   for(const l of labels){const [sx,sy]=toScreen(l.x,l.z);if(sx<-80||sy<-20||sx>W()+80||sy>H()+20)continue;g.save();g.translate(sx,sy);g.rotate(l.angle);g.lineWidth=4;g.strokeStyle='rgba(20,28,34,.9)';g.strokeText(l.name,0,0);g.fillStyle='#e8eef0';g.fillText(l.name,0,0);g.restore();}}
  // 重點建物（第一批信義建物清單；名稱來自 OSM，量體對應仍為候選）
  g.font='600 13px "Noto Sans TC","PingFang TC",sans-serif';g.textAlign='left';g.textBaseline='middle';
  for(const p of pois){const [sx,sy]=toScreen(p.x,p.z);g.fillStyle='#8f6bd8';g.strokeStyle='#fff';g.lineWidth=2;g.beginPath();g.arc(sx,sy,7,0,Math.PI*2);g.fill();g.stroke();if(view.scale>.6){g.lineWidth=4;g.strokeStyle='rgba(20,28,34,.9)';g.strokeText(p.name,sx+11,sy);g.fillStyle='#f1e9ff';g.fillText(p.name,sx+11,sy);}}
  if(st.fire){const [sx,sy]=toScreen(st.fire.x,st.fire.z),r=12+Math.sin(performance.now()/200)*2;g.fillStyle='rgba(255,59,47,.25)';g.beginPath();g.arc(sx,sy,r+10,0,Math.PI*2);g.fill();g.fillStyle='#ff3b2f';g.strokeStyle='#fff';g.lineWidth=2;g.beginPath();g.arc(sx,sy,r,0,Math.PI*2);g.fill();g.stroke();g.fillStyle='#fff';g.font='700 13px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('火',sx,sy+1);}
  // 目標、消防車、自己
  if(st.waypoint){const [sx,sy]=toScreen(st.waypoint.x,st.waypoint.z);g.fillStyle='#ffd36b';g.strokeStyle='#111';g.lineWidth=2;g.beginPath();g.moveTo(sx,sy);g.lineTo(sx-9,sy-16);g.arc(sx,sy-18,9,Math.PI*.8,Math.PI*.2);g.closePath();g.fill();g.stroke();}
  {const [sx,sy]=toScreen(st.truck.x,st.truck.z);g.save();g.translate(sx,sy);g.rotate(-st.truck.heading);g.fillStyle='#e8303a';g.strokeStyle='#fff';g.lineWidth=2;g.fillRect(-5,-9,10,18);g.strokeRect(-5,-9,10,18);g.restore();}
  {const [sx,sy]=toScreen(st.x,st.z);g.fillStyle='rgba(255,211,107,.18)';g.beginPath();g.arc(sx,sy,22,0,Math.PI*2);g.fill();arrow(sx,sy,-st.facing,st.driving?'#ff4a4a':'#ffd36b');}
  // 比例尺
  const meters=view.scale>2?50:view.scale>.9?100:view.scale>.5?200:500,px=meters*view.scale;g.fillStyle='#e8eef0';g.fillRect(20,H()-34,px,4);g.font='12px sans-serif';g.textAlign='left';g.fillText(meters+' m',20,H()-44);
  requestAnimationFrame(draw);
 }
 canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1]),scale:view.scale};drag=null;}else drag={x:e.clientX,y:e.clientY,moved:0};});
 canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,[e.clientX,e.clientY]);
  if(pinch&&pointers.size===2){const [a,b]=[...pointers.values()];view.scale=clampScale(pinch.scale*Math.hypot(a[0]-b[0],a[1]-b[1])/pinch.d);return;}
  if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved+=Math.abs(dx)+Math.abs(dy);view.cx-=dx/view.scale;view.cz-=dy/view.scale;drag.x=e.clientX;drag.y=e.clientY;}});
 const up=e=>{if(drag&&drag.moved<6&&pointers.size===1){const r=canvas.getBoundingClientRect();onPick(...toWorld(e.clientX-r.left,e.clientY-r.top));}pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;drag=null;};
 canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);pinch=null;drag=null;});
 canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect(),[wx,wz]=toWorld(e.clientX-r.left,e.clientY-r.top);view.scale=clampScale(view.scale*(e.deltaY<0?1.15:1/1.15));const [nx,nz]=toWorld(e.clientX-r.left,e.clientY-r.top);view.cx+=wx-nx;view.cz+=wz-nz;},{passive:false});
 addEventListener('resize',()=>{if(open)resize();});
 return {
  get open(){return open;},view,toWorld,toScreen,
  show(){const st=getView();open=true;overlay.hidden=false;resize();view.cx=st.x;view.cz=st.z;requestAnimationFrame(draw);},
  hide(){open=false;overlay.hidden=true;},
  zoom(f){view.scale=clampScale(view.scale*f);},
  center(){const st=getView();view.cx=st.x;view.cz=st.z;},
 };
}
