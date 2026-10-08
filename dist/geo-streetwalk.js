import {metres,pathLength,pointAlong} from './geo-streets.js';

export const walkFocus={longitude:121.5654,latitude:25.0338,radius:260};
export function walkRoutes(features){
 const roads=features.filter(f=>f.kind==='road'&&f.tags.name).flatMap(f=>f.paths.map(path=>({path,name:f.tags.name})));
 return features.filter(f=>['sidewalk','walk','crossing'].includes(f.kind)&&f.tags?.highway!=='steps').flatMap(f=>f.paths.map((path,index)=>({id:`${f.id}:${index}`,osmId:f.id,kind:f.kind,name:f.tags.name||({sidewalk:'人行道',walk:'步行路徑',crossing:'路口穿越路徑'}[f.kind]),path,length:pathLength(path)}))).filter(r=>r.length>3&&r.path.every(p=>metres(p,[walkFocus.longitude,walkFocus.latitude])<=walkFocus.radius)).map(r=>{if(r.name==='人行道'||r.name==='步行路徑'||r.name==='路口穿越路徑'){const p=pointAlong(r.path,r.length/2),near=closestWalkRoute(roads,[p.longitude,p.latitude]);if(near&&near.distance<60)r.name=near.route.name+'周邊・'+r.name;}return r;}).sort((a,b)=>a.id.localeCompare(b.id));
}
export function closestWalkRoute(routes,point){
 let best=null;
 for(const route of routes){let travelled=0;for(let i=1;i<route.path.length;i++){const a=route.path[i-1],b=route.path[i],c=Math.cos(point[1]*Math.PI/180),ax=(a[0]-point[0])*111320*c,ay=(a[1]-point[1])*110574,dx=(b[0]-a[0])*111320*c,dy=(b[1]-a[1])*110574,den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0,distance=Math.hypot(ax+t*dx,ay+t*dy),length=metres(a,b);if(!best||distance<best.distance)best={route,along:travelled+t*length,distance};travelled+=length;}}
 return best;
}
export const advanceWalk=(route,along,step)=>({along:Math.max(0,Math.min(route.length,along+step)),atEnd:along+step<0||along+step>route.length});

