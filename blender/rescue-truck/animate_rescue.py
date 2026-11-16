# -*- coding: utf-8 -*-
"""Animate the rescue truck's crane operation, in the order the crew works it
(as on the aerial ladder): outriggers first, then the crane.

Keys only the rig empties build_rescue_truck.py set up:

    Stabiliser extend L/R   beams out sideways (local Y)
    Stabiliser leg L/R      legs down to the floor, then a little more while
    Vehicle                 the truck is jacked up 25 mm - feet stay planted
    Light mast stage 2/3    mast up; then the floods light and Light head
                            pan / tilt track the work point (crane, then hook)
                            while the studio dims to dusk
    Crane inner boom        rotate X, - raises the knuckle
    Crane outer boom        rotate X, + unfolds over the top and out
    Crane slew              rotate Z, + swings the boom out over the tail
    Crane extension         local Z, telescope out
    Crane hook lower        local -Z pay-out; Hook rope scale Z follows
                            (the hook hang copies the truck's rotation, so
                            the hook stays plumb throughout)

then everything back in reverse, with the red light bar flashing.

Writes Rescue_Truck_animated.blend next to this script and, unless
RESCUE_NO_RENDER is set, an EEVEE preview: PNG frames under FRAME_DIR and
rescue_crane_animation.mp4 there (video lives on D: per this machine's rules).

Run:  blender -b --factory-startup -P animate_rescue.py
      RESCUE_TEST_FRAMES=1,200,600  -> stills only, next to this script
"""
import bpy, math, os, shutil, subprocess
from mathutils import Vector

OUT = os.path.dirname(os.path.abspath(__file__))
FRAME_DIR = os.environ.get('RESCUE_FRAME_DIR', r'D:\Claude\救助器材車動畫')
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, 'Rescue_Truck.blend'))
s = bpy.context.scene
obj = bpy.data.objects

FPS, F_END = 30, 1080
s.render.fps = FPS
s.frame_start, s.frame_end = 1, F_END

vehicle = obj['Vehicle']
ext_l, ext_r = obj['Stabiliser extend L'], obj['Stabiliser extend R']
leg_l, leg_r = obj['Stabiliser leg L'], obj['Stabiliser leg R']
st2, st3, tilt = obj['Light mast stage 2'], obj['Light mast stage 3'], obj['Light head tilt']
slew, inner, outer = obj['Crane slew'], obj['Crane inner boom'], obj['Crane outer boom']
extn, lower, rope = obj['Crane extension'], obj['Crane hook lower'], obj['Hook rope']

FOOT = s['Stabiliser foot clearance']      # legs travel this far to the floor
JACK = .025                                # then lift the truck this much
BEAM_OUT = .300
MAST = s['Mast stroke per stage']
INNER_UP, OUTER_OPEN, SLEW_OUT = -35.0, 140.0, 90.0
EXT_OUT, PAYOUT = .90, 2.00
L0 = s['Hook rope stowed length']

# rest values, read before keying
base = {o.name: (o.location.copy(), o.rotation_euler.copy(), o.scale.copy())
        for o in (vehicle, ext_l, ext_r, leg_l, leg_r, st2, st3, tilt, slew, inner, outer, extn, lower, rope)}


def key(o, f, loc=None, rot=None, scale=None):
    """Key o at frame f with offsets from its rest transform (rot in degrees)."""
    l0, r0, s0 = base[o.name]
    if loc is not None:
        o.location = l0 + Vector(loc)
        o.keyframe_insert('location', frame=f)
    if rot is not None:
        o.rotation_euler = (r0.x + math.radians(rot[0]), r0.y + math.radians(rot[1]),
                            r0.z + math.radians(rot[2]))
        o.keyframe_insert('rotation_euler', frame=f)
    if scale is not None:
        o.scale = (s0.x * scale[0], s0.y * scale[1], s0.z * scale[2])
        o.keyframe_insert('scale', frame=f)


