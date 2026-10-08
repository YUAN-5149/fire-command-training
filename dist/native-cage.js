import * as T from 'three';

export function createCageSwivel(level,floor,anchor){
 const children=[...level.children],centre=level.worldToLocal(floor.localToWorld(anchor.clone()));
 const swivel=new T.Group();swivel.name='Cage_platform_swivel';swivel.position.copy(centre);level.add(swivel);swivel.updateWorldMatrix(true,false);
 children.forEach(child=>swivel.attach(child));
 const material=new T.MeshStandardMaterial({color:'#65737b',metalness:.7,roughness:.4});
 const bearing=new T.Mesh(new T.CylinderGeometry(.22,.22,.08,24),material);bearing.position.copy(centre).add(new T.Vector3(0,-.13,0));bearing.name='Cage_swivel_bearing';level.add(bearing);
 const link=new T.Mesh(new T.BoxGeometry(Math.abs(centre.x)+.12,.08,.2),material);link.position.set(centre.x/2,centre.y-.13,centre.z);link.name='Cage_swivel_mount';level.add(link);
 return swivel;
}

// Reparent the authored monitor meshes around their visible slew/trunnion axes.
export function createNativeMonitor(source,platform){
 const get=name=>source.getObjectByName(name),tip=get('Nozzle_tip');
 const yaw=new T.Group();yaw.name='Monitor_yaw';yaw.position.copy(platform.worldToLocal(get('Monitor_slew_collar').getWorldPosition(new T.Vector3())));platform.add(yaw);yaw.updateWorldMatrix(true,false);
 const pitch=new T.Group();pitch.name='Monitor_pitch';pitch.position.copy(yaw.worldToLocal(get('Trunnion_pin').getWorldPosition(new T.Vector3())));yaw.add(pitch);pitch.updateWorldMatrix(true,false);
 const pitching=['Monitor_barrel','Monitor_nozzle','Nozzle_tip'];
 const slewing=['Monitor_housing','Monitor_data_plate','Monitor_handwheel','Monitor_rail_stay','Monitor_rail_stay001','Trunnion_cheek','Trunnion_cheek001','Trunnion_pin'];
 slewing.forEach(name=>{const o=get(name);if(o)yaw.attach(o);});pitching.forEach(name=>pitch.attach(get(name)));
 tip.geometry.computeBoundingBox();const mouth=tip.geometry.boundingBox.getCenter(new T.Vector3());mouth.y=tip.geometry.boundingBox.max.y;
 const muzzle=new T.Object3D();muzzle.name='Native_monitor_muzzle';muzzle.position.copy(mouth);tip.add(muzzle);source.updateMatrixWorld(true);
 const direction=new T.Vector3(0,1,0).transformDirection(tip.matrixWorld).applyQuaternion(platform.getWorldQuaternion(new T.Quaternion()).invert());
 const restElevation=Math.atan2(direction.y,Math.hypot(direction.x,direction.z));
 function aimAt(target){
  const previous=[yaw.rotation.y,pitch.rotation.z];
  const local=platform.worldToLocal(target.clone()).sub(yaw.position);
  yaw.rotation.y=Math.atan2(local.z,-local.x);yaw.updateWorldMatrix(true,true);
  const fromPitch=yaw.worldToLocal(target.clone()).sub(pitch.position);
  pitch.rotation.z=restElevation-Math.atan2(fromPitch.y,Math.hypot(fromPitch.x,fromPitch.z));
  source.updateMatrixWorld(true);
  if(rig.validate&&!rig.validate()){yaw.rotation.y=previous[0];pitch.rotation.z=previous[1];source.updateMatrixWorld(true);return false;}return true;
 }
 const rig={yaw,pitch,muzzle,tip,aimAt,direction:()=>new T.Vector3(0,1,0).transformDirection(tip.matrixWorld)};return rig;
}
