# -*- coding: utf-8 -*-
"""Animate the water tanker: drive in on rolling wheels, then work the monitor.

Keys only the rig empties that build_water_tanker.py already set up:

    Vehicle              x from DRIVE_FROM to 0, eased to a stop
    Wheel spin *         rotation Y = (x - DRIVE_FROM) / tyre radius, so the
                         tread never slides on the floor (- is forward roll)
    Monitor slew         rotation Z, + swings the nozzle to the left (-Y)
    Monitor elevation    rotation Y, + raises the nozzle above its 14 deg rest
    Water jet            scale 0 -> 1 while the monitor is flowing

and flashes the red lamps while the truck is on the move.

Writes Water_Tanker_animated.blend next to this script and, unless
TANKER_NO_RENDER is set, an EEVEE preview: PNG frames under FRAME_DIR, encoded
to tanker_animation.mp4 there with ffmpeg (video lives on D: per the disk
rules on this machine).

Run:  blender -b --factory-startup -P animate_tanker.py
"""
import bpy, math, os, shutil, subprocess
from mathutils import Vector

OUT = os.path.dirname(os.path.abspath(__file__))
FRAME_DIR = os.environ.get('TANKER_FRAME_DIR', r'D:\Claude\水庫車動畫')
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, 'Water_Tanker.blend'))
s = bpy.context.scene
obj = bpy.data.objects

FPS = 30
F_END = 360
DRIVE_FROM, F_STOP = 15.0, 150          # metres behind the mark, frame it stops
R = s['Tyre radius']

s.render.fps = FPS
s.frame_start, s.frame_end = 1, F_END

vehicle = obj['Vehicle']
wheels = [o for o in obj if o.name.startswith('Wheel spin')]
slew, elev = obj['Monitor slew'], obj['Monitor elevation']


def ease_out(t):
    return 1.0 - (1.0 - t) ** 3


EDIT = bpy.context.preferences.edit
EDIT.keyframe_new_interpolation_type = 'LINEAR'

# ----------------------------------------------------------------- drive in
# keyed every frame so the wheel angle follows the eased travel exactly
for f in range(1, F_END + 1):
    t = min(1.0, (f - 1) / (F_STOP - 1))
    x = DRIVE_FROM * (1.0 - ease_out(t))
    vehicle.location.x = x
    vehicle.keyframe_insert('location', index=0, frame=f)
    for w in wheels:
        w.rotation_euler.y = (x - DRIVE_FROM) / R
        w.keyframe_insert('rotation_euler', index=1, frame=f)


EDIT.keyframe_new_interpolation_type = 'BEZIER'

# ---------------------------------------------------------- monitor routine
def key_monitor(f, slew_deg, elev_deg):
    slew.rotation_euler.z = math.radians(slew_deg)
    slew.keyframe_insert('rotation_euler', index=2, frame=f)
    elev.rotation_euler.y = math.radians(elev_deg)
    elev.keyframe_insert('rotation_euler', index=1, frame=f)


for f, sd, ed in ((1, 0, 0), (165, 0, 0),
                  (205, -35, 12),         # swing out over the kerb side (+Y)
                  (240, -35, 12),
                  (285, 15, 20),          # sweep back across while raising
                  (315, -5, 16),
                  (345, 0, 0), (F_END, 0, 0)):
    key_monitor(f, sd, ed)

# ---------------------------------------------------------------- water jet
# A drooping stream built in the elevation empty's frame, origin at the
# nozzle tip, grown in by scale while the monitor flows.
el0 = math.radians(s['Monitor barrel rest elevation deg'])
d = Vector((-math.cos(el0), 0, math.sin(el0)))
tip = Vector(s['Monitor trunnion']) + d * (.620 + .215)
LEN, SEG, RING = 11.0, 40, 16
verts, faces = [], []
for i in range(SEG + 1):
    u = i / SEG
    c = d * (LEN * u) + Vector((0, 0, -5.5 * u * u))         # gravity droop
    r = .030 + .28 * u ** 1.6                                 # stream breaks up
    for j in range(RING):
        a = math.tau * j / RING
        # ring in the plane square to the barrel: (0,1,0) and (d.z,0,-d.x)
        verts.append(tuple(c + Vector((r * math.sin(a) * d.z, r * math.cos(a),
                                       -r * math.sin(a) * d.x))))
for i in range(SEG):
    for j in range(RING):
        k = (j + 1) % RING
        faces.append((i * RING + j, i * RING + k, (i + 1) * RING + k, (i + 1) * RING + j))