def hold_move(o, frames, values, kind):
    """Key a list of (frame, value) pairs; Bezier keys ease each move."""
    for f, v in zip(frames, values):
        key(o, f, **{kind: v})


# --------------------------------------------------------------- outriggers
# beams out, legs down to the floor, then legs on while the truck lifts JACK
for e, sgn in ((ext_l, -1), (ext_r, 1)):
    hold_move(e, (1, 40, 100, 1000, 1050),
              [(0, 0, 0), (0, 0, 0), (0, sgn * BEAM_OUT, 0), (0, sgn * BEAM_OUT, 0), (0, 0, 0)], 'loc')
for g in (leg_l, leg_r):
    hold_move(g, (1, 100, 160, 190, 930, 960, 1000),
              [(0, 0, 0), (0, 0, 0), (0, 0, -FOOT), (0, 0, -FOOT - JACK), (0, 0, -FOOT - JACK),
               (0, 0, -FOOT), (0, 0, 0)], 'loc')
hold_move(vehicle, (1, 160, 190, 930, 960),
          [(0, 0, 0), (0, 0, 0), (0, 0, JACK), (0, 0, JACK), (0, 0, 0)], 'loc')

# ------------------------------------------------------------- light mast
hold_move(st2, (1, 190, 240, 930, 980), [(0, 0, 0), (0, 0, 0), (0, 0, MAST), (0, 0, MAST), (0, 0, 0)], 'loc')
hold_move(st3, (1, 210, 260, 910, 960), [(0, 0, 0), (0, 0, 0), (0, 0, MAST), (0, 0, MAST), (0, 0, 0)], 'loc')

# ------------------------------------------------------------------ crane
hold_move(inner, (1, 260, 330, 880, 930),
          [(0, 0, 0), (0, 0, 0), (INNER_UP, 0, 0), (INNER_UP, 0, 0), (0, 0, 0)], 'rot')
hold_move(outer, (1, 330, 420, 810, 880),
          [(0, 0, 0), (0, 0, 0), (OUTER_OPEN, 0, 0), (OUTER_OPEN, 0, 0), (0, 0, 0)], 'rot')
hold_move(slew, (1, 420, 490, 750, 810),
          [(0, 0, 0), (0, 0, 0), (0, 0, SLEW_OUT), (0, 0, SLEW_OUT), (0, 0, 0)], 'rot')
# the extension empty is aimed along the boom, so telescope in its own Z
for f, v in ((1, 0), (490, 0), (540, EXT_OUT), (710, EXT_OUT), (750, 0)):
    extn.location = base[extn.name][0] + extn.matrix_basis.to_3x3() @ Vector((0, 0, v))
    extn.keyframe_insert('location', frame=f)
for f, v in ((1, 0), (540, 0), (610, PAYOUT), (650, PAYOUT), (710, 0)):
    key(lower, f, loc=(0, 0, -v))
    key(rope, f, scale=(1, 1, (L0 + v) / L0))

# ------------------------------------------- work lights follow the job
# Once the mast is up the two floods come on and are aimed, every few
# frames, at where the crew is working: first the crane as it unfolds, then
# the hook as it swings out and pays out.  The head faces -X at rest; pan
# turns it about Z, tilt about its own Y (- aims down).
pan = obj['Light head pan']
base[pan.name] = (pan.location.copy(), pan.rotation_euler.copy(), pan.scale.copy())
hook_o = obj['Crane hook']
tip_o = obj['Boom tip sheave']
LIGHT_ON, LIGHT_OFF = 275, 880
TRACK = list(range(LIGHT_ON, LIGHT_OFF + 1, 5))


def aim_angles(target, head):
    d = target - head
    yaw = math.degrees(math.atan2(d.y, d.x))       # world heading of the target
    pitch = math.degrees(math.atan2(d.z, math.hypot(d.x, d.y)))
    return yaw - 180.0, pitch                      # head rests facing -X (180 deg)