export async function createStreetWalk({view,map,Point,getPlace,onEnter=()=>{}}){
 const panel=document.getElementById('streetWalk');
 panel.innerHTML='<h2>信義街景漫遊</h2><p>松智路附近街廓 · 人眼高度近看</p><button id="enterStreetWalk" disabled>進入信義街景</button><label for="walkRoute">步行路徑</label><select id="walkRoute" disabled></select><p id="walkReady" role="status">正在準備步行路網…</p><details><summary>建置進度與精度</summary><p>已建置：真實座標路網、官方建物量體、街景視角與步行路徑操作。</p><p>待驗證：路面寬度、入口與店面對應、招牌尺寸。騎樓高差待量測，未添加推測台階或坡度。</p><p>待辦：逐棟實景外牆、店面及可自由行走的人物與完整碰撞。此版沿 OSM 步行中心線移動，不代表現場通行或無障礙認證。</p></details>';
 const hud=document.createElement('section');hud.className='walk-hud';hud.hidden=true;hud.setAttribute('aria-label','街景漫遊控制');hud.innerHTML='<div class="walk-hud-top"><div><strong>信義街景</strong><span id="walkPosition"></span></div><button id="exitStreetWalk">返回部署視角</button></div><div class="walk-hud-bottom"><p id="walkMessage" role="status">W / S 前後移動 · A / D 轉向 · Esc 返回</p><div class="walk-buttons"><button data-walk="left" aria-label="街景向左看">向左看</button><button data-walk="forward" aria-label="街景前進三公尺">前進</button><button data-walk="back" aria-label="街景後退三公尺">後退</button><button data-walk="right" aria-label="街景向右看">向右看</button></div><p>沿步行路網近看 · 外牆材質與道路尺寸部分為示意</p></div>';
 document.querySelector('.map-shell').append(hud);
 const $=id=>document.getElementById(id);let routes=[],route=null,along=0,offset=0,active=false,busy=false,generation=0,previousCamera=null;
 function refresh(){panel.hidden=getPlace()!=='xinyi';$('enterStreetWalk').disabled=!routes.length||getPlace()!=='xinyi';$('walkRoute').disabled=!routes.length;}
 function exit(){generation++;active=false;busy=false;document.body.classList.remove('streetwalking');hud.hidden=true;if(previousCamera)view.goTo(previousCamera,{animate:false}).catch(()=>{});previousCamera=null;}
 function selected(){route=routes.find(r=>r.id===$('walkRoute').value)||routes[0];along=route?route.length/2:0;offset=0;}
 function message(t){$('walkMessage').textContent=t;}
 async function render(nextAlong=along,nextOffset=offset){
  if(!active||busy||!route)return;busy=true;const ticket=generation;const p=pointAlong(route.path,nextAlong);
  try{const result=await map.ground.queryElevation(new Point({longitude:p.longitude,latitude:p.latitude,spatialReference:{wkid:4326}}),{returnSampleInfo:true});if(ticket!==generation||!active)return;const z=result.geometry.z;if(!Number.isFinite(z)||result.sampleInfo?.some(s=>s.demResolution<0))throw Error('地形高度缺失');
   await view.goTo({position:{longitude:p.longitude,latitude:p.latitude,z:z+1.65},heading:(p.heading+nextOffset+360)%360,tilt:90},{animate:false});if(ticket!==generation||!active)return;along=nextAlong;offset=nextOffset;$('walkPosition').textContent=`${route.name} · ${Math.round(along)} / ${Math.round(route.length)} m`;
   message(route.kind==='crossing'?'路口穿越路徑 · 現況及號誌仍需核對':'W / S 前後移動 · A / D 轉向 · Esc 返回');
  }catch(e){if(ticket===generation&&e.name!=='AbortError')message('地形或視角尚未完成，請重試；未使用推測高度。');}finally{if(ticket===generation)busy=false;}
 }
 async function enter(){if(!route||getPlace()!=='xinyi')return;onEnter();if(!active)previousCamera=view.camera.clone();generation++;active=true;document.body.classList.add('streetwalking');hud.hidden=false;await render();$('exitStreetWalk').focus();}
 function action(kind){if(!active||busy)return;if(kind==='left'||kind==='right'){render(along,(offset+(kind==='left'?-15:15)+360)%360);return;}const next=advanceWalk(route,along,kind==='forward'?3:-3);if(next.along===along){message('已到本段步行路徑端點。返回部署視角可選擇相鄰路徑。');return;}render(next.along,offset);}
 $('enterStreetWalk').onclick=enter;$('exitStreetWalk').onclick=exit;$('walkRoute').onchange=selected;for(const button of hud.querySelectorAll('[data-walk]'))button.onclick=()=>action(button.dataset.walk);
 document.addEventListener('keydown',event=>{if(!active||event.altKey||event.ctrlKey||event.metaKey||event.target.matches('input,select,textarea'))return;const key=event.key.toLowerCase(),kind={w:'forward',arrowup:'forward',s:'back',arrowdown:'back',a:'left',arrowleft:'left',d:'right',arrowright:'right'}[key];if(key==='escape'){event.preventDefault();event.stopImmediatePropagation();exit();}else if(kind){event.preventDefault();event.stopImmediatePropagation();action(kind);}},true);
 try{const response=await fetch('assets/streets-xinyi.json');if(!response.ok)throw Error('路網下載失敗');routes=walkRoutes((await response.json()).features);for(const [index,r] of routes.entries()){const option=document.createElement('option');option.value=r.id;option.textContent=`${r.name} ${index+1} · ${Math.round(r.length)} m`;$('walkRoute').append(option);}const nearest=closestWalkRoute(routes.filter(r=>r.kind==='sidewalk'),[121.5652845,25.033958]);if(nearest){$('walkRoute').value=nearest.route.id;selected();along=nearest.along;}$('walkReady').textContent=`中心街廓 ${routes.length} 段步行路徑可近看。寬度與高差仍待核對。`;}catch(e){$('walkReady').textContent='步行路網未能載入，請重新整理再試。';console.error(e);}refresh();
 return {changePlace:()=>{if(active)exit();refresh();},enter,exit};
}
