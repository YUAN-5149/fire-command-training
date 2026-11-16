# -*- coding: utf-8 -*-
"""Animate the smoke exhaust truck (排煙車 76) at work.

Keys only the rig empties build_smoke_truck.py set up:

    Vehicle                 drives in from 15 m behind and stops; the wheel
                            spin empties roll exactly with the distance
    Fan boom lift           rotate Y, + raises the inclined boom from its tail pivot
    Fan tilt                rotate Y about the tip pin; turned against the
                            boom as it rises so the drum stays near level
                            and ends with the outlet 20 deg down (Yilan photo)
    Fan boom extend         local -X, the telescope runs out
    Fan slew                rotate Z, - swings the outlet to the driver's side
    Fan rotor               spins up (linear keys, steady speed), runs, spins down
    Smoke mist              water-mist cone from the nozzle frame grows out and
                            fades while the fan blows (Blender / video only)

then everything back in reverse, with the red light bar flashing throughout.
The order is the one the crew works to: raise and run out the boom first,
slew only when up, and lower only once the head is back square.

Writes Smoke_Truck_animated.blend next to this script and, unless
SMOKE_NO_RENDER is set, an EEVEE preview: PNG frames under FRAME_DIR and
smoke_fan_animation.mp4 there (video lives on D: per this machine's rules).

Run:  blender -b --factory-startup -P animate_smoke.py
      SMOKE_TEST_FRAMES=1,300,520  -> stills only, next to this script
"""
import bpy, math, os, shutil, subprocess
from mathutils import Vector

OUT = os.path.dirname(os.path.abspath(__file__))
FRAME_DIR = os.environ.get('SMOKE_FRAME_DIR', r'D:\Claude\排煙車動畫')
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, 'Smoke_Truck.blend'))
s = bpy.context.scene
obj = bpy.data.objects

FPS, F_END = 30, 930
s.render.fps = FPS
s.frame_start, s.frame_end = 1, F_END

vehicle = obj['Vehicle']
lift, extn = obj['Fan boom lift'], obj['Fan boom extend']
slew, tilt, rotor = obj['Fan slew'], obj['Fan tilt'], obj['Fan rotor']
wheels = [o for o in obj if o.name.startswith('Wheel spin')]

BOOM_UP, BOOM_EXT, TILT_LEVEL = s['Fan boom up deg'], s['Fan boom extension'], s['Fan tilt level deg']
R = s['Tyre radius']
DRIVE_FROM = 15.0
SLEW_WORK, SLEW_SWEEP = -60.0, -30.0       # degrees; - turns the outlet to the driver's side
SPIN = 30.0                                # rotor degrees per frame at speed (motion-blurred)

base = {o.name: (o.location.copy(), o.rotation_euler.copy(), o.scale.copy())
        for o in [vehicle, lift, extn, slew, tilt, rotor] + wheels}
EDIT = bpy.context.preferences.edit
EDIT.keyframe_new_interpolation_type = 'BEZIER'


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
    for f, v in zip(frames, values):
        key(o, f, **{kind: v})


# ------------------------------------------------------------ drive in
hold_move(vehicle, (1, 150), [(DRIVE_FROM, 0, 0), (0, 0, 0)], 'loc')
# wheels roll exactly the distance covered (no skid): angle = distance / R,
# negative about Y is forward
for f in range(1, 151):
    s.frame_set(f)
    gone = DRIVE_FROM - vehicle.matrix_world.translation.x
    for w in wheels:
        key(w, f, rot=(0, -math.degrees(gone / R), 0))

# ----------------------------------------------------------- the fan head
# boom up with the drum levelled on the same keys, then the telescope
hold_move(lift, (1, 170, 260, 800, 890), [(0, 0, 0), (0, 0, 0), (0, BOOM_UP, 0), (0, BOOM_UP, 0), (0, 0, 0)], 'rot')
hold_move(tilt, (1, 170, 260, 800, 890), [(0, 0, 0), (0, 0, 0), (0, TILT_LEVEL, 0), (0, TILT_LEVEL, 0), (0, 0, 0)], 'rot')
hold_move(extn, (1, 260, 300, 760, 800), [(0, 0, 0), (0, 0, 0), (-BOOM_EXT, 0, 0), (-BOOM_EXT, 0, 0), (0, 0, 0)], 'loc')
hold_move(slew, (1, 300, 360, 480, 540, 600, 700, 760),
          [(0, 0, 0), (0, 0, 0), (0, 0, SLEW_WORK), (0, 0, SLEW_WORK), (0, 0, SLEW_SWEEP),
           (0, 0, SLEW_WORK), (0, 0, SLEW_WORK), (0, 0, 0)], 'rot')

