import * as T from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';

export async function loadAmbulance() {
  return (await new GLTFLoader().loadAsync(new URL('./assets/ambulance-detailed.glb', import.meta.url).href)).scene;
}

export function createImportedAmbulance(scene, template, x, z) {
  const root = new T.Group(), visual = template.clone(true), lights = [];
  root.name = '救護車・精細模型';
  // Native metres and intact part transforms. Rotate the -X nose to scene -Z.
  visual.rotation.y = -Math.PI / 2;
  root.add(visual);
  visual.updateWorldMatrix(true, true);
  const bounds = new T.Box3().setFromObject(visual);
  const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
  visual.position.set(-center.x, -bounds.min.y, -center.z);
  // Road box: centre -0.1, height 0.07 => surface -0.065.
  root.position.set(x, -0.065, z);
  scene.add(root);
  visual.updateWorldMatrix(true, true);
  visual.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    // Animate emergency flashers only, leaving brake lamps and work lamps intact.
    if (/Side_red_flasher(?!_gasket)|Rear_upper_red_flasher|Roof_slope_integrated_emergency_lens/.test(o.name)) {
      o.material = o.material.clone();
      o.material.color.set('#bf1016');
      o.material.emissive.set('#ff1208');
      o.material.emissiveIntensity = .1;
      o.material.toneMapped = false;
      const local = root.worldToLocal(new T.Box3().setFromObject(o).getCenter(new T.Vector3()));
      o.userData.flashPhase = local.x > 0 ? 0 : Math.PI;
      lights.push(o);
    }
  });
  const collider = new T.Mesh(new T.BoxGeometry(2.02, size.y, size.z), new T.MeshBasicMaterial());
  collider.name = '救護車碰撞範圍';
  collider.position.y = size.y / 2;
  collider.visible = false;
  root.add(collider);
  root.userData.model = 'ambulance-detailed';
  return {root, visual, lights};
}
