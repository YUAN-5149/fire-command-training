export async function createNeighborReview({view,map,Graphic,GraphicsLayer,getPlace}){
 const layer=new GraphicsLayer({title:'ATT輪廓交叉核對線・非建物實體',elevationInfo:{mode:'absolute-height'},minScale:25000});map.add(layer);layer.visible=false;
 const host=document.getElementById('neighborStudyControl');host.insertAdjacentHTML('beforeend','<label class="street-toggle"><input id="neighborOutlineEnabled" type="checkbox"> 顯示輪廓對照線（抬高展示）</label><button id="neighborOutlineView" disabled>核對相鄰建物輪廓</button><p id="neighborOutlineStatus" role="status">正在比對輪廓…</p><p>藍線：OSM 商場輪廓。橙線：本批試套的官方牆面。對照線抬高顯示，非建物實體或救援開口；輪廓一致只能支持位置，不能確認門口及現況尺寸。</p>');
 const $=id=>document.getElementById(id);let data=null,moving=false;
 function visibility(){layer.visible=getPlace()==='xinyi'&&!host.hidden&&$('neighborOutlineEnabled').checked;}
 $('neighborOutlineEnabled').onchange=visibility;
 try{const r=await fetch('assets/att-frontage-review.json?v=70');if(!r.ok)throw Error('輪廓資料未載入');data=await r.json();
  const line=(paths,color,attributes)=>new Graphic({geometry:{type:'polyline',paths,hasZ:true,spatialReference:{wkid:4326}},symbol:{type:'line-3d',symbolLayers:[{type:'line',size:attributes.name.startsWith('官方')?6:3,material:{color}}]},attributes,popupTemplate:{title:'輪廓核對・{name}',content:'{note}'}});
  layer.add(line([data.footprint.map(p=>[...p,80])],'#72d0ee',{name:'OSM ATT 4 FUN',note:'OSM way '+data.osmId+'。80 m 為抬高展示平面，非建物高程。'}));
  for(const w of data.selectedWalls)layer.add(line([[w.a.slice(0,2).concat(80.2),w.b.slice(0,2).concat(80.2)]],'#ffc277',{name:'官方量體 '+w.buildingId,note:'原牆面幾何寬 '+w.width.toFixed(2)+' m；非實測店面淨寬。端點與OSM輪廓距離 '+w.endpointDistanceM.map(x=>x.toFixed(2)).join(' / ')+' m。'}));
  $('neighborOutlineStatus').textContent='3 段牆面分屬 265936、266115、266138，端點與輪廓距離約 0.02–0.26 m；原試套的內側牆已排除。建物身份、店面柱距及入口仍待現況驗證。';$('neighborOutlineView').disabled=false;
 }catch(e){$('neighborOutlineStatus').textContent='輪廓比對未完成，保留原建物。';console.error(e);}
 $('neighborOutlineView').onclick=async()=>{if(!data||moving||getPlace()!=='xinyi')return;moving=true;$('neighborOutlineEnabled').checked=true;visibility();try{await view.goTo({position:{longitude:121.56604,latitude:25.03532,z:340},heading:0,tilt:0},{animate:false});}catch(e){if(e.name!=='AbortError')$('neighborOutlineStatus').textContent='輪廓核對視角未完成，請重試。';}finally{moving=false;}};
 return {changePlace:visibility};
}
