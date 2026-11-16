# -*- coding: utf-8 -*-
"""Export the smoke exhaust truck (排煙車 76) to glTF binary (.glb).

Before glTF sees the master file:

  * the lettering and the hoses are curve data, which glTF has no place for,
    so they are converted to mesh (the CJK glyphs come across as geometry);
  * the studio floor, lights and cameras belong to the render, not the
    asset, so they are dropped;
  * the reel cable's Stretch To is baked to its stowed transform.

Run:  blender -b --factory-startup -P export_glb.py
      SMOKE_ANIMATED=1 -> reads Smoke_Truck_animated.blend and writes
      Smoke_Truck_animated(.glb / _draco.glb) with the fan lift / slew / tilt keys
"""
import bpy, math, os
from mathutils import Vector

OUT = os.path.dirname(os.path.abspath(__file__))
ANIMATED = bool(os.environ.get('SMOKE_ANIMATED'))
STEM = 'Smoke_Truck_animated' if ANIMATED else 'Smoke_Truck'
SRC = os.path.join(OUT, STEM + '.blend')
bpy.ops.wm.open_mainfile(filepath=SRC)
scene = bpy.context.scene


def world_bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if o.type != 'MESH':
            continue
        ob = o.evaluated_get(dg)
        me = ob.to_mesh()
        for v in me.vertices:
            w = ob.matrix_world @ v.co
            lo = Vector((min(lo[i], w[i]) for i in range(3)))
            hi = Vector((max(hi[i], w[i]) for i in range(3)))
        ob.to_mesh_clear()
    return lo, hi


# ------------------------------------------------ strip the studio furniture
# the water-mist cone is a volume shader, which glTF cannot carry - it would
# arrive as a solid grey cone, so it stays in Blender and the video only
drop = [o for o in scene.objects
        if o.type in {'CAMERA', 'LIGHT'} or o.name.startswith(('Ground', 'Smoke mist'))]
for o in drop:
    bpy.data.objects.remove(o, do_unlink=True)
print('DROPPED', len(drop), 'studio objects', flush=True)

# --------------------------------------------------- bake the aimed linkages
bpy.ops.object.select_all(action='DESELECT')
constrained = [o for o in scene.objects if o.constraints]
for o in constrained:
    o.select_set(True)
if constrained and ANIMATED:
    # the reel cable (Stretch To) changes length every frame the column
    # moves, so bake its visual transform per frame into keys
    bpy.context.view_layer.objects.active = constrained[0]
    bpy.ops.nla.bake(frame_start=scene.frame_start, frame_end=scene.frame_end, step=1,
                     only_selected=True, visual_keying=True, clear_constraints=True,
                     use_current_action=True, bake_types={'OBJECT'})
    scene.frame_set(scene.frame_start)
elif constrained:
    bpy.context.view_layer.objects.active = constrained[0]
    bpy.ops.object.visual_transform_apply()
    for o in constrained:
        for c in list(o.constraints):
            o.constraints.remove(c)
print('BAKED', len(constrained), 'constrained objects', flush=True)

# --------------------------------------------------- lettering becomes mesh
bpy.ops.object.select_all(action='DESELECT')
curves = [o for o in scene.objects if o.type in {'FONT', 'CURVE'}]
for o in curves:
    o.select_set(True)
if curves:
    bpy.context.view_layer.objects.active = curves[0]
    bpy.ops.object.convert(target='MESH')
    # a glyph with no extrusion converts to an empty mesh; drop those
    for o in list(curves):
        if o.type == 'MESH' and len(o.data.polygons) == 0:
            bpy.data.objects.remove(o, do_unlink=True)
print('CONVERTED', len(curves), 'text objects to mesh', flush=True)

bpy.context.view_layer.update()
meshes = [o for o in scene.objects if o.type == 'MESH']
empties = [o for o in scene.objects if o.type == 'EMPTY']
lo, hi = world_bounds(meshes)
print('SOURCE  meshes %d  empties %d' % (len(meshes), len(empties)), flush=True)
print('SOURCE  extent %.4f x %.4f x %.4f' % (hi.x - lo.x, hi.y - lo.y, hi.z - lo.z),
      flush=True)