# rotor: speed ramps 0 -> SPIN over the start, holds, ramps back down; the
# angle is the integral, keyed linearly every frame so the speed is exact
SPIN_ON, SPIN_FULL, SPIN_EASE, SPIN_STOP = 380, 430, 640, 690
EDIT.keyframe_new_interpolation_type = 'LINEAR'
ang = 0.0
for f in range(1, F_END + 1):
    if SPIN_ON < f <= SPIN_FULL:
        w = SPIN * (f - SPIN_ON) / (SPIN_FULL - SPIN_ON)
    elif SPIN_FULL < f <= SPIN_EASE:
        w = SPIN
    elif SPIN_EASE < f <= SPIN_STOP:
        w = SPIN * (SPIN_STOP - f) / (SPIN_STOP - SPIN_EASE)
    else:
        w = 0.0
    ang += w
    if SPIN_ON - 1 <= f <= SPIN_STOP + 1 or f in (1, F_END):
        key(rotor, f, rot=(ang, 0, 0))
EDIT.keyframe_new_interpolation_type = 'BEZIER'

# ------------------------------------------------------------ water mist
# a cone of fine spray from the nozzle frame (排煙發泡 / 水霧): volume
# scatter whose density follows a noise field drifting downstream; it grows
# out from the nozzles when the water comes on and thins away when it stops
MIST_ON, MIST_OFF = 450, 620
s.frame_set(1)
_nz = [(o.matrix_world @ Vector(c)) for o in obj if o.name.split('.')[0] == 'Nozzle manifold'
       for c in o.bound_box]
nx = max(v.x for v in _nz) + .06
nozzle = Vector((nx, 0, sum(v.z for v in _nz) / len(_nz)))
bpy.ops.mesh.primitive_cone_add(vertices=40, radius1=1.50, radius2=.20, depth=4.20, location=(0, 0, 0))
mist = bpy.context.object
mist.name = 'Smoke mist'
for v in mist.data.vertices:                    # narrow end at the origin, wide end down -Z
    v.co.z -= 2.10
mist.rotation_euler = (0, math.radians(-90), 0)  # local -Z -> world +X (downstream)
mist.location = (nx, 0, nozzle.z)
bpy.context.view_layer.update()
mist.parent = tilt
mist.matrix_parent_inverse = tilt.matrix_world.inverted()

mm = bpy.data.materials.new('Water mist')
mm.use_nodes = True
nt = mm.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
o_out = nt.nodes.new('ShaderNodeOutputMaterial')
vol = nt.nodes.new('ShaderNodeVolumePrincipled')
vol.inputs['Color'].default_value = (.92, .95, 1.0, 1)
tc = nt.nodes.new('ShaderNodeTexCoord')
mp = nt.nodes.new('ShaderNodeMapping')
nz = nt.nodes.new('ShaderNodeTexNoise')
nz.inputs['Scale'].default_value = 2.2
nz.inputs['Detail'].default_value = 4.0
ramp = nt.nodes.new('ShaderNodeMapRange')
ramp.inputs['From Min'].default_value = .40
ramp.inputs['From Max'].default_value = .75
ramp.inputs['To Min'].default_value = 0.0
ramp.inputs['To Max'].default_value = 1.0
mul = nt.nodes.new('ShaderNodeMath')
mul.operation = 'MULTIPLY'
nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
nt.links.new(nz.outputs['Fac'], ramp.inputs['Value'])
nt.links.new(ramp.outputs['Result'], mul.inputs[0])
nt.links.new(mul.outputs['Value'], vol.inputs['Density'])
nt.links.new(vol.outputs['Volume'], o_out.inputs['Volume'])
mist.data.materials.append(mm)
dens = mul.inputs[1]
# the noise drifts downstream (object -Z) so the spray reads as moving
for f, off in ((MIST_ON - 10, 0.0), (MIST_OFF + 30, -18.0)):
    mp.inputs['Location'].default_value = (0, 0, off)
    mp.inputs['Location'].keyframe_insert('default_value', frame=f)
for f, d, grow in ((1, 0.0, .05), (MIST_ON, 0.0, .05), (MIST_ON + 25, .55, 1.0),
                   (MIST_OFF, .55, 1.0), (MIST_OFF + 25, 0.0, 1.0)):
    dens.default_value = d
    dens.keyframe_insert('default_value', frame=f)
    mist.scale = (1.0, 1.0, grow)
    mist.keyframe_insert('scale', frame=f)
mist.hide_render = False

