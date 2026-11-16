# -*- coding: utf-8 -*-
"""Web build of the smoke exhaust truck (排煙車 76) for fire-command-training.

The full export keeps every part as its own node (708 meshes, 7.9 MB), which
is right for editing but heavy for a browser: every node is a draw call and
the vertex data is stored as 32-bit floats.  This build:

  * drops the studio, bakes the constraints, turns lettering/hoses into mesh
    (same as export_glb.py), with the fan rig left in its stowed pose;
  * joins the parts under each rig node into one mesh (one primitive per
    material), so the rig stays animatable from JavaScript:
        Vehicle, Wheel spin *, Fan slew, Fan boom lift, Fan boom extend,
        Fan tilt, Fan rotor;
  * keeps apart what the page drives on its own:
        - every 'Red beacon lens' part (flashed left / right alternately),
        - the two lift ram halves (aimed at 'Lift ram anchor' / 'Lift ram eye'
          from JavaScript, since glTF has no Damped Track);
  * writes Smoke_Truck_web_raw.glb; gltfpack then quantizes the vertices
    (KHR_mesh_quantization, read by three.js GLTFLoader without a decoder)
    and lightly simplifies -> smoke-truck.glb.

Run:  blender -b --factory-startup -P export_web.py
"""
import bpy, os
from collections import defaultdict

OUT = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, 'Smoke_Truck.blend'))
scene = bpy.context.scene
vl = bpy.context.view_layer

# ------------------------------------------------------------ studio, baking
for o in [o for o in scene.objects
          if o.type in {'CAMERA', 'LIGHT'} or o.name.startswith(('Ground', 'Smoke mist'))]:
    bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.object.select_all(action='DESELECT')
constrained = [o for o in scene.objects if o.constraints]
for o in constrained:
    o.select_set(True)
if constrained:
    vl.objects.active = constrained[0]
    bpy.ops.object.visual_transform_apply()
    for o in constrained:
        for c in list(o.constraints):
            o.constraints.remove(c)

# text and hose curves -> mesh, every modifier applied, no shared mesh data
bpy.ops.object.select_all(action='DESELECT')
geo = [o for o in scene.objects if o.type in {'MESH', 'FONT', 'CURVE'}]
for o in geo:
    o.select_set(True)
vl.objects.active = geo[0]
bpy.ops.object.make_single_user(object=True, obdata=True)
bpy.ops.object.convert(target='MESH')
for o in [o for o in scene.objects if o.type == 'MESH' and not o.data.polygons]:
    bpy.data.objects.remove(o, do_unlink=True)

# ------------------------------------------------------------------- joining
KEEP = {'Lift ram barrel', 'Lift ram rod'}


def keep_apart(o):
    if o.name.split('.')[0] in KEEP:
        return True
    return any(m and m.name == 'Red beacon lens' for m in o.data.materials)


groups = defaultdict(list)
for o in scene.objects:
    if o.type == 'MESH' and o.parent and not o.children and not keep_apart(o):
        groups[o.parent.name].append(o)

for parent, objs in groups.items():
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=objs[0], object=objs[0],
                                       selected_objects=objs, selected_editable_objects=objs):
            bpy.ops.object.join()
    objs[0].name = objs[0].data.name = parent + ' parts'
    print('JOINED %-22s %3d parts' % (parent, len(objs)), flush=True)

meshes = [o for o in scene.objects if o.type == 'MESH']
print('WEB meshes %d (kept apart: %s)' % (len(meshes),
      ', '.join(sorted(o.name for o in meshes if not o.name.endswith(' parts')))), flush=True)

path = os.path.join(OUT, 'Smoke_Truck_web_raw.glb')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False,
                          export_apply=True, export_yup=True, export_materials='EXPORT',
                          export_cameras=False, export_lights=False, export_extras=True,
                          export_animations=False)
print('EXPORTED %s  %.2f MB' % (path, os.path.getsize(path) / 1048576.0), flush=True)