track = []
prev = None
for f in TRACK:
    s.frame_set(f)
    head = obj['Light head tilt'].matrix_world.translation.copy()
    # the work point: the hook once it is out past the body, else the boom tip
    hk = hook_o.matrix_world.translation.copy()
    target = hk if hk.x > 3.2 else tip_o.matrix_world.translation.copy()
    p, t = aim_angles(target, head)
    if prev is not None:                           # keep the pan continuous
        while p - prev > 180:
            p -= 360
        while p - prev < -180:
            p += 360
    prev = p
    track.append((f, p, t))
EDIT_PREF = bpy.context.preferences.edit
EDIT_PREF.keyframe_new_interpolation_type = 'BEZIER'
key(pan, 1, rot=(0, 0, 0))
key(tilt, 1, rot=(0, 0, 0))
key(pan, LIGHT_ON - 25, rot=(0, 0, 0))
key(tilt, LIGHT_ON - 25, rot=(0, 0, 0))
for f, p, t in track:
    key(pan, f, rot=(0, 0, p))
    key(tilt, f, rot=(0, t, 0))                    # pitch below horizontal is negative
key(pan, LIGHT_OFF + 15, rot=(0, 0, 0))
key(tilt, LIGHT_OFF + 15, rot=(0, 0, 0))
print('LIGHT AIM  frame %d pan %.1f tilt %.1f  ...  frame %d pan %.1f tilt %.1f'
      % (track[0] + track[-1]), flush=True)

# the lenses glow and a spot sits behind each, pointing out along -X
flood = bpy.data.materials.new('Flood lamp LED')
flood.use_nodes = True
fb = flood.node_tree.nodes.get('Principled BSDF')
fb.inputs['Base Color'].default_value = (.95, .96, 1.0, 1)
fb.inputs['Roughness'].default_value = .10
fb.inputs['Emission Color'].default_value = (1.0, .97, .90, 1)
s.frame_set(1)                                     # rig at rest while the spots are fitted
lenses = [o for o in obj if o.name.startswith('Flood lamp lens')]
for o in lenses:
    o.data.materials.clear()
    o.data.materials.append(flood)
es_f = fb.inputs['Emission Strength']
spots = []
for o in lenses:
    ld = bpy.data.lights.new('Work flood', 'SPOT')
    ld.spot_size, ld.spot_blend = math.radians(45), .30
    ld.color = (1.0, .96, .88)
    lo = bpy.data.objects.new('Work flood', ld)
    s.collection.objects.link(lo)
    lo.matrix_world = o.matrix_world.copy()
    lo.rotation_euler = (0, math.radians(90), 0)   # light -Z -> head -X
    lo.location = o.matrix_world.translation + Vector((-.02, 0, 0))
    bpy.context.view_layer.update()
    lo.parent = tilt
    lo.matrix_parent_inverse = tilt.matrix_world.inverted()
    spots.append(ld)
for f, on in ((1, 0), (LIGHT_ON - 5, 0), (LIGHT_ON + 5, 1), (LIGHT_OFF - 5, 1), (LIGHT_OFF + 5, 0)):
    es_f.default_value = 9.0 * on
    es_f.keyframe_insert('default_value', frame=f)
    for ld in spots:
        ld.energy = 4500.0 * on
        ld.keyframe_insert('energy', frame=f)

# dim the studio to dusk while the floods are working so their throw reads
studio = [o.data for o in obj if o.type == 'LIGHT' and o.data not in spots
          and o.name != 'Locker lamp']
w_bg = None
if s.world and s.world.node_tree:
    w_bg = next((n for n in s.world.node_tree.nodes if n.type == 'BACKGROUND'), None)
for f, dusk in ((1, 0), (LIGHT_ON - 20, 0), (LIGHT_ON + 20, 1), (LIGHT_OFF - 20, 1), (LIGHT_OFF + 20, 0)):
    k = 1.0 - .72 * dusk
    for ld in studio:
        if 'rest energy' not in ld:
            ld['rest energy'] = ld.energy
        ld.energy = ld['rest energy'] * k
        ld.keyframe_insert('energy', frame=f)
    if w_bg:
        w_bg.inputs['Strength'].default_value = k
        w_bg.inputs['Strength'].keyframe_insert('default_value', frame=f)

