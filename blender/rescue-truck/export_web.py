# -*- coding: utf-8 -*-
"""Web build of the rescue equipment truck (救助器材車 信義71) for
fire-command-training.

The full export keeps every part as its own node (~650 meshes, 6.9 MB), which
is right for editing but heavy for a browser: every node is a draw call and
the vertex data is stored as 32-bit floats.  This build (same recipe as the
smoke truck's export_web.py):

  * drops the studio, bakes the constraints, turns lettering/hoses into mesh,
    with every rig left stowed;
  * joins the parts under each rig node into one mesh (one primitive per
    material), so the rig stays animatable from JavaScript:
        Vehicle, Wheel spin *, Stabiliser extend/leg L/R, Light mast stage 2/3,
        Light head pan/tilt, Crane slew, Crane inner boom, Crane outer boom,
        Crane extension, Crane hook hang, Crane hook lower;
  * keeps apart what the page drives on its own:
        - every 'Red beacon lens' part (flashed left / right alternately),
        - the six ram halves (lift, knuckle, extension; each aimed at the other
          half's pin from JavaScript, since glTF has no Damped Track),
        - the hook rope and the hoist wire (stretched from JavaScript);
  * writes Rescue_Truck_web_raw.glb; gltfpack then quantizes the vertices and
    applies meshopt compression -> rescue-truck.glb.

Run:  blender -b --factory-startup -P export_web.py
"""
import bpy, os
from collections import defaultdict

OUT = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, 'Rescue_Truck.blend'))
scene = bpy.context.scene
vl = bpy.context.view_layer
scene.frame_set(1)

# ------------------------------------------------------------ studio, baking
for o in [o for o in scene.objects if o.type in {'CAMERA', 'LIGHT'} or o.name.startswith('Ground')]:
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

# text and hose curves -> mesh (hose hooks applied), no shared mesh data
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
KEEP = {'Lift ram barrel', 'Lift ram rod', 'Knuckle ram barrel', 'Knuckle ram rod',
        'Extension ram barrel', 'Extension ram rod', 'Hook rope', 'Hoist wire'}


def is_beacon(o):
    return any(m and m.name == 'Red beacon lens' for m in o.data.materials)


groups = defaultdict(list)
for o in scene.objects:
    if o.type != 'MESH' or not o.parent or o.children or o.name.split('.')[0] in KEEP:
        continue
    if is_beacon(o):
        # red lenses join per side (driver -Y / kerb +Y) so the page can
        # flash left and right alternately with two meshes instead of ten
        y = sum((o.matrix_world @ v.co).y for v in o.data.vertices) / len(o.data.vertices)
        groups[(o.parent.name, 'beacon ' + ('L' if y < 0 else 'R'))].append(o)
    else:
        groups[(o.parent.name, 'parts')].append(o)

for (parent, kind), objs in groups.items():
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=objs[0], object=objs[0],
                                       selected_objects=objs, selected_editable_objects=objs):
            bpy.ops.object.join()
    objs[0].name = objs[0].data.name = parent + ' ' + kind
    print('JOINED %-30s %3d parts' % (parent + ' ' + kind, len(objs)), flush=True)

meshes = [o for o in scene.objects if o.type == 'MESH']
print('WEB meshes %d (kept apart: %s)' % (len(meshes),
      ', '.join(sorted(o.name for o in meshes if not o.name.endswith(' parts')))), flush=True)

path = os.path.join(OUT, 'Rescue_Truck_web_raw.glb')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False,
                          export_apply=True, export_yup=True, export_materials='EXPORT',
                          export_cameras=False, export_lights=False, export_extras=True,
                          export_animations=False)
print('EXPORTED %s  %.2f MB' % (path, os.path.getsize(path) / 1048576.0), flush=True)
