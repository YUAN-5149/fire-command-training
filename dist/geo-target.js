// Facade detailing over the verified official face, not a replacement building.
export function buildFacade(data){
 const {a,b,width:W,height:H,normal:n}=data.front,positions=[],groups=new Map();
 const point=(u,z,depth)=>[a[0]+(b[0]-a[0])*u/W+n[0]*depth/100850,a[1]+(b[1]-a[1])*u/W+n[1]*depth/110574,a[2]+z];
 function rect(u0,u1,z0,z1,color,depth=.07){if(u1<=u0||z1<=z0)return;const start=positions.length/3;for(const [u,z] of [[u0,z0],[u1,z0],[u1,z1],[u0,z1]])positions.push(...point(u,z,depth));if(!groups.has(color))groups.set(color,[]);groups.get(color).push(start,start+1,start+2,start,start+2,start+3);}
 // Structural mass stays in the official model; all details lie within its front boundary.
 rect(0,W,0,H,'#b6b6b0',.035);
 const base=7.2,podium=24.8;
 rect(.12,W-.12,0,base,'#30373a');
 for(let i=0;i<7;i++){const x=i*W/7;rect(x+.32,x+W/7-.32,.15,4.2,'#484a48',.09);rect(x+.32,x+W/7-.32,4.5,6.45,i%3===1?'#b8a05b':'#596369',.09);rect(x,x+.24,0,base,'#555b5c',.14);for(let z=.4;z<4.2;z+=.22)rect(x+.32,x+W/7-.32,z,z+.025,'#343a3b',.11);}
 rect(0,W,6.85,7.2,'#afb1ac',.18);
 rect(.15,W-.15,base,podium,'#667b88',.075);
 const columns=14,rows=7,cw=W/columns,rh=(podium-base)/rows;
 for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){const color=r<3&&c>2&&c<11?(r===1?'#b2a360':'#899384'):(['#718391','#617786','#7b8b94'][(c+r)%3]);rect(c*cw+.06,(c+1)*cw-.06,base+r*rh+.07,base+(r+1)*rh-.07,color,.09);}
 for(let c=0;c<=columns;c++){const x=c*cw;rect(Math.max(0,x-.045),Math.min(W,x+.045),base,podium,'#bec2bf',.15);}
 for(let r=0;r<=rows;r++){const z=base+r*rh;rect(0,W,z,Math.min(podium,z+.1),'#c1c4c1',.16);}
 // Upper horizontal window bands reproduce the reference's visible rhythm, not floor counts.
 for(let z=podium;z<H;z+=3.15){const top=Math.min(H,z+3.15);rect(.15,W-.15,z+.28,Math.max(z+.28,top-.48),'#53636d',.075);for(let c=1;c<17;c++){const x=c*W/17;rect(x-.035,x+.035,z+.28,Math.max(z+.28,top-.48),'#a5aaa8',.12);}rect(0,W,z,Math.min(top,z+.3),'#c0c0b7',.16);rect(0,W,Math.max(z,top-.48),top,'#aaa99f',.18);}
 return {position:positions,components:[...groups].map(([color,faces])=>({faces,material:{color,doubleSided:true},shading:'flat'}))};
}
export async function createTargetFacade({view,map,Graphic,GraphicsLayer,Mesh,getPlace,setTarget}){
 const response=await fetch('assets/ximen-target.json');if(!response.ok)throw Error('目標資料載入失敗');const data=await response.json(),built=buildFacade(data);
 const layer=new GraphicsLayer({title:'搶救目標正面・照片參考重建',elevationInfo:{mode:'absolute-height'}});
 const mesh=new Mesh({spatialReference:{wkid:4326},vertexSpace:{type:'georeferenced'},vertexAttributes:{position:built.position},components:built.components});
 layer.add(new Graphic({geometry:mesh,symbol:{type:'mesh-3d',symbolLayers:[{type:'fill'}]},attributes:{name:data.name},popupTemplate:{title:'{name}',content:'正面依使用者照片重建，窗帶節距與材質非實測。建物原位置、輪廓與高度保留。'}}));map.add(layer);
 const panel=document.getElementById('targetFacade');panel.innerHTML='<h2>指定搶救建物</h2><p>西寧南路・阿曼 TiT<br>官方編號 17697 · 選定量體高 74.63 m</p><label class="street-toggle"><input id="facadeVisible" type="checkbox" checked> 顯示照片參考外觀</label><button id="focusTarget">看搶救目標正面</button><button id="useTarget">設為本區搶救目標</button><p id="facadeStatus" role="status">正面已加入玻璃帷幕、深灰低樓層與水平窗帶。</p><details><summary>外觀依據與原圖</summary><p>依你提供的 2025 年 5 月街景重建正面；材質、窗帶間距與分割為視覺近似，不能用來判斷實際樓層或救援開口。32R 保留為原資料註記，未當成 32 層。背面、屋頂與室內保持原樣。</p><a href="assets/target-street-reference.png" target="_blank" rel="noopener"><img src="assets/target-street-reference.png" alt="使用者提供的西寧南路正面街景參考，2025年5月" loading="lazy"></a></details>';
 const $=id=>document.getElementById(id);function changePlace(){const visible=getPlace()==='ximen';panel.hidden=!visible;layer.visible=visible&&$('facadeVisible').checked;}
 $('facadeVisible').onchange=changePlace;
 $('focusTarget').onclick=async()=>{try{const c=data.center;await view.goTo({position:{longitude:c[0]-.00105,latitude:c[1]+.00024,z:65},heading:105,tilt:84},{animate:false});}catch(e){if(e.name!=='AbortError')$('facadeStatus').textContent='定位失敗，請重新操作。';}};
 $('useTarget').onclick=()=>{setTarget(data);$('facadeStatus').textContent='已指定編號 17697 為搶救目標；請在部署區指定第一正面入口。';};
 changePlace();return {changePlace};
}