me = bpy.data.meshes.new('Water jet')
me.from_pydata(verts, [], faces)
me.update()
jet = bpy.data.objects.new('Water jet', me)
s.collection.objects.link(jet)
jet.location = tip
wm = bpy.data.materials.new('Water')
wm.use_nodes = True
p = wm.node_tree.nodes.get('Principled BSDF')
p.inputs['Base Color'].default_value = (.80, .90, 1.0, 1)
p.inputs['Roughness'].default_value = .18
p.inputs['Alpha'].default_value = .55
if 'Transmission Weight' in p.inputs:
    p.inputs['Transmission Weight'].default_value = .5
if 'Emission Color' in p.inputs:
    p.inputs['Emission Color'].default_value = (.75, .88, 1.0, 1)
    p.inputs['Emission Strength'].default_value = .25
for attr, value in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
    if hasattr(wm, attr):
        try:
            setattr(wm, attr, value)
        except Exception:
            pass
me.materials.append(wm)
for poly in me.polygons:
    poly.use_smooth = True
bpy.context.view_layer.update()
jet.parent = elev
jet.matrix_parent_inverse = elev.matrix_world.inverted()

for f, sc in ((1, 0.0), (208, 0.0), (222, 1.0), (330, 1.0), (342, 0.0)):
    jet.scale = (sc,) * 3 if sc else (1e-4,) * 3
    jet.keyframe_insert('scale', frame=f)

# --------------------------------------------------------- flashing beacons
beacon = bpy.data.materials.get('Red beacon lens')
if beacon:
    EDIT.keyframe_new_interpolation_type = 'CONSTANT'
    es = beacon.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength']
    for f in range(1, F_END + 1, 5):
        es.default_value = 6.0 if (f // 5) % 2 == 0 else 0.3
        es.keyframe_insert('default_value', frame=f)
EDIT.keyframe_new_interpolation_type = 'BEZIER'

s['Animation'] = ('drive in 1-%d, monitor routine 165-345, jet 208-342' % F_STOP)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'Water_Tanker_animated.blend'))
print('SAVED Water_Tanker_animated.blend', flush=True)

# check: wheel surface speed equals ground speed at mid-drive
f0, f1 = 60, 61
s.frame_set(f0); x0 = vehicle.location.x; a0 = wheels[0].rotation_euler.y
s.frame_set(f1); x1 = vehicle.location.x; a1 = wheels[0].rotation_euler.y
print('ROLL CHECK  ground %.4f m/frame   tread %.4f m/frame'
      % (x1 - x0, (a1 - a0) * R), flush=True)

if os.environ.get('TANKER_NO_RENDER'):
    raise SystemExit

# --------------------------------------------------------------- preview
cam_data = bpy.data.cameras.new('Animation camera')
cam_data.lens = 32
cam = bpy.data.objects.new('Animation camera', cam_data)
s.collection.objects.link(cam)
cam.location = (-12.0, -12.5, 4.6)
cam.rotation_euler = (Vector((-2.2, 0.8, 2.6)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
s.camera = cam

# EEVEE turns thin transmissive glass milky; give the preview tinted
# reflective glass instead (the Cycles master keeps the real material)
for name in ('Windscreen glass', 'Side window glass'):
    m = bpy.data.materials.get(name)
    if m:
        bs = m.node_tree.nodes.get('Principled BSDF')
        bs.inputs['Base Color'].default_value = (.035, .045, .055, 1)
        bs.inputs['Roughness'].default_value = .04
        bs.inputs['Metallic'].default_value = .2
        if 'Transmission Weight' in bs.inputs:
            bs.inputs['Transmission Weight'].default_value = 0.0

for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try:
        s.render.engine = eng
        break
    except TypeError:
        continue
s.render.resolution_x, s.render.resolution_y = 1280, 720
s.render.resolution_percentage = 100
s.view_settings.exposure = 0.0
s.render.image_settings.file_format = 'PNG'
TEST = os.environ.get('TANKER_TEST_FRAMES')       # e.g. "1,100,220" -> stills only
if TEST:
    for f in (int(v) for v in TEST.split(',')):
        s.frame_set(f)
        s.render.filepath = os.path.join(OUT, 'anim_test_%03d.png' % f)
        bpy.ops.render.render(write_still=True)
        print('TEST FRAME', f, flush=True)
    raise SystemExit

frames = os.path.join(FRAME_DIR, 'frames')
os.makedirs(frames, exist_ok=True)
s.render.filepath = os.path.join(frames, 'f_')
bpy.ops.render.render(animation=True)
print('RENDERED frames to', frames, flush=True)

ffmpeg = shutil.which('ffmpeg')
mp4 = os.path.join(FRAME_DIR, 'tanker_animation.mp4')
if ffmpeg:
    subprocess.run([ffmpeg, '-y', '-framerate', str(FPS), '-i', os.path.join(frames, 'f_%04d.png'),
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', mp4], check=True)
    print('ENCODED', mp4, flush=True)
print('ANIMATE OK', flush=True)