# ----------------------------------------------------- flashing light bar
EDIT = bpy.context.preferences.edit
beacon = bpy.data.materials.get('Red beacon lens')
if beacon:
    EDIT.keyframe_new_interpolation_type = 'CONSTANT'
    es = beacon.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength']
    for f in range(1, F_END + 1, 6):
        es.default_value = 5.0 if (f // 6) % 2 == 0 else 0.3
        es.keyframe_insert('default_value', frame=f)
    EDIT.keyframe_new_interpolation_type = 'BEZIER'

s['Animation'] = ('outriggers out 40-100, legs down 100-160, jack 160-190, mast 190-275, '
                  'inner boom 260-330, unfold 330-420, slew 420-490, telescope 490-540, '
                  'hook pay-out 540-610, hold, hook up 650-710, then all back by 1050')
s.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'Rescue_Truck_animated.blend'))
print('SAVED Rescue_Truck_animated.blend', flush=True)


# --------------------------------------------------------------- checks
def world(o):
    return o.matrix_world.translation.copy()


foot = [o for o in obj if o.name.split('.')[0] == 'Stabiliser foot']
hook, hang = obj['Crane hook'], obj['Crane hook hang']
for f in (1, 190, 380, 455, 610):
    s.frame_set(f)
    feet = ['%.3f' % min((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in foot]
    plumb = hang.matrix_world.to_3x3().col[2].normalized()   # must stay (0, 0, 1)
    print('FRAME %4d  foot bottoms z %s   hook %s   hang up-axis %s'
          % (f, feet, tuple(round(v, 2) for v in world(hook)), tuple(round(v, 3) for v in plumb)),
          flush=True)

if os.environ.get('RESCUE_NO_RENDER'):
    raise SystemExit

# --------------------------------------------------------------- preview
cam_data = bpy.data.cameras.new('Animation camera')
cam_data.lens = 30
cam = bpy.data.objects.new('Animation camera', cam_data)
s.collection.objects.link(cam)
cam.location = (10.6, -9.6, 5.0)
cam.rotation_euler = (Vector((1.4, -0.2, 2.5)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
s.camera = cam
if os.environ.get('RESCUE_CLOSE'):                 # close-up on the working crane (checks)
    cam.location = (8.6, -4.2, 4.4)
    cam.rotation_euler = (Vector((4.2, 0.0, 3.0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam_data.lens = 32

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
if hasattr(s, 'eevee') and hasattr(s.eevee, 'taa_render_samples'):
    s.eevee.taa_render_samples = 32
s.view_settings.exposure = 0.0
s.render.image_settings.file_format = 'PNG'
TEST = os.environ.get('RESCUE_TEST_FRAMES')
if TEST:
    for f in (int(v) for v in TEST.split(',')):
        s.frame_set(f)
        s.render.filepath = os.path.join(OUT, 'anim_test_%04d.png' % f)
        bpy.ops.render.render(write_still=True)
        print('TEST FRAME', f, flush=True)
    raise SystemExit

frames = os.path.join(FRAME_DIR, 'frames')
os.makedirs(frames, exist_ok=True)
s.render.filepath = os.path.join(frames, 'f_')
bpy.ops.render.render(animation=True)
print('RENDERED frames to', frames, flush=True)

ffmpeg = shutil.which('ffmpeg')
mp4 = os.path.join(FRAME_DIR, 'rescue_crane_animation.mp4')
if ffmpeg:
    subprocess.run([ffmpeg, '-y', '-framerate', str(FPS), '-i', os.path.join(frames, 'f_%04d.png'),
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', mp4], check=True)
    print('ENCODED', mp4, flush=True)
else:
    print('ffmpeg not found - frames only', flush=True)
print('ANIMATE OK', flush=True)