tris = 0
dg = bpy.context.evaluated_depsgraph_get()
for o in meshes:
    me = o.evaluated_get(dg).to_mesh()
    me.calc_loop_triangles()
    tris += len(me.loop_triangles)
    o.evaluated_get(dg).to_mesh_clear()
print('SOURCE  triangles %d' % tris, flush=True)

# ------------------------------------------------------------------ export
COMMON = dict(export_format='GLB',
              use_selection=False,
              export_apply=True,            # bake modifiers into the meshes
              export_yup=True,              # glTF is Y-up
              export_materials='EXPORT',
              export_cameras=False,
              export_lights=False,
              export_extras=True,           # keeps the scene custom properties
              export_animations=ANIMATED)

targets = [(STEM + '.glb', {}),
           (STEM + '_draco.glb',
            dict(export_draco_mesh_compression_enable=True,
                 export_draco_mesh_compression_level=6,
                 export_draco_position_quantization=14,
                 export_draco_normal_quantization=10))]

def merge_clips(path, clip='Fan lift and slew'):
    """Fold the per-node animations Blender writes into one glTF clip.

    The exporter emits a separate animation for every animated node, so a
    viewer offers fourteen clips that must be started together.  Only the
    JSON chunk changes: channels and samplers are concatenated with their
    sampler indices offset, the accessors in the binary chunk are untouched.
    """
    import json, struct
    with open(path, 'rb') as fh:
        data = fh.read()
    n = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + n])
    anims = doc.get('animations', [])
    if len(anims) < 2:
        return 0
    merged = {'name': clip, 'channels': [], 'samplers': []}
    for a in anims:
        base = len(merged['samplers'])
        merged['samplers'] += a['samplers']
        for c in a['channels']:
            c = dict(c)
            c['sampler'] += base
            merged['channels'].append(c)
    doc['animations'] = [merged]
    js = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    js += b' ' * (-len(js) % 4)
    rest = data[20 + n:]
    out = (struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + len(rest))
           + struct.pack('<II', len(js), 0x4E4F534A) + js + rest)
    with open(path, 'wb') as fh:
        fh.write(out)
    return len(merged['channels'])


for name, extra in targets:
    path = os.path.join(OUT, name)
    kwargs = dict(COMMON)
    kwargs.update(extra)
    try:
        bpy.ops.export_scene.gltf(filepath=path, **kwargs)
    except TypeError as exc:
        # older/newer exporters rename the odd keyword; retry with the basics
        print('retrying %s without optional keys: %s' % (name, exc), flush=True)
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB',
                                  export_apply=True)
    if ANIMATED:
        print('MERGED %d channels into one clip' % merge_clips(path), flush=True)
    print('EXPORTED %s  %.2f MB' % (name, os.path.getsize(path) / 1048576.0),
          flush=True)

# -------------------------------------------------- round trip verification
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, STEM + '.glb'))
imported = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.context.view_layer.update()
lo2, hi2 = world_bounds(imported)
print('REIMPORT meshes %d' % len(imported), flush=True)
print('REIMPORT extent %.4f x %.4f x %.4f'
      % (hi2.x - lo2.x, hi2.z - lo2.z, hi2.y - lo2.y), flush=True)
# glTF is Y-up, so the re-imported axes come back permuted; compare sorted
a = sorted((hi.x - lo.x, hi.y - lo.y, hi.z - lo.z))
b = sorted((hi2.x - lo2.x, hi2.y - lo2.y, hi2.z - lo2.z))
err = max(abs(p - q) for p, q in zip(a, b))
print('ROUNDTRIP max dimension error %.5f m  ->  %s'
      % (err, 'OK' if err < 0.005 else 'MISMATCH'), flush=True)
print('EXPORT OK', flush=True)
