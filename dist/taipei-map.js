(() => {
  'use strict';
  const places={fujin:{name:'富錦街周邊',lon:121.557,lat:25.060},xinyi:{name:'信義商圈',lon:121.5654,lat:25.0338},ximen:{name:'西門街區',lon:121.5077,lat:25.0421}};
  const source='https://www.historygis.udd.gov.taipei/arcgis/rest/services/Hosted/LOD1_2024/SceneServer/layers/0';
  const el=id=>document.getElementById(id),select=el('place');
  const requested=new URL(location.href).searchParams.get('place');select.value=Object.hasOwn(places,requested)?requested:'fujin';
  let streetWalk=null,district=null,facade=null,streets=null,fixtures=null,deployment=null,view=null,ready=false,sequence=0,failed=false;
  function showPlace(){const p=places[select.value];el('placeTitle').textContent=p.name;el('coordinates').textContent=`中心：${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}（WGS84）`;return p;}
  function fail(message,error){failed=true;el('mapError').hidden=false;el('errorMessage').textContent=message;el('mapStatus').textContent='圖資尚未成功顯示';if(error)console.error(error);}
  async function go(){streetWalk?.changePlace();district?.changePlace();facade?.changePlace();streets?.changePlace();fixtures?.changePlace();deployment?.changePlace();const p=showPlace();const url=new URL(location.href);url.searchParams.set('place',select.value);history.replaceState(null,'',url);if(!ready)return;const ticket=++sequence;try{await view.goTo({target:[p.lon,p.lat],zoom:18,tilt:60,heading:0},{animate:false});if(ticket===sequence)el('mapStatus').textContent='已定位 '+p.name+'；圖資依視角載入';}catch(error){if(error.name!=='AbortError')fail('地點定位失敗，請重新載入。',error);}}
  select.onchange=go;el('resetMap').onclick=go;el('retryMap').onclick=()=>location.reload();showPlace();
  const script=document.createElement('script');script.src='https://js.arcgis.com/4.33/';
  script.onerror=()=>fail('地圖程式無法下載，請確認網路連線後重試。');
  script.onload=()=>{
    window.require(['esri/Map','esri/Basemap','esri/layers/OpenStreetMapLayer','esri/layers/SceneLayer','esri/views/SceneView','esri/core/reactiveUtils','esri/Graphic','esri/layers/GraphicsLayer','esri/geometry/Point','esri/geometry/Multipoint','esri/geometry/Mesh','esri/geometry/support/MeshMaterialMetallicRoughness'],async(Map,Basemap,OpenStreetMapLayer,SceneLayer,SceneView,reactiveUtils,Graphic,GraphicsLayer,Point,Multipoint,Mesh,Material)=>{
      try{
        const buildings=new SceneLayer({url:source,title:'臺北市 113 年版三維建物',outFields:['*'],popupEnabled:true});
        const roads=new OpenStreetMapLayer();
        const map=new Map({basemap:new Basemap({baseLayers:[roads],title:'OpenStreetMap'}),ground:'world-elevation',layers:[buildings]});
        const p=showPlace();
        view=new SceneView({container:'mapView',map,qualityProfile:'medium',camera:{position:{longitude:p.lon,latitude:p.lat-.003,z:420},heading:0,tilt:60},popup:{dockEnabled:true,dockOptions:{position:'bottom-right',breakpoint:false}}});
        reactiveUtils.watch(()=>view.fatalError,error=>{if(error)fail('3D 顯示中斷。請使用支援 WebGL 的瀏覽器，並確認硬體加速已開啟。',error);});
        await view.when();await buildings.load();
        const layerView=await view.whenLayerView(buildings);
        roads.load().catch(error=>fail('道路底圖未能載入，建物位置請先勿作道路部署判斷。',error));
        ready=true;el('resetMap').disabled=false;await go();
        // 由信義街景開啟時，定位到街景中的位置。
        {const q=new URLSearchParams(location.search),lon=+q.get('lon'),lat=+q.get('lat');if(q.has('lon')&&Number.isFinite(lon)&&Number.isFinite(lat)&&Math.abs(lon-p.lon)<.05&&Math.abs(lat-p.lat)<.05){const h=+q.get('heading');try{await view.goTo({target:[lon,lat],zoom:19,tilt:60,heading:Number.isFinite(h)?h:0},{animate:false});el('mapStatus').textContent='已定位到信義街景中的位置';}catch(error){if(error.name!=='AbortError')console.error(error);}}}
        try{const {createStreets}=await import('./geo-streets.js?v=70c');streets=await createStreets({view,map,Graphic,GraphicsLayer,Point,Multipoint,Mesh,Material,getPlace:()=>select.value,onSurfaceChange:()=>deployment?.refreshSurface()});}catch(error){el('streets').textContent='街道圖層未能載入，請重新整理再試。';console.error(error);}
        try{const {createStreetWalk}=await import('./geo-streetwalk.js?v=71');streetWalk=await createStreetWalk({view,map,Point,getPlace:()=>select.value,onEnter:()=>el('cancelGeo')?.click()});}catch(error){el('streetWalk').textContent='街景模式未能載入，請重新整理再試。';console.error(error);}
        try{const {createGeoDeployment}=await import('./geo-deployment.js?v=s13');deployment=await createGeoDeployment({view,map,buildings,buildingView:layerView,Graphic,GraphicsLayer,Point,getPlace:()=>select.value,getSurfaceHeight:point=>streets?.surfaceHeight(point)||0});}catch(error){el('deployment').textContent='部署介面未能載入，請重新整理再試。';console.error(error);}
        try{const {createDistrictAppearance}=await import('./geo-district.js?v=70c');district=await createDistrictAppearance({view,map,buildings,Graphic,GraphicsLayer,Mesh,Material,getPlace:()=>select.value});}catch(error){el('districtAppearance').textContent='街區外觀未能載入，請重新整理。';console.error(error);}
        try{const {createTargetFacade}=await import('./geo-target.js');facade=await createTargetFacade({view,map,Graphic,GraphicsLayer,Mesh,Material,getPlace:()=>select.value,setTarget:data=>deployment?.setPresetTarget(data)});}catch(error){el('targetFacade').textContent='目標外觀未能載入，請重新整理再試。';console.error(error);}
        try{const {createStreetFixtures}=await import('./geo-street-fixtures.js?v=70c');fixtures=await createStreetFixtures({view,map,Graphic,GraphicsLayer,Point,getRenderedSurface:()=>streets.getRenderedSurface(),setLaneReview:(v,w)=>streets.setLaneReview(v,w),getPlace:()=>select.value,features:async()=>(await fetch('assets/streets-xinyi.json').then(r=>{if(!r.ok)throw Error('路網未完成');return r.json();})).features});}catch(error){console.error(error);}
        if(select.value==='xinyi'&&new URLSearchParams(location.search).get('verify')==='street')el('songzhiRenderView')?.click();
        if(select.value==='xinyi'&&new URLSearchParams(location.search).get('verify')==='markings'){const c=el('laneReviewVisible');if(c){c.checked=true;c.dispatchEvent(new Event('change'));}el('songzhiRenderView')?.click();}
        if(select.value==='xinyi'&&new URLSearchParams(location.search).get('verify')==='intersection'){const c=el('junctionReviewVisible');if(c){c.checked=true;c.dispatchEvent(new Event('change'));}el('junctionReviewView')?.click();}
        if(select.value==='xinyi'&&new URLSearchParams(location.search).get('verify')==='waiting'){for(const id of ['junctionReviewVisible','waitingReviewVisible']){const c=el(id);if(c){c.checked=true;c.dispatchEvent(new Event('change'));}}el('waitingReviewView')?.click();}
        if(select.value==='xinyi'&&new URLSearchParams(location.search).get('verify')==='paint')el('paintReviewView')?.click();
        if(select.value==='xinyi'&&new URLSearchParams(location.search).get('verify')==='neighbor-outline')el('neighborOutlineView')?.click();
        if(select.value==='xinyi'&&new URLSearchParams(location.search).get('verify')==='neighbor')el('focusAttStudy')?.click();
        if(select.value==='xinyi'&&new URLSearchParams(location.search).get('verify')==='fixtures')el('crossingFixtureView')?.click();
        if(select.value==='xinyi'&&new URLSearchParams(location.search).get('verify')==='walk')await streetWalk?.enter();
        reactiveUtils.watch(()=>view.updating||layerView.updating,busy=>{if(!failed)el('mapStatus').textContent=busy?'正在載入 '+places[select.value].name+' 的圖資…':'官方建物圖層已載入 · '+places[select.value].name;},{initial:true});
      }catch(error){fail('無法完成 3D 圖資載入，可能是官方服務連線或 WebGL 支援問題。請重試；本頁不會以示意建物替代。',error);}
    },error=>fail('地圖元件載入失敗，請重試。',error));
  };
  document.head.append(script);
})();
