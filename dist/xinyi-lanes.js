// 信義街景漫遊：逐車道路面（assets/lanes-xinyi.json，osm2streets 由 OSM 產生）。
// 車道、路肩、人行道、自行車道、路口多邊形與中線、車道線、箭頭、停止線，
// 依地面格網高程貼地，每種材質合併成一個網格。寬度與標線依 OSM 標記推定，非實測。
// 純函式部分（buildLaneGeometry）不依賴 three.js 的場景，可於 Node 測試。

// 每類：[顏色, 離地高度 m]；人行道類略高，模擬路緣。
export const LANE_STYLE={
 Driving:['#3e4145',.03],Bus:['#7a3c32',.032],Shoulder:['#55575a',.03],Construction:['#6b5d3e',.03],
 Biking:['#4f6b4a',.034],SharedUse:['#9c9a7e',.1],Sidewalk:['#a9a296',.1],Footway:['#b3ab9c',.1],
 intersection:['#3b3e42',.028],corner:['#a9a296',.1],
 center:['#e6b422',.045],separator:['#eeeeea',.045],arrow:['#eeeeea',.046],stop:['#eeeeea',.046],
 buffer:['#eeeeea',.045],bike:['#eeeeea',.045]
};

// rings: [[x0,z0,x1,z1,...], ...] → 三角化後的位置陣列（x,y,z），y＝地面高程＋偏移。
export function buildLaneGeometry(rings,{triangulate,groundAt,lift}){
 const pos=[];
 for(const r of rings){
  const pts=[];for(let i=0;i<r.length;i+=2)pts.push({x:r[i],y:r[i+1]});
  // 統一環向（x 東、z 南座標下為順時針，三角形法線朝上）
  let area=0;for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];area+=p.x*q.y-q.x*p.y;}
  if(area<0)pts.reverse();
  let tris;try{tris=triangulate(pts);}catch{continue;}
  for(const t of tris)for(const k of t){const x=pts[k].x,z=pts[k].y;pos.push(x,groundAt(x,z)+lift,z);}
 }
 return new Float32Array(pos);
}

export function laneGroups(data){
 const g={};
 for(const [k,v] of Object.entries(data.lanes))g[k]=v;
 g.intersection=data.intersections;g.corner=data.corners;
 for(const [k,v] of Object.entries(data.markings))g[k]=v;
 return g;
}

// three.js：回傳加入場景的群組。
export function addLanesToScene({T,scene,data,ground}){
 const group=new T.Group();group.name='osm2streets lanes';
 const triangulate=pts=>T.ShapeUtils.triangulateShape(pts.map(p=>new T.Vector2(p.x,p.y)),[]);
 for(const [kind,rings] of Object.entries(laneGroups(data))){
  if(!rings?.length)continue;
  const [color,lift]=LANE_STYLE[kind]??['#777777',.03],marking=Object.hasOwn(data.markings,kind);
  const pos=buildLaneGeometry(rings,{triangulate,groundAt:(x,z)=>ground.at(x,z),lift});
  if(!pos.length)continue;
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(pos,3));geo.computeVertexNormals();
  const mat=new T.MeshStandardMaterial({color,roughness:marking?.6:.95,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:marking?-4:-2,polygonOffsetUnits:marking?-4:-2});
  const mesh=new T.Mesh(geo,mat);mesh.name='lanes '+kind;mesh.userData.inferredPaint=marking;mesh.receiveShadow=true;mesh.castShadow=false;group.add(mesh);
 }
 scene.add(group);return group;
}