# ----------------------------------------------------- flashing light bar
beacon = bpy.data.materials.get('Red beacon lens')
if beacon:
    EDIT.keyframe_new_interpolation_type = 'CONSTANT'
    es = beacon.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength']
    for f in range(1, F_END + 1, 6):
        es.default_value = 5.0 if (f // 6) % 2 == 0 else 0.3
        es.keyframe_insert('default_value', frame=f)
    EDIT.keyframe_new_interpolation_type = 'BEZIER'

s['Animation'] = ('drive in 1-150, boom up and drum levelled 170-260, telescope 260-300, '
                  'slew 300-360, rotor up 380-430, mist 450-620 with a sweep 480-600, '
                  'rotor down 640-690, slew back 700-760, telescope in 760-800, boom down by 890')
s.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'Smoke_Truck_animated.blend'))
print('SAVED Smoke_Truck_animated.blend', flush=True)

# --------------------------------------------------------------- checks
# Measured, not eyeballed: the head must stay clear of the body's back wall
# and of the deck boxes, and the stages must stay engaged.
dg = bpy.context.evaluated_depsgraph_get()


def bounds(names):
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for o in obj:
        if o.type != 'MESH' or o.name.split('.')[0] not in names:
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo[i], w[i]) for i in range(3)))
            hi = Vector((max(hi[i], w[i]) for i in range(3)))
    return lo, hi


HEAD = {'Fan drum', 'Duct sleeve fold', 'Duct sleeve mouth ring', 'Cradle base plate', 'Cradle side arm',
        'Outer boom', 'Inner boom', 'Boom head', 'Tilt rotary actuator', 'Rotary union', 'Work lamp housing',
        'Head arm plate'}
BACK_WALL, ROOF_TOP = 0.362, 3.25          # body back face; highest roof fitting
wall_gap, box_clash, drum_low = 1e9, 0, 1e9
for f in range(150, 900, 5):
    s.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    vx = vehicle.matrix_world.translation.x
    for o in obj:
        if o.type != 'MESH' or o.name.split('.')[0] not in HEAD:
            continue
        me = o.evaluated_get(dg).to_mesh()
        for v in me.vertices:
            w = o.matrix_world @ v.co
            x = w.x - vx
            if w.z < ROOF_TOP:
                wall_gap = min(wall_gap, x - BACK_WALL)
            if .64 < abs(w.y) < 1.20 and .40 < x < 2.66 and w.z < 1.95:
                box_clash += 1
            if o.name.startswith('Fan drum'):
                drum_low = min(drum_low, w.z)
        o.evaluated_get(dg).to_mesh_clear()
s.frame_set(1)
print('CHECK head nearest the body back wall: %.3f m clear  -> %s'
      % (wall_gap, 'OK' if wall_gap > 0 else 'CLASH'), flush=True)
print('CHECK head points inside the deck boxes: %d  -> %s' % (box_clash, 'OK' if not box_clash else 'CLASH'),
      flush=True)
print('CHECK drum lowest point %.3f m (deck 1.47)' % drum_low, flush=True)

if os.environ.get('SMOKE_NO_RENDER'):
    raise SystemExit

# --------------------------------------------------------------- preview
cam_data = bpy.data.cameras.new('Animation camera')
cam_data.lens = 30
cam = bpy.data.objects.new('Animation camera', cam_data)
s.collection.objects.link(cam)
s.camera = cam
aim_t = bpy.data.objects.new('Camera target', None)
s.collection.objects.link(aim_t)
tr = cam.constraints.new('TRACK_TO')
tr.target, tr.track_axis, tr.up_axis = aim_t, 'TRACK_NEGATIVE_Z', 'UP_Y'
# wide while the truck pulls in, then in toward the fan as it works
for f, cl, tg, lens in ((1, (10.6, -9.6, 5.0), (1.4, -0.2, 2.2), 30),
                        (160, (10.6, -9.6, 5.0), (1.4, -0.2, 2.2), 30),
                        (300, (9.4, -7.8, 4.8), (2.0, -0.6, 3.1), 30),
                        (760, (9.4, -7.8, 4.8), (2.0, -0.6, 3.1), 30),
                        (900, (10.6, -9.6, 5.0), (1.4, -0.2, 2.2), 30)):
    cam.location, aim_t.location = cl, tg
    cam.keyframe_insert('location', frame=f)
    aim_t.keyframe_insert('location', frame=f)

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
s.render.use_motion_blur = True               # the spinning rotor reads as a blur
s.view_settings.exposure = 0.0
s.render.image_settings.file_format = 'PNG'
TEST = os.environ.get('SMOKE_TEST_FRAMES')
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
mp4 = os.path.join(FRAME_DIR, 'smoke_fan_animation.mp4')
if ffmpeg:
    subprocess.run([ffmpeg, '-y', '-framerate', str(FPS), '-i', os.path.join(frames, 'f_%04d.png'),
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', mp4], check=True)
    print('ENCODED', mp4, flush=True)
else:
    print('ffmpeg not found - frames only', flush=True)
print('ANIMATE OK', flush=True)
