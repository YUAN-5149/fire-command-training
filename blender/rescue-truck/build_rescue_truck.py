# -*- coding: utf-8 -*-
"""Taipei City Fire Department rescue equipment truck (臺北市 救助器材車, call
number 71), built in the idiom of the water tanker (../2026-10-24(水庫車)) and
the aerial ladder (../2026-09-13(雲梯車)).

Reference: the department's own vehicle page (消防車輛大觀 - 救助器材車),
https://www.119.gov.taipei/News_Content.aspx?n=33BD63446AD2E349&sms=B19BD8864CAC3FA9&s=82ABE6D90516FF23
which lists a generator set, high-power lighting, a crane boom (吊臂), an air
compressor and breaching tools, at about 7.5 x 2.5 x 3.3 m.  Its two photos
(Mercedes Atego chassis, Magirus body, 9E-621) show the layout built here:

  * single-row two-door cab;
  * two red rotating beacons on the cab roof corners, siren speaker between;
  * a telescopic lighting mast standing behind the cab, driver's side,
    outside the body, coiled cable round it, two black floods on top;
  * a locker body with aluminium roller shutters down both flanks;
  * a knuckle-boom crane (HIAB 071 class) on a deck behind the body that
    folds ACROSS the truck: column on the kerb side, inner boom running
    across to the knuckle on the driver's side, outer boom folded back up
    over it to finish high above the column; a stabiliser leg each side.

The cab is the tanker's, unchanged; front winch, roof ladder and the open
locker with the hydraulic rescue set are kept from the first cut.

Run:  blender -b --factory-startup -P build_rescue_truck.py
      RESCUE_SAMPLES=40 RESCUE_ONLY=rescue_front.png  -> quick preview
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

OUT = os.path.dirname(os.path.abspath(__file__))
TAU = math.tau

# --------------------------------------------------------------- scene reset
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves,
              bpy.data.lights, bpy.data.cameras):
    for item in list(block):
        if item.users == 0:
            block.remove(item)

# ---------------------------------------------------------------- materials
def mat(name, color, metal=0.0, rough=.35, coat=0.0, emit=None, trans=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if 'Coat Weight' in p.inputs:
        p.inputs['Coat Weight'].default_value = coat
    if 'Transmission Weight' in p.inputs:
        p.inputs['Transmission Weight'].default_value = trans
    if emit and 'Emission Color' in p.inputs:
        p.inputs['Emission Color'].default_value = (*emit[0], 1)
        p.inputs['Emission Strength'].default_value = emit[1]
    m.diffuse_color = (*color, 1)
    return m


RED     = mat('Fire engine red',        (.50, .014, .012), .0, .16, .90)
RED_DK  = mat('Shutter red',            (.43, .012, .010), .0, .25, .35)
RUBBER  = mat('Tyre rubber',            (.013, .014, .015), .0, .78)
PLASTIC = mat('Black bumper plastic',   (.026, .028, .030), .0, .48)
TRIM    = mat('Graphite trim',          (.042, .046, .050), .25, .38)
CHROME  = mat('Chrome',                 (.80, .82, .84), 1.0, .07)
ALU     = mat('Brushed aluminium',      (.40, .43, .45), .88, .38)
TREAD   = mat('Tread plate',            (.38, .41, .43), .85, .40)
# the Metz ladder set is a pale anodised grey, not bare polished metal
LADDER  = mat('Ladder alloy',           (.350, .365, .376), .70, .34)
LAD_DK  = mat('Ladder alloy, inner',    (.235, .248, .258), .70, .40)
HYD     = mat('Hydraulic rod',          (.72, .74, .77), .97, .09)
GLASS   = mat('Windscreen glass',       (.86, .90, .90), .0, .008, .0, trans=1.0)
GLASS_T = mat('Side window glass',      (.60, .66, .68), .0, .014, .0, trans=.97)
CLOTH   = mat('Seat trim',              (.090, .095, .105), .0, .72)
PANEL   = mat('Cab lining',             (.140, .148, .160), .0, .62)
DASH    = mat('Dashboard moulding',     (.080, .084, .092), .0, .55)
YELLOW  = mat('Reflective yellow',      (.78, .84, .020), .05, .30,
              emit=((.62, .70, .02), .18))
WHITE   = mat('Lettering white',        (.90, .92, .91), .05, .30)
LAMP    = mat('Headlamp lens',          (.93, .95, .97), .0, .030, 1.0, trans=.94)
FOG     = mat('Auxiliary lamp lens',    (.93, .95, .97), .0, .045, 1.0, trans=.90)
GLOW    = mat('Lamp element',           (1.0, .93, .78), .0, .30,
              emit=((1.0, .90, .70), 5.5))
BEACON  = mat('Blue beacon lens',       (.035, .075, .60), .10, .13,
              emit=((.08, .20, .95), .55))
TAILRED = mat('Tail lamp lens',         (.66, .008, .010), .05, .12,
              emit=((.85, .03, .03), .45))
AMBER   = mat('Amber lens',             (.72, .26, .010), .10, .15)
# the factory bodywork carries bright yellow climbing rails and continuous
# LED strips along the lockers - both are called out on the product page
SAFETY  = mat('Safety yellow rail',     (.70, .54, .018), .12, .26, .35)
LEDBAR  = mat('Bodywork LED strip',     (.90, .93, .95), .0, .22,
              emit=((1.0, .96, .86), 2.4))

# ---------------------------------------------------------------- geometry
CUBE_F = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
          (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
CUBE_S = ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
          (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1))


def _finish(o, material, bevel, seg, smooth):
    o.data.materials.append(material)
    if bevel:
        b = o.modifiers.new('Edge break', 'BEVEL')
        b.width, b.segments, b.limit_method = bevel, seg, 'ANGLE'
        b.angle_limit = math.radians(35)
    if smooth:
        bpy.context.view_layer.objects.active = o
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(32))
        except Exception:
            pass
    return o


def _mesh(name, verts, faces, material, bevel=.02, seg=2, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return _finish(o, material, bevel, seg, smooth)


def box(name, loc, size, material, bevel=.02, seg=2, smooth=True):
    h = (size[0] / 2, size[1] / 2, size[2] / 2)
    verts = [(loc[0] + sx * h[0], loc[1] + sy * h[1], loc[2] + sz * h[2])
             for sx, sy, sz in CUBE_S]
    return _mesh(name, verts, CUBE_F, material, bevel, seg, smooth)


def hexa(name, bot, top, material, bevel=.02, seg=2, smooth=True):
    """Prism between two matching four-point rings."""
    return _mesh(name, list(bot) + list(top), CUBE_F, material, bevel, seg, smooth)


def taper(name, x0, x1, z0, z1, hw_b, hw_t, material,
          x0t=None, x1t=None, bevel=.02, seg=2, smooth=True):
    x0t = x0 if x0t is None else x0t
    x1t = x1 if x1t is None else x1t
    bot = [(x0, -hw_b, z0), (x1, -hw_b, z0), (x1, hw_b, z0), (x0, hw_b, z0)]
    top = [(x0t, -hw_t, z1), (x1t, -hw_t, z1), (x1t, hw_t, z1), (x0t, hw_t, z1)]
    return hexa(name, bot, top, material, bevel, seg, smooth)


def plate(name, xb, xt, z0, z1, hw0, hw1, thick, material, bevel=.016, seg=2):
    """Flat raked panel - windscreen glass and its rubber surround."""
    return hexa(name,
                [(xb, -hw0, z0), (xb + thick, -hw0, z0),
                 (xb + thick, hw0, z0), (xb, hw0, z0)],
                [(xt, -hw1, z1), (xt + thick, -hw1, z1),
                 (xt + thick, hw1, z1), (xt, hw1, z1)],
                material, bevel, seg)


def quad(name, pts, material):
    """Flat polygon from a clipped outline.

    clip_rect returns whatever the Sutherland-Hodgman clip leaves behind -
    three points where a stripe is cut by a corner, five where it crosses two
    edges - so this fans the outline instead of assuming four points.  Hard
    coding a (0,1,2,3) face built a broken face on the triangles and silently
    dropped the fifth vertex on the pentagons.
    """
    pts = list(pts)
    faces = [(0, i, i + 1) for i in range(1, len(pts) - 1)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(pts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    return o


def cyl(name, loc, radius, depth, material, axis='Y', verts=40, bevel=.008):
    rot = {'X': (0, math.pi / 2, 0), 'Y': (math.pi / 2, 0, 0), 'Z': (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return _finish(o, material, bevel, 2, True)


def rod(name, a, b, r, material, verts=16):
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length,
                                        location=(a + b) / 2)
    o = bpy.context.object
    o.name = name
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return _finish(o, material, .006, 2, True)


def bake(o):
    """Apply every modifier so later booleans see the rounded shell."""
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception:
            o.modifiers.remove(m)
    return o


def carve(target, cutter):
    bpy.context.view_layer.objects.active = target
    b = target.modifiers.new('Cut', 'BOOLEAN')
    b.object, b.operation, b.solver = cutter, 'DIFFERENCE', 'EXACT'
    try:
        bpy.ops.object.modifier_apply(modifier=b.name)
    except Exception:
        target.modifiers.remove(b)


FONT = None
for path in ('C:/Windows/Fonts/msjhbd.ttc', 'C:/Windows/Fonts/msjh.ttc'):
    try:
        FONT = bpy.data.fonts.load(path)
        break
    except Exception:
        continue


def text(name, body, loc, size, material, rot, extrude=.0015):
    c = bpy.data.curves.new(name, 'FONT')
    c.body, c.size, c.align_x, c.align_y = body, size, 'CENTER', 'CENTER'
    c.extrude = extrude
    if FONT:
        c.font = FONT
    o = bpy.data.objects.new(name, c)
    bpy.context.collection.objects.link(o)
    o.location, o.rotation_euler = loc, rot
    c.materials.append(material)
    return o


def clip_rect(poly, u0, v0, u1, v1):
    """Sutherland-Hodgman clip of a 2D polygon to an axis-aligned rectangle."""
    def cut(pts, key, val, keep_ge):
        out = []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            ai = a[key] >= val if keep_ge else a[key] <= val
            bi = b[key] >= val if keep_ge else b[key] <= val
            if ai:
                out.append(a)
            if ai != bi:
                t = (val - a[key]) / (b[key] - a[key])
                out.append((a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])))
        return out
    p = poly
    for key, val, ge in ((0, u0, True), (0, u1, False), (1, v0, True), (1, v1, False)):
        p = cut(p, key, val, ge)
        if len(p) < 3:
            return []
    return p


class Weld:
    """Accumulates many small prisms into one mesh.

    A four-section lattice ladder is well over a thousand separate bars.  As
    individual objects that is unusable: the depsgraph alone would dominate
    the render and the animation would have to re-parent every one of them.
    Welded into four meshes it costs four objects and four parent links.
    """

    def __init__(self):
        self.v, self.f = [], []

    def _add(self, verts):
        b = len(self.v)
        self.v += verts
        self.f += [tuple(b + i for i in f) for f in CUBE_F]

    def box(self, c, s):
        h = (s[0] / 2, s[1] / 2, s[2] / 2)
        self._add([(c[0] + sx * h[0], c[1] + sy * h[1], c[2] + sz * h[2])
                   for sx, sy, sz in CUBE_S])

    def bar(self, a, b, w, t):
        """Flat strap between two points sharing a Y.

        w is the thickness across Y, t the depth across the in-plane normal,
        which is what makes a lattice diagonal read as a strap rather than a
        wire when the camera is square on to the ladder.
        """
        A, B = Vector(a), Vector(b)
        d = B - A
        if d.length < 1e-7:
            return
        d.normalize()
        p = Vector((-d.z, 0.0, d.x)) * (t / 2)
        y = Vector((0.0, w / 2, 0.0))
        self._add([tuple(A - p - y), tuple(A + p - y), tuple(A + p + y), tuple(A - p + y),
                   tuple(B - p - y), tuple(B + p - y), tuple(B + p + y), tuple(B - p + y)])

    def build(self, name, material, bevel=.005, seg=1):
        return _mesh(name, self.v, self.f, material, bevel, seg, False)


# ------------------------------------------------------- tanker-only finishes
# Taiwanese fire apparatus run red warning lamps, not the blue the ladder
# study borrowed from its European reference.
BEACON  = mat('Red beacon lens',        (.30, .004, .004), .10, .10,
              emit=((1.0, .02, .015), .35))
GAUGE   = mat('Gauge face',             (.92, .93, .92), .0, .20)
BRASS   = mat('Coupling alloy',         (.66, .52, .22), 1.0, .26)
HOSE    = mat('Hard suction hose',      (.030, .032, .036), .0, .62)
LVL_G   = mat('Level lamp green',       (.04, .50, .10), .0, .20, emit=((.10, .95, .25), 2.0))
LVL_Y   = mat('Level lamp amber',       (.75, .42, .02), .0, .20, emit=((1.0, .58, .05), 2.0))
LVL_R   = mat('Level lamp red',         (.70, .03, .02), .0, .20, emit=((1.0, .06, .04), 2.0))
LVL_OFF = mat('Level lamp unlit',       (.10, .115, .11), .0, .25)

# ------------------------------------------------------- rescue-only finishes
TOOL_Y  = mat('Rescue tool yellow',     (.80, .52, .020), .05, .30, .50)
TOOL_DK = mat('Rescue tool black',      (.030, .030, .035), .20, .45)
ORANGE  = mat('Safety orange',          (.85, .20, .015), .0, .35, .30)
ROPE    = mat('Rope bag red',           (.40, .020, .020), .0, .70)
BAGBLK  = mat('Lifting bag rubber',     (.020, .020, .022), .0, .65)
# the Taipei truck's shutters are bare aluminium, not body colour
SHUTTER = mat('Shutter aluminium',      (.56, .58, .59), .75, .30)
CRANE   = mat('Crane red',              (.46, .012, .010), .0, .22, .60)

# --------------------------------------------------------------- dimensions
FRONT = -4.62
TIRE_R, AXLE_Z = 0.545, 0.545
AX_F, AX_R = -3.20, 0.95           # 4.15 m wheelbase (Atego-class)
ARCH_R = 0.720
CAB_F, CAB_R = -4.49, -2.40        # the tanker's 2.09 m single-row cab
CAB_Z0, CAB_Z1 = 0.98, 3.05
HW_CAB_B = 1.230
CAB_N = 14.0
CAB_FY, CAB_FZT, CAB_FZB = 0.120, 0.100, 0.050
CAB_RAKE, CAB_TUMBLE = 0.050, 0.020
CAB_RINGS = 48
BODY_F, BODY_R = -2.20, 2.15       # 0.20 m gap behind the cab carries the mast
HW_BODY = 1.250
BODY_Z0, BODY_Z1 = 0.96, 2.95
DOORS = ((-4.30, -3.22),)
GW, GH = 0.820, 0.740
WIN_Z = 2.380
WS_Z0, WS_Z1 = 1.98, 2.82
WS_HW_B, WS_HW_T = 1.030, 1.020
GRILLE_Z0, GRILLE_Z1 = 1.10, 1.64
CALLSIGN = '信義71'                # unit name + 71, the rescue truck's call number
PLATE = 'KEB-7121'                 # fictitious
BAND_Z0, BAND_Z1 = 1.00, 1.18
SH_Z0, SH_Z1 = 1.24, 2.52
# (x0, x1, z0) per locker; the third rides over the rear arch to the tail
BAYS = ((-2.12, -0.80, SH_Z0), (-0.76, 0.12, SH_Z0), (0.16, 2.08, 1.55))
OPEN_BAY = 0                       # driver's side (-Y) front locker shown open
BAY_DEPTH = 0.70
# crane deck behind the body
CR_X = 2.47                        # plane of the crane
DECK_Z = 1.05
REAR = CR_X + .45                  # back face of the rear bumper

DXC = CAB_F + 4.72
DZW = WS_Z0 - 1.70

def cab_tz(z):
    return (z - CAB_Z0) / (CAB_Z1 - CAB_Z0)


def face_x(z):
    """Station of the front face at height z (the face rakes back)."""
    return CAB_F + CAB_RAKE * cab_tz(z)


WS_XB, WS_XT = face_x(WS_Z0) - .008, face_x(WS_Z1) - .008


def cab_hw(z):
    return HW_CAB_B * (1.0 - CAB_TUMBLE * cab_tz(z))


def body_hw(z):
    t = (z - BODY_Z0) / (BODY_Z1 - BODY_Z0)
    return HW_BODY - 0.018 * t


# ------------------------------------------------------------------ chassis
for y in (-0.44, 0.44):
    box('Chassis rail', ((-4.40 + CR_X + .30) / 2, y, 0.840), (CR_X + .30 + 4.40, 0.12, 0.250), TRIM, .012)
for x in (-4.00, -2.40, -0.60, 0.40, 1.55, 2.30, 2.70):
    box('Cross member', (x, 0, 0.850), (0.11, 0.88, 0.16), TRIM, .010)
cyl('Fuel tank', (-0.95, -0.74, 0.700), 0.25, 1.05, ALU, axis='X')
for dx in (-.40, .40):
    box('Fuel tank strap', (-0.95 + dx, -0.74, 0.700), (.040, .53, .53), TRIM, .006)
box('Battery box', (-1.75, 0.74, 0.720), (0.66, 0.42, 0.40), TRIM, .020)
cyl('Air reservoir', (-0.15, -0.70, 0.700), 0.16, 0.50, ALU, axis='X')
cyl('Air reservoir', (-1.20, 0.70, 0.700), 0.16, 0.40, ALU, axis='X')
cyl('Silencer', (-2.10, -0.66, 0.640), 0.19, 0.70, TRIM, axis='X')
rod('Exhaust pipe', (-1.75, -0.66, 0.640), (-1.20, -0.98, 0.420), .055, TRIM)
rod('Prop shaft', (-2.30, 0, 0.66), (AX_R - .32, 0, AXLE_Z), .055, TRIM)
box('Front axle beam', (AX_F, 0, 0.520), (0.21, 2.02, 0.17), TRIM, .020)
cyl('Rear differential', (AX_R, 0, AXLE_Z), 0.30, 0.44, TRIM, axis='Y')
box('Rear axle beam', (AX_R, 0, AXLE_Z), (0.19, 2.06, 0.18), TRIM, .020)
for y in (-0.82, 0.82):
    box('Rear spring', (AX_R, y, 0.700), (1.40, 0.10, 0.12), TRIM, .010)
    box('Front spring', (AX_F, y, 0.640), (1.20, 0.09, 0.09), TRIM, .010)
# PTO generator set (發電機組) slung under the body, kerbside
box('Generator box', (-0.55, 0.80, 0.640), (0.80, 0.36, 0.42), ALU, .020)
for x in (-0.82, -0.55, -0.28):
    box('Generator louvre', (x, 0.985, 0.660), (0.20, .012, 0.24), TRIM, .004)

# ---------------------------------------------------------------- cab shell
def cab_ring(x):
    """Rounded-rectangle section of the cab at station x (see the ladder
    build): near the nose the section is inset along a circular fillet so the
    face rolls into the flanks and the roof."""
    u = (x - CAB_F) / CAB_FY
    k = 0.0 if u >= 1.0 else 1.0 - math.sqrt(max(0.0, 1.0 - (1.0 - max(u, 0.0)) ** 2))
    a = HW_CAB_B - CAB_FY * k
    z0 = CAB_Z0 + CAB_FZB * k
    z1 = CAB_Z1 - CAB_FZT * k
    zc, b = (z0 + z1) / 2.0, (z1 - z0) / 2.0
    w = max(0.0, min(1.0, (CAB_R - x) / (CAB_R - CAB_F)))
    e = 2.0 / CAB_N
    ring = []
    for i in range(CAB_RINGS):
        t = TAU * i / CAB_RINGS
        cs, sn = math.cos(t), math.sin(t)
        y = a * math.copysign(abs(cs) ** e, cs)
        z = zc + b * math.copysign(abs(sn) ** e, sn)
        tz = cab_tz(z)
        ring.append((x + CAB_RAKE * w * tz, y * (1.0 - CAB_TUMBLE * tz), z))
    return ring


_st = [CAB_F + CAB_FY * (1.0 - math.cos(math.pi / 2 * i / 6.0)) for i in range(7)]
_st += [CAB_F + CAB_FY + (CAB_R - CAB_F - CAB_FY) * j / 5.0 for j in range(1, 6)]
_rings = [cab_ring(x) for x in _st]
_v, _f = [], []
for _r in _rings:
    _v.extend(_r)
for _k in range(len(_rings) - 1):
    _o0, _o1 = _k * CAB_RINGS, (_k + 1) * CAB_RINGS
    for _i in range(CAB_RINGS):
        _j = (_i + 1) % CAB_RINGS
        _f.append((_o0 + _i, _o0 + _j, _o1 + _j, _o1 + _i))
for _base, _flip in ((0, True), ((len(_rings) - 1) * CAB_RINGS, False)):
    _c = len(_v)
    _v.append(tuple(sum(_v[_base + _i][_d] for _i in range(CAB_RINGS)) / CAB_RINGS
                    for _d in range(3)))
    for _i in range(CAB_RINGS):
        _j = (_i + 1) % CAB_RINGS
        _f.append((_c, _base + _j, _base + _i) if _flip else (_c, _base + _i, _base + _j))
cab = _mesh('Crew cab', _v, _f, RED, bevel=0, seg=1, smooth=True)
body = taper('Locker body', BODY_F, BODY_R, BODY_Z0, BODY_Z1,
             HW_BODY, HW_BODY - 0.018, RED, bevel=.050, seg=4)

cutters = [(cab, cyl('Arch cutter', (AX_F, 0, AXLE_Z), ARCH_R, 3.2, RUBBER, bevel=0)),
           (body, cyl('Arch cutter', (AX_R, 0, AXLE_Z), ARCH_R, 3.2, RUBBER, bevel=0))]
for target, cutter in cutters:
    carve(target, cutter)
    bpy.data.objects.remove(cutter, do_unlink=True)

bake(body)
# the open locker is a real pocket in the body, so the tools sit inside it
OB_X0, OB_X1 = BAYS[OPEN_BAY][0] + .02, BAYS[OPEN_BAY][1] - .02
OB_IN = -(HW_BODY - BAY_DEPTH)          # back wall of the pocket
cutter = box('Open locker cutter', ((OB_X0 + OB_X1) / 2, -HW_BODY + (BAY_DEPTH - .10) / 2, (SH_Z0 + SH_Z1) / 2),
             (OB_X1 - OB_X0, BAY_DEPTH + .10, SH_Z1 - SH_Z0), RUBBER, 0)
carve(body, cutter)
bpy.data.objects.remove(cutter, do_unlink=True)
b = body.modifiers.new('Bay break', 'BEVEL')
b.width, b.segments, b.limit_method, b.angle_limit = .008, 2, 'ANGLE', math.radians(40)

bake(cab)
for cutter in [taper('Cab cavity', CAB_F + .175, CAB_R - .120, 1.230, CAB_Z1 - .140,
                     1.055, 1.010, RUBBER, x0t=CAB_F + .225, bevel=0),
               taper('Windscreen aperture', CAB_F - .10, CAB_F + .30, WS_Z0 + .022, WS_Z1 - .022,
                     WS_HW_B - .012, WS_HW_T - .012, RUBBER, bevel=0)] + [
              box('Door aperture', ((x0 + x1) / 2, side * 1.16, WIN_Z),
                  (GW - .040, .40, GH - .040), RUBBER, 0)
              for side in (-1, 1) for x0, x1 in DOORS]:
    carve(cab, cutter)
    bpy.data.objects.remove(cutter, do_unlink=True)
b = cab.modifiers.new('Aperture break', 'BEVEL')
b.width, b.segments, b.limit_method, b.angle_limit = .006, 2, 'ANGLE', math.radians(40)
bpy.context.view_layer.objects.active = cab
try:
    bpy.ops.object.shade_auto_smooth(angle=math.radians(32))
except Exception:
    pass


def arch_path(axles, z_floor, n_arc=36, n_top=10):
    """Edge of an arch opening, rear to front, as (point, outward normal).

    A single axle is the ladder's semicircle; a bogie runs up the rear wheel,
    straight along the top and down the front wheel.
    """
    lo = math.asin(max(-1.0, min(1.0, (z_floor - AXLE_Z) / ARCH_R)))
    lo = max(lo, 0.0) + math.radians(1.5)
    ax0, ax1 = max(axles), min(axles)
    out = []
    if ax0 == ax1:
        for i in range(n_arc + 1):
            a = lo + (math.pi - 2 * lo) * i / n_arc
            out.append((ax0 + ARCH_R * math.cos(a), AXLE_Z + ARCH_R * math.sin(a),
                        math.cos(a), math.sin(a)))
        return out
    for i in range(n_arc // 2 + 1):
        a = lo + (math.pi / 2 - lo) * i / (n_arc // 2)
        out.append((ax0 + ARCH_R * math.cos(a), AXLE_Z + ARCH_R * math.sin(a),
                    math.cos(a), math.sin(a)))
    for i in range(1, n_top):
        out.append((ax0 + (ax1 - ax0) * i / n_top, AXLE_Z + ARCH_R, 0.0, 1.0))
    for i in range(n_arc // 2 + 1):
        a = math.pi / 2 + (math.pi / 2 - lo) * i / (n_arc // 2)
        out.append((ax1 + ARCH_R * math.cos(a), AXLE_Z + ARCH_R * math.sin(a),
                    math.cos(a), math.sin(a)))
    return out


def arch_flare(axles, hw_fn, z_floor, rho_u=.093, rho_v=.034, u_c=.042,
               y_root=-.020, n_sec=9):
    """Semicircular lip swept along the arch edge."""
    path = arch_path(axles, z_floor)
    for side in (-1, 1):
        verts, faces = [], []
        for px, pz, nx, nz in path:
            for j in range(n_sec + 1):
                phi = math.pi * j / n_sec
                d = u_c + rho_u * math.cos(phi)
                z = pz + nz * d
                verts.append((px + nx * d, side * (hw_fn(z) + y_root + rho_v * math.sin(phi)), z))
        for i in range(len(path) - 1):
            for j in range(n_sec):
                q = i * (n_sec + 1) + j
                faces.append((q, q + n_sec + 1, q + n_sec + 2, q + 1))
        if side < 0:
            faces = [tuple(reversed(f)) for f in faces]
        me = bpy.data.meshes.new('Wheel arch flare')
        me.from_pydata(verts, [], faces)
        me.update()
        o = bpy.data.objects.new('Wheel arch flare', me)
        bpy.context.collection.objects.link(o)
        o.data.materials.append(PLASTIC)
        sm = o.modifiers.new('Lip thickness', 'SOLIDIFY')
        sm.thickness, sm.offset = .014, 0.0
        bpy.context.view_layer.objects.active = o
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        except Exception:
            pass



arch_flare((AX_F,), cab_hw, CAB_Z0)
arch_flare((AX_R,), body_hw, BODY_Z0)

# ---------------------------------------------------------- the front face
# Same upright face as the tanker (its round-three rebuild).
GREY = mat('Bumper grey', (.155, .162, .170), .35, .38, .30)
_rot_front = (math.pi / 2, 0, -math.pi / 2)

plate('Windscreen', WS_XB, WS_XT, WS_Z0, WS_Z1, WS_HW_B, WS_HW_T, .022, GLASS, .018, 3)
for sgn in (-1, 1):
    hexa('Screen pillar trim',
         [(WS_XB - .008, sgn * (WS_HW_B - .025), WS_Z0 - .030),
          (WS_XB + .030, sgn * (WS_HW_B - .025), WS_Z0 - .030),
          (WS_XB + .030, sgn * (WS_HW_B + .060), WS_Z0 - .030),
          (WS_XB - .008, sgn * (WS_HW_B + .060), WS_Z0 - .030)],
         [(WS_XT - .008, sgn * (WS_HW_T - .025), WS_Z1 + .040),
          (WS_XT + .030, sgn * (WS_HW_T - .025), WS_Z1 + .040),
          (WS_XT + .030, sgn * (WS_HW_T + .060), WS_Z1 + .040),
          (WS_XT - .008, sgn * (WS_HW_T + .060), WS_Z1 + .040)],
         PLASTIC, .012)
box('Screen header trim', (face_x(2.860) - .010, 0, 2.860), (.030, 2 * (WS_HW_T + .060), .090),
    PLASTIC, .012)
box('Sun visor', (face_x(2.935) - .055, 0, 2.935), (.130, 2.200, .060), PLASTIC, .020, 3)
box('Wiper cowl', (face_x(1.925) - .010, 0, 1.925), (.030, 2.160, .100), PLASTIC, .014)
for side in (-1, 1):
    rod('Wiper arm', (WS_XB - .012, side * .08, WS_Z0 + .030), (WS_XB - .010, side * .95, WS_Z0 + .080),
        .016, PLASTIC)
    rod('Wiper blade', (WS_XB - .022, side * .14, WS_Z0 + .045), (WS_XB - .020, side * .98, WS_Z0 + .095),
        .011, PLASTIC)
    # red forward flashers set in the painted panel between cowl and grille
    box('Front flasher', (CAB_F - .010, side * .940, 1.760), (.030, .160, .070), BEACON, .016)

GZ = (GRILLE_Z0 + GRILLE_Z1) / 2
box('Grille surround', (CAB_F - .018, 0, GZ), (.050, 1.720, GRILLE_Z1 - GRILLE_Z0), GREY, .045, 3)
box('Grille recess', (CAB_F - .040, 0, GZ), (.020, 1.580, GRILLE_Z1 - GRILLE_Z0 - .080), PLASTIC, .006)
for i in (-1, 0, 1):
    box('Grille bar', (CAB_F - .062, 0, GZ + i * .140), (.055, 1.620 - abs(i) * .06, .085), GREY, .032, 3)
cyl('Grille badge ring', (CAB_F - .096, 0, GZ), .105, .022, CHROME, axis='X', verts=40)
cyl('Grille badge', (CAB_F - .106, 0, GZ), .082, .012, TRIM, axis='X', verts=40)

BZ0, BZ1 = 0.420, 1.060
BZC = (BZ0 + BZ1) / 2
box('Bumper', (FRONT + .110, 0, BZC), (.240, 2.440, BZ1 - BZ0), GREY, .060, 4)
for side in (-1, 1):
    box('Bumper wrap', (FRONT + .330, side * 1.170, BZC), (.300, .120, BZ1 - BZ0), GREY, .040, 3)
    box('Headlamp bezel', (FRONT - .004, side * .830, .905), (.020, .500, .210), PLASTIC, .020)
    box('Headlamp lens', (FRONT - .016, side * .830, .905), (.016, .460, .175), LAMP, .020)
    for yy in (.700, .930):
        cyl('Headlamp projector', (FRONT - .006, side * yy, .905), .062, .026, CHROME,
            axis='X', verts=24)
        cyl('Headlamp element', (FRONT + .004, side * yy, .905), .040, .018, GLOW,
            axis='X', verts=20)
    box('Indicator lens', (FRONT - .014, side * 1.125, .905), (.016, .080, .150), AMBER, .012)
    cyl('Fog lamp', (FRONT - .010, side * .860, .640), .058, .030, FOG, axis='X', verts=24)
    cyl('Fog lamp element', (FRONT - .002, side * .860, .640), .040, .020, GLOW, axis='X', verts=20)
    box('Bumper intake', (FRONT - .012, side * .420, .650), (.016, .340, .085), PLASTIC, .010)
    box('Tow eye', (FRONT - .010, side * .420, .505), (.030, .100, .070), TRIM, .010)
box('Number plate', (FRONT - .018, 0, .860), (.020, .480, .160), WHITE, .008)
text('Plate lettering', PLATE, (FRONT - .032, 0, .860), .082, TRIM, _rot_front)
box('Lower lip', (FRONT + .140, 0, .410), (.240, 2.360, .070), PLASTIC, .030, 3)
# unit callsign in yellow inside the screen, kerb-side top corner, as on the
# Taipei trucks (e.g. 大同15 on KEJ-0662); tankers carry the 61 suffix
text('Windscreen callsign', CALLSIGN, (face_x(2.700) + .040, 0.640, 2.700), .090, YELLOW,
     _rot_front)

# front winch (前絞盤) let into the bumper centre: roller fairlead, cable, hook
box('Winch fairlead frame', (FRONT - .022, 0, .600), (.050, .400, .170), TRIM, .012)
for z in (.548, .652):
    cyl('Fairlead roller', (FRONT - .044, 0, z), .022, .300, CHROME, axis='Y', verts=16)
for y in (-.130, .130):
    cyl('Fairlead roller', (FRONT - .044, y, .600), .022, .110, CHROME, axis='Z', verts=16)
cyl('Winch drum', (FRONT + .260, 0, .560), .110, .460, TRIM, axis='Y', verts=32)
rod('Winch cable', (FRONT - .044, 0, .600), (FRONT - .110, 0, .520), .008, ALU, verts=8)
rod('Hook shank', (FRONT - .110, 0, .520), (FRONT - .110, 0, .465), .016, TRIM)
bpy.ops.mesh.primitive_torus_add(location=(FRONT - .110, 0, .430), major_radius=.036,
                                 minor_radius=.011, major_segments=20, minor_segments=8,
                                 rotation=(math.pi / 2, 0, 0))
_hk = bpy.context.object
_hk.name = 'Winch hook'
_hk.data.materials.append(TRIM)

# ------------------------------------------------------------- cab sides
# ------------------------------------------------------------- cab sides
for side in (-1, 1):
    yw = cab_hw(WIN_Z)
    for x0, x1 in DOORS:
        xc, w = (x0 + x1) / 2, x1 - x0
        for xe in (x0, x1):
            box('Door seam', (xe, side * (cab_hw(1.95) - .004), 1.95),
                (.016, .020, 1.80), TRIM, .004)
        for dz in (-1, 1):
            box('Window seal', (xc, side * (yw - .008), WIN_Z + dz * (GH / 2 + .026)),
                (GW + .052, .046, .052), PLASTIC, .016)
        for dx in (-1, 1):
            box('Window seal', (xc + dx * (GW / 2 + .026), side * (yw - .008), WIN_Z),
                (.052, .046, GH), PLASTIC, .016)
        box('Side window', (xc, side * (yw - .016), WIN_Z), (GW, .022, GH), GLASS_T, .012, 2)
        box('Door handle', (x1 - .160, side * (cab_hw(1.920) + .026), 1.920),
            (.215, .050, .060), TRIM, .018)
    # grey step box ahead of the wheel - the bumper wraps into it
    box('Step housing', (-4.290, side * (HW_CAB_B - .060), .740), (.360, .140, .640), GREY, .030, 3)
    for z in (.560, .870):
        box('Entry step', (-4.290, side * (HW_CAB_B - .010), z), (.300, .200, .045), TREAD, .010)
    for xr in (CAB_F + .136, DOORS[0][1] + .050):
        rod('Grab rail', (xr, side * (cab_hw(1.75) - .010), 1.30),
            (xr, side * (cab_hw(1.75) - .010), 2.20), .022, CHROME)
    box('Cab side marker', (CAB_R - .10, side * (cab_hw(1.36) + .012), 1.36),
        (.10, .030, .055), AMBER, .008)

    mx = CAB_F + .200
    rod('Mirror arm upright', (mx, side * 1.090, 2.300), (mx, side * 1.090, 2.900), .027, PLASTIC)
    rod('Mirror arm top', (mx, side * 1.090, 2.900), (mx + .028, side * 1.470, 2.900), .027, PLASTIC)
    rod('Mirror arm bottom', (mx, side * 1.090, 2.300), (mx + .028, side * 1.470, 2.300), .025, PLASTIC)
    rod('Mirror arm spine', (mx + .028, side * 1.470, 2.900), (mx + .028, side * 1.470, 2.300), .023, PLASTIC)
    box('Mirror head', (mx + .036, side * 1.485, 2.660), (.215, .110, .520), PLASTIC, .048, 3)
    box('Mirror glass', (mx + .148, side * 1.485, 2.665), (.016, .080, .440), ALU, .010)
    box('Wide-angle mirror head', (mx + .036, side * 1.485, 2.300), (.205, .105, .240), PLASTIC, .042, 3)
    box('Wide-angle glass', (mx + .146, side * 1.485, 2.300), (.016, .076, .188), ALU, .010)

# ------------------------------------------------------------- cab interior
# ------------------------------------------------------------- cab interior
_cx, _cl = (CAB_F + CAB_R) / 2 + .05, CAB_R - CAB_F - .32
box('Cab floor', (_cx, 0, 1.240), (_cl, 2.05, .030), PANEL, .006)
box('Cab headliner', (_cx, 0, CAB_Z1 - .160), (_cl, 2.05, .030), PANEL, .006)
box('Cab rear lining', (CAB_R - .135, 0, 1.960), (.030, 2.05, 1.40), PANEL, .006)
for side in (-1, 1):
    box('Cab side lining', (_cx, side * 1.040, 1.620), (_cl, .030, .700), PANEL, .006)


def seat(name, x, y, w):
    box(name + ' cushion', (x, y, 1.520), (.520, w, .120), CLOTH, .045, 3)
    box(name + ' back', (x + .300, y, 1.830), (.130, w, .580), CLOTH, .050, 3)
    box(name + ' base', (x, y, 1.400), (.420, w - .10, .150), DASH, .030)


seat('Driver seat', -3.52, -0.66, .520)
seat('Officer seat', -3.52, 0.64, .520)
seat('Crew seat', -3.52, 0.02, .400)
box('Dashboard', (CAB_F + .290, 0, 1.740), (.340, 2.02, .380), DASH, .045, 3)
box('Dash top', (CAB_F + .390, 0, 1.936), (.520, 2.02, .048), DASH, .020)
box('Instrument binnacle', (CAB_F + .350, -0.66, 2.004), (.400, .640, .118), DASH, .035)
rod('Steering column', (CAB_F + .330, -0.66, 1.820), (CAB_F + .570, -0.66, 2.050), .042, DASH)
bpy.ops.mesh.primitive_torus_add(location=(CAB_F + .570, -0.66, 2.050), major_radius=.212,
                                 minor_radius=.023, major_segments=32,
                                 minor_segments=10, rotation=(0, math.radians(43), 0))
_w = bpy.context.object
_w.name = 'Steering wheel'
_w.data.materials.append(DASH)
box('Engine tunnel', (-3.50, 0, 1.350), (1.40, .740, .190), PANEL, .045, 3)

# --------------------------------------------------- roof bar and cab roof
# same segmented red bar in a white frame as the water tanker (on request)
# --------------------------------------------------- roof bar and cab roof
# long segmented red bar in a white frame, as on the Fire Wolf cabs
LB_X = CAB_F + .300
box('Light bar base', (LB_X, 0, CAB_Z1 + .010), (.240, 1.400, .040), ALU, .012)
for _y in (-.55, .55):
    box('Light bar foot', (LB_X, _y, CAB_Z1 - .006), (.190, .150, .050), TRIM, .012)
box('Light bar frame', (LB_X, 0, CAB_Z1 + .095), (.240, 2.060, .130), WHITE, .030, 3)
for i in range(8):
    box('Light bar lens', (LB_X - .004, -0.875 + i * .250, CAB_Z1 + .097), (.236, .220, .112),
        BEACON, .022, 2)
for y in (-.62, .62):
    box('Alley light', (LB_X + .330, y, CAB_Z1 - .010), (.150, .200, .080), LAMP, .026)
box('Cab roof hatch', (-3.10, 0, CAB_Z1 + .012), (.620, .680, .042), TRIM, .014)
box('Roof air horn', (-2.70, -0.50, CAB_Z1 + .040), (.42, .10, .09), CHROME, .030)

# ------------------------------------------------------------ roller shutters
for side in (-1, 1):
    yf = side * (HW_BODY + .008)
    for k, (x0, x1, z0) in enumerate(BAYS):
        xc, w, h, zc = (x0 + x1) / 2, x1 - x0, SH_Z1 - z0, (z0 + SH_Z1) / 2
        box('Locker header', (xc, side * (HW_BODY + .014), SH_Z1 + .028), (w, .028, .048), ALU, .010)
        box('Locker LED strip', (xc, side * (HW_BODY + .034), SH_Z1 + .008),
            (w - .120, .014, .016), LEDBAR, 0)
        if side < 0 and k == OPEN_BAY:
            # open locker: a frame round the opening instead of a backing
            # plate, and the shutter rolled up into its box at the top
            for xe in (x0 + .012, x1 - .012):
                box('Locker frame', (xe, yf, zc), (.040, .034, h), ALU, .010)
            box('Locker sill', (xc, yf, z0 + .010), (w, .060, .030), ALU, .008)
            box('Shutter roll box', (xc, side * (HW_BODY - .060), SH_Z1 - .070),
                (w - .060, .130, .130), ALU, .018)
            box('Shutter bottom rail', (xc, side * (HW_BODY - .004), SH_Z1 - .150),
                (w - .085, .034, .040), ALU, .010)
            continue
        box('Locker frame', (xc, yf, zc), (w, .034, h), ALU, .016)
        box('Shutter backing', (xc, yf, zc), (w - .075, .016, h - .02), PLASTIC, .004)
        n = max(4, round((h - .11) / .115))
        pitch = (h - .11) / n
        for i in range(n):
            box('Shutter slat', (xc, side * (HW_BODY + .024), z0 + .075 + i * pitch),
                (w - .085, .028, pitch - .018), SHUTTER, .009)
        box('Shutter pull rail', (xc, side * (HW_BODY + .026), z0 + .045),
            (w - .085, .034, .062), ALU, .012)
        box('Shutter latch', (xc, side * (HW_BODY + .038), z0 + .045),
            (min(.185, w - .20), .036, .042), CHROME, .010)

    # scene lights high on the body corners, clear of the lettering
    for x in (BODY_F + .20, BODY_R - .20):
        box('Scene light housing', (x, side * (HW_BODY + .035), 2.770), (.220, .060, .150), TRIM, .016)
        box('Scene light lens', (x, side * (HW_BODY + .068), 2.770), (.180, .010, .110), LAMP, .008)

    for z in (0.560, 0.780):
        box('Under-run rail', (-1.12, side * 1.180, z), (2.40, .060, .085), ALU, .016)
    for x in (-2.00, -1.10, -0.20):
        box('Under-run bracket', (x, side * 0.900, 0.700), (.070, .560, .320), TRIM, .010)
    box('Body cap rail', ((BODY_F + BODY_R) / 2, side * (HW_BODY - .002), BODY_Z1 - .020),
        (BODY_R - BODY_F - .06, .036, .060), ALU, .012)
    for x in (BODY_F + .018, BODY_R - .018):
        box('Corner extrusion', (x, side * (HW_BODY - .004), (BODY_Z0 + BODY_Z1) / 2),
            (.050, .040, BODY_Z1 - BODY_Z0 - .02), ALU, .012)

# ------------------------------------------------- open locker: rescue set
BX = (OB_X0 + OB_X1) / 2
BW = OB_X1 - OB_X0
BYC = (OB_IN - HW_BODY) / 2                # mid-depth of the pocket
FL = SH_Z0 + .012                          # floor surface
box('Locker back wall', (BX, OB_IN - .010, (SH_Z0 + SH_Z1) / 2), (BW, .020, SH_Z1 - SH_Z0), ALU, .004)
for xe in (OB_X0 + .010, OB_X1 - .010):
    box('Locker cheek', (xe, BYC, (SH_Z0 + SH_Z1) / 2), (.020, BAY_DEPTH, SH_Z1 - SH_Z0), ALU, .004)
box('Locker floor', (BX, BYC, SH_Z0 + .006), (BW, BAY_DEPTH, .024), TREAD, .004)
box('Locker ceiling', (BX, BYC, SH_Z1 - .010), (BW, BAY_DEPTH, .020), ALU, .004)
box('Locker ceiling LED', (BX, BYC + .05, SH_Z1 - .024), (BW - .20, .020, .010), LEDBAR, 0)
SHELVES = (1.700, 2.040)               # top shelf kept below the rolled shutter
for zs in SHELVES:
    box('Locker shelf', (BX, BYC + .02, zs), (BW - .04, BAY_DEPTH - .08, .024), ALU, .004)
    box('Shelf lip', (BX, -HW_BODY + .085, zs + .030), (BW - .04, .016, .040), ALU, .004)

# hydraulic power unit in its tube frame
PU = -1.83
box('Power unit skid', (PU, BYC, FL + .015), (.44, .40, .030), TOOL_DK, .006)
for dx in (-.20, .20):
    for dy in (-.17, .17):
        rod('Power unit frame', (PU + dx, BYC + dy, FL + .03), (PU + dx, BYC + dy, FL + .38), .013, TOOL_DK)
    rod('Power unit carry bar', (PU + dx, BYC - .17, FL + .38), (PU + dx, BYC + .17, FL + .38), .015, TOOL_DK)
box('Power unit engine', (PU + .05, BYC, FL + .17), (.28, .30, .25), ORANGE, .030, 3)
box('Power unit fuel tank', (PU - .11, BYC, FL + .30), (.15, .28, .10), ORANGE, .020)
cyl('Recoil starter', (PU + .05, BYC - .165, FL + .19), .060, .030, TOOL_DK, axis='Y', verts=20)
cyl('Hydraulic pump', (PU - .11, BYC, FL + .12), .060, .26, TOOL_DK, axis='Y', verts=20)
# twin-line hose reel, turned across the locker so the hose faces out
HR = -1.33
box('Hose reel stand', (HR, BYC, FL + .020), (.26, .40, .040), TOOL_DK, .006)
for dx in (-.13, .13):
    cyl('Hose reel flange', (HR + dx, BYC, FL + .225), .190, .012, TOOL_DK, axis='X', verts=32)
cyl('Hose reel drum', (HR, BYC, FL + .225), .145, .245, ORANGE, axis='X', verts=32)
for dx in (-.06, .06):
    cyl('Hose wrap', (HR + dx, BYC, FL + .225), .152, .030, TOOL_DK, axis='X', verts=32)
# stacked lifting bags
LB = -0.99
for i in range(3):
    box('Lifting bag', (LB, BYC, FL + .018 + i * .036), (.25, .40, .032), BAGBLK, .010)
box('Lifting bag label', (LB, BYC, FL + .107), (.12, .18, .004), TOOL_Y, .001)

# spreader (擴張器) and cutter (破壞剪) on the middle shelf
ZS = SHELVES[0] + .012
SY, CY = BYC - .10, BYC + .17
cyl('Spreader body', (-1.82, SY, ZS + .075), .065, .48, TOOL_Y, axis='X', verts=24)
cyl('Spreader end cap', (-2.07, SY, ZS + .075), .050, .030, TOOL_DK, axis='X', verts=20)
for dz in (-.030, .030):
    rod('Spreader arm', (-1.58, SY, ZS + .075 + dz * 1.6), (-1.30, SY, ZS + .075 + dz * .25), .020, TOOL_DK)
rod('Spreader handle', (-1.92, SY - .06, ZS + .145), (-1.69, SY - .06, ZS + .145), .014, TOOL_DK)
rod('Spreader handle', (-1.92, SY - .06, ZS + .145), (-1.92, SY, ZS + .075), .014, TOOL_DK)
cyl('Cutter body', (-1.12, CY, ZS + .060), .052, .26, TOOL_Y, axis='X', verts=24)
for dy in (-.018, .018):
    rod('Cutter blade', (-0.99, CY + dy, ZS + .060), (-0.87, CY + dy * .3, ZS + .060), .018, TOOL_DK)
rod('Tool hose', (-2.06, SY, ZS + .075), (-2.06, SY + .25, ZS + .030), .012, ORANGE)
for x in (-1.96, -1.68, -1.18):
    box('Tool cradle', (x, BYC, ZS + .012), (.050, .44, .024), TOOL_DK, .004)

# rope bags and a chainsaw on the top shelf
ZT = SHELVES[1] + .012
for x in (-1.96, -1.72):
    cyl('Rope bag', (x, BYC - .08, ZT + .110), .100, .220, ROPE, axis='Z', verts=24)
    cyl('Rope bag drawstring', (x, BYC - .08, ZT + .225), .050, .020, TOOL_DK, axis='Z', verts=16)
box('Chainsaw body', (-1.38, BYC, ZT + .100), (.30, .16, .20), ORANGE, .030, 3)
box('Chainsaw bar', (-1.08, BYC, ZT + .070), (.36, .012, .070), ALU, .006)
box('Chainsaw chain', (-1.08, BYC, ZT + .070), (.37, .008, .080), TOOL_DK, .004)
rod('Chainsaw handle', (-1.46, BYC, ZT + .20), (-1.28, BYC, ZT + .24), .014, TOOL_DK)

bay_lamp = bpy.data.lights.new('Locker lamp', 'AREA')
bay_lamp.energy, bay_lamp.shape, bay_lamp.size = 45, 'DISK', .60
o = bpy.data.objects.new('Locker lamp', bay_lamp)
bpy.context.collection.objects.link(o)
o.location = (BX, BYC, SH_Z1 - .060)

# --------------------------------------------------------------------- roof
RZ = BODY_Z1 + .036
box('Roof deck', ((BODY_F + BODY_R) / 2, 0, BODY_Z1 + .018), (BODY_R - BODY_F - .20, 2.30, .036), TREAD, .010)
for side in (-1, 1):
    y = side * 1.140
    rod('Roof guard rail', (BODY_F + .40, y, RZ + .330), (BODY_R - .12, y, RZ + .330), .021, ALU)
    rod('Roof guard rail', (BODY_F + .40, y, RZ + .170), (BODY_R - .12, y, RZ + .170), .018, ALU)
    for i in range(5):
        x = BODY_F + .40 + (BODY_R - .12 - BODY_F - .40) * i / 4
        rod('Guard rail stanchion', (x, y, RZ), (x, y, RZ + .330), .019, ALU)
        cyl('Stanchion hinge', (x, y, RZ + .020), .030, .060, TRIM, axis='Y', verts=16)

# telescopic lighting mast (照明燈塔): as on the Taipei truck it stands in the
# gap behind the cab, kerb side, clamped to the body front, with its
# four-lamp head riding above the cab roof
MAST_X, MAST_Y = BODY_F - .100, 0.80
MAST_TOP = BODY_Z1 + .200                  # top of the fixed tube
HEAD_Z = MAST_TOP + .200
cyl('Light mast tube 1', (MAST_X, MAST_Y, MAST_TOP - .850), .075, 1.70, ALU, axis='Z', verts=28)
cyl('Light mast foot', (MAST_X, MAST_Y, MAST_TOP - 1.700), .095, .060, TRIM, axis='Z', verts=28)
for z in (1.55, 2.30, BODY_Z1 - .10):
    box('Light mast clamp', (MAST_X, MAST_Y, z), (.180, .200, .060), TRIM, .012)
    box('Light mast bracket', ((MAST_X + BODY_F) / 2 + .02, MAST_Y, z), (BODY_F - MAST_X + .04, .100, .040), TRIM, .006)
rod('Light mast air line', (MAST_X + .060, MAST_Y + .070, 1.50), (MAST_X + .060, MAST_Y + .070, MAST_TOP), .010, TOOL_DK, verts=8)
MAST2 = [cyl('Light mast tube 2', (MAST_X, MAST_Y, MAST_TOP + .080 - .800), .060, 1.60, ALU, axis='Z', verts=28)]
MAST3 = [cyl('Light mast tube 3', (MAST_X, MAST_Y, MAST_TOP + .160 - .800), .046, 1.60, ALU, axis='Z', verts=28),
         cyl('Light mast cap', (MAST_X, MAST_Y, HEAD_Z - .020), .060, .040, TRIM, axis='Z', verts=24)]
PAN = [box('Light head yoke', (MAST_X, MAST_Y, HEAD_Z + .040), (.100, .120, .080), TRIM, .012)]
TILT_P = (MAST_X, MAST_Y, HEAD_Z + .160)
TILT = [box('Light head crossbar', TILT_P, (.070, .460, .060), TRIM, .012)]
for dy in (-.165, .165):
    y = MAST_Y + dy
    TILT += [box('Flood lamp housing', (MAST_X, y, TILT_P[2]), (.190, .230, .210), PLASTIC, .026, 3),
             box('Flood lamp lens', (MAST_X - .098, y, TILT_P[2]), (.012, .190, .170), LAMP, .006),
             box('Flood lamp reflector', (MAST_X - .090, y, TILT_P[2]), (.006, .175, .155), ALU, .002)]
# coiled power cable wound round the lower mast
_cu = bpy.data.curves.new('Mast spiral cable', 'CURVE')
_cu.dimensions, _cu.bevel_depth, _cu.bevel_resolution = '3D', .013, 2
_sp = _cu.splines.new('POLY')
_n = 7 * 24
_sp.points.add(_n)
for _i in range(_n + 1):
    _a = TAU * _i / 24
    _sp.points[_i].co = (MAST_X + .105 * math.cos(_a), MAST_Y + .105 * math.sin(_a),
                         1.750 + .900 * _i / _n, 1)
_cb = bpy.data.objects.new('Mast spiral cable', _cu)
bpy.context.collection.objects.link(_cb)
_cu.materials.append(TOOL_DK)

# extension ladder (三節梯) racked on the kerb side
def ladder_weld(name, x0, x1, y, z, width, rungs):
    w = Weld()
    for dy in (-width / 2, width / 2):
        w.box(((x0 + x1) / 2, y + dy, z), (x1 - x0, .036, .080))
    pitch = (x1 - x0) / rungs
    for i in range(1, rungs):
        w.box((x0 + i * pitch, y, z), (.034, width, .030))
    return w.build(name, LADDER)


ladder_weld('Extension ladder base', -1.75, 1.90, 0.70, RZ + .140, .480, 13)
ladder_weld('Extension ladder fly', -1.58, 1.73, 0.70, RZ + .225, .400, 12)
for x in (-1.40, 1.55):
    box('Ladder rack saddle', (x, 0.70, RZ + .050), (.100, .620, .100), TRIM, .012)
    rod('Ladder strap', (x, 0.42, RZ + .275), (x, 0.98, RZ + .275), .012, SAFETY)
# long-tool box and a spine board on the driver's side
box('Roof tool box', (-0.65, -0.72, RZ + .170), (1.60, .560, .340), ALU, .025, 3)
box('Tool box lid seam', (-0.65, -0.72, RZ + .300), (1.62, .570, .010), TRIM, .002)
for x in (-1.20, -0.10):
    box('Tool box latch', (x, -1.007, RZ + .260), (.080, .020, .060), CHROME, .006)
box('Spine board', (1.05, -0.72, RZ + .080), (1.80, .420, .045), ORANGE, .018, 3)
for x in (0.45, 1.05, 1.65):
    rod('Spine board strap', (x, -0.95, RZ + .110), (x, -0.49, RZ + .110), .010, TOOL_DK)

for side in (-1, 1):
    box('Rear marker', (BODY_R + .016, side * 1.200, BODY_Z1 - .120), (.020, .060, .090), AMBER, .008)

# ------------------------------------------------------------- body tail
# 9E-621's back wall is plain red - no chevrons, no ladder: the crane fills it.

# ------------------------------------------------------ crane base & legs
DK0, DK1 = BODY_R + .02, REAR - .12
box('Crane subframe', ((DK0 + DK1) / 2, 0, .950), (DK1 - DK0, 1.00, .200), TRIM, .012)
BASE_X, BASE_Z0, BASE_Z1 = CR_X + .05, DECK_Z, 1.500
box('Crane base', (BASE_X, 0, (BASE_Z0 + BASE_Z1) / 2), (.560, 2.060, BASE_Z1 - BASE_Z0), CRANE, .040, 3)
box('Crane base plate', (BASE_X, 0, BASE_Z0 + .020), (.600, 2.100, .040), TRIM, .008)
# the plate number is painted on the base, as on 9E-621
text('Crane base number', PLATE, (BASE_X + .282, -0.050, 1.290), .170, WHITE, (math.pi / 2, 0, math.pi / 2))
box('Hydraulic tank', (CR_X - .10, 0, .650), (.420, .300, .320), TRIM, .020)

# Outriggers built the way the aerial ladder's are (../2026-09-13(雲梯車),
# "outriggers"): a square aluminium jack beam that slides out of the base
# (the base is the jack box), a square leg housing on its end, a chrome
# square leg slide inside it, and a square foot on a pivot pin so it seats on
# uneven ground, with an amber warning light on the beam end.  The beam runs
# back into the base and the slide stays inside the housing over the full
# stroke, so neither leaves a gap.
JACK_Z = 1.250                             # beam centre, inside the base
STAB, STAB_POS = {}, {}
for side in (-1, 1):
    sn = 'L' if side < 0 else 'R'
    ys = side * 1.150
    STAB_POS[sn] = ((BASE_X, ys, JACK_Z), (BASE_X, ys, .830))
    ext = [box('Jack beam', (BASE_X, side * .850, JACK_Z), (.260, .600, .220), ALU, .016),
           box('Jack leg housing', (BASE_X, ys, 1.170), (.300, .260, .620), ALU, .020),
           box('Jack housing cap', (BASE_X, ys, 1.495), (.320, .280, .030), TRIM, .008),
           box('Jack warning light', (BASE_X, side * 1.290, 1.400), (.120, .030, .070), AMBER, .008)]
    leg = [box('Jack leg slide', (BASE_X, ys, .830), (.220, .180, .940), HYD, .014),
           box('Stabiliser foot', (BASE_X, ys, .320), (.400, .380, .080), TRIM, .022),
           cyl('Stabiliser pivot pin', (BASE_X, ys, .385), .050, .240, CHROME, axis='Y', verts=18)]
    for dy in (-.095, .095):
        leg.append(box('Foot clevis', (BASE_X, ys + dy, .395), (.120, .020, .090), TRIM, .006))
    STAB[sn] = (ext, leg)

# control valve bank on the driver's side of the base: a row of five long
# levers with ball knobs, angled out and down toward the operator
VB_Y = -0.800
box('Control valve bank', (CR_X + .120, VB_Y, 1.620), (.360, .160, .200), TRIM, .016)
box('Control valve cover', (CR_X + .120, VB_Y, 1.735), (.380, .180, .030), CRANE, .008)
box('Control symbol plate', (CR_X + .120, VB_Y - .084, 1.640), (.320, .006, .080), WHITE, .002)
for i in range(5):
    x = CR_X - .020 + i * .070
    a, b = (x, VB_Y - .060, 1.680), (x, VB_Y - .300, 1.560)
    rod('Control lever', a, b, .012, CHROME, verts=10)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=.026, location=b, segments=16, ring_count=8)
    _kb = bpy.context.object
    _kb.name = 'Control lever knob'
    _finish(_kb, PLASTIC, 0, 1, True)
    box('Lever gaiter', (x, VB_Y - .070, 1.675), (.034, .030, .040), PLASTIC, .006)

# rear frame: a full-width black lamp beam hung off the chassis rails, the
# tail lamps bolted flat to its back face, and the under-run bar below it
# on the same hangers - nothing floats (the last cut's lamps sat on short
# brackets attached to nothing)
LB_Z, LB_X = .800, REAR - .110             # lamp beam centre height / back face
for side in (-1, 1):
    box('Rear frame hanger', (LB_X - .270, side * .440, .700), (.300, .100, .380), TRIM, .012)
    box('Lamp beam end plate', (LB_X - .060, side * 1.030, LB_Z), (.100, .060, .160), TRIM, .008)
box('Rear lamp beam', (LB_X - .060, 0, LB_Z), (.120, 2.120, .150), TRIM, .016)
box('Rear under-run bar', (REAR - .080, 0, .560), (.140, 2.100, .140), TRIM, .016)
for side in (-1, 1):
    box('Under-run upright', (REAR - .120, side * .900, .680), (.080, .080, .120), TRIM, .008)
    box('Tail lamp housing', (LB_X + .025, side * .880, LB_Z), (.050, .400, .130), TRIM, .016)
    for dy, m in ((-.13, TAILRED), (0.0, AMBER), (.13, TAILRED)):
        box('Tail lamp lens', (LB_X + .055, side * .880 + dy, LB_Z), (.012, .115, .095), m, .008)
box('Rear number plate', (LB_X + .012, -0.380, LB_Z), (.014, .360, .120), WHITE, .006)
text('Rear plate lettering', PLATE, (LB_X + .021, -0.380, LB_Z), .070, TRIM, (math.pi / 2, 0, math.pi / 2))
box('Plate lamp', (LB_X + .012, -0.380, LB_Z + .088), (.024, .070, .020), CHROME, .006)

# ---------------------------------------------------- knuckle-boom crane
# HIAB 071 class, read off the department's rear photo of 9E-621.  It sits
# across the tail and folds in the transverse plane, and it is big - it
# fills the back of the truck from the base to well above the roof:
#   * column on the kerb side;
#   * heavy inner boom from the column head across to the knuckle on the
#     driver's side, sloping slightly down;
#   * thick lift ram under the inner boom, chrome rod toward the knuckle;
#   * outer boom folded back up from the knuckle at about 50 degrees,
#     finishing above the roof, its ram along its underside;
#   * hoses from the base valve up the column, along the inner boom, round
#     the knuckle in a slack loop and along the outer boom to the port block;
#   * hydraulic winch (drum and motor) on the inner boom by the column.
COL_Y = 0.750
P1 = Vector((CR_X, COL_Y, 2.350))          # inner boom pivot on the column head
K = Vector((CR_X, -0.980, 2.050))          # knuckle, driver's side
OUT_X = CR_X + .300                        # the outer boom works beside the inner
K2 = Vector((OUT_X, K.y, K.z))
OUT_ANG, L2 = 52.0, 1.80
DIR1 = (K - P1).normalized()
DIR2 = Vector((0, math.cos(math.radians(OUT_ANG)), math.sin(math.radians(OUT_ANG))))
UP2 = Vector((0, -DIR2.z, DIR2.y))         # upper edge of the outer boom
TIP = K2 + DIR2 * L2


def beam(name, a, b, w, h, material, bevel=.030):
    """Box section from a to b lying in a Y-Z plane: w across X, h across the plane."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    n = Vector((0, -d.z, d.y)) * (h / 2)
    x = Vector((w / 2, 0, 0))

    def ring(p):
        return [tuple(p - x - n), tuple(p + x - n), tuple(p + x + n), tuple(p - x + n)]
    return hexa(name, ring(a), ring(b), material, bevel, 3)


def ram(name, base, length, r, material):
    """Cylinder along local +Z from its origin at `base` (Damped Track aims +Z)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=r, depth=length, location=base)
    o = bpy.context.object
    o.name = name
    for v in o.data.vertices:
        v.co.z += length / 2
    return _finish(o, material, .005, 2, True)


SLEW = [cyl('Slew housing', (CR_X, COL_Y, BASE_Z1 + .060), .230, .120, CRANE, axis='Z', verts=40),
        box('Crane column', (CR_X, COL_Y, (BASE_Z1 + .12 + P1.z + .12) / 2),
            (.320, .340, P1.z + .12 - BASE_Z1 - .12), CRANE, .035, 3),
        cyl('Column pivot boss', tuple(P1), .150, .400, CRANE, axis='X', verts=32),
        cyl('Column pivot pin', tuple(P1), .050, .460, CHROME, axis='X', verts=16)]
A = Vector((CR_X, COL_Y - .210, 1.800))    # lift ram anchor on the column
SLEW.append(box('Lift ram lug', (CR_X, COL_Y - .180, 1.800), (.220, .140, .180), CRANE, .016))

MAIN = [beam('Inner boom', P1 - DIR1 * .15, K + DIR1 * .12, .300, .340, CRANE),
        cyl('Knuckle boss', ((CR_X - .15 + OUT_X + .13) / 2, K.y, K.z), .140, OUT_X + .28 - CR_X,
            CRANE, axis='X', verts=32),
        cyl('Knuckle pin', ((CR_X - .15 + OUT_X + .13) / 2, K.y, K.z), .050, OUT_X + .34 - CR_X,
            CHROME, axis='X', verts=16)]
B = Vector((CR_X, -0.740, 1.850))          # lift ram eye under the inner boom
MAIN.append(box('Lift ram eye bracket', (CR_X, B.y, B.z + .060), (.180, .140, .130), CRANE, .012))
# (the hoist winch rides on the outer boom - see below)

# knuckle ram on top of the inner boom pushing a lever behind the knuckle
# pin - the HIAB arrangement, and one that stays connected over the whole
# unfold (a ram along the outer boom would pull apart past ~60 degrees)
UP1 = Vector((0, DIR1.z, -DIR1.y))         # upper side of the inner boom
C = K - DIR1 * .95 + UP1 * .280
C.x = OUT_X - .040
MAIN.append(box('Knuckle ram lug', (C.x - .080, C.y, C.z - .080), (.200, .140, .200), CRANE, .012))

OUTER = [beam('Outer boom', K2 - DIR2 * .15, TIP, .260, .300, CRANE)]
D = K2 - DIR2 * .100 - UP2 * .300          # knuckle ram eye on the lever behind the pin
OUTER.append(beam('Knuckle lever', K2, D, .160, .150, CRANE, .012))
# extension ram along the outer boom's underside (the slim tube in the photo)
# It is the extension ram that pushes the telescope out, so its barrel is
# pinned to a lug under the outer boom and its rod to a lug on the extension
# head: the rod strokes out with the extension instead of floating beside a
# boom it is not connected to (the last cut fixed both ends to the boom).
E0 = K2 + DIR2 * .40 - UP2 * .215          # barrel pin, on the outer boom
E1 = TIP + DIR2 * .10 - UP2 * .215         # rod pin, on the extension head
OUTER.append(beam('Extension ram base lug', K2 + DIR2 * .40 - UP2 * .120, E0 - UP2 * .030,
                  .140, .110, CRANE, .010))


# ------------------------------------------------------- hydraulic hoses
# Routed the way a knuckle crane is plumbed: from the control bank on the
# base, across the base and up the column into the valve on the column
# head; over the pivot and along the top of the inner boom; round the
# outside of the knuckle in a slack loop (so the boom can fold); along the
# top edge of the outer boom into the port block that feeds the extension
# rams just short of the tip.  Nothing runs to the hook head.
def hose_curve(name, pts, r, material):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions, cu.bevel_depth, cu.bevel_resolution = '3D', r, 2
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (p[0], p[1], p[2], 1)
    o = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(o)
    cu.materials.append(material)
    return o


def bezier(p0, p1, p2, p3, n=20):
    return [p0 * (1 - s) ** 3 + p1 * 3 * s * (1 - s) ** 2 + p2 * 3 * s * s * (1 - s) + p3 * s ** 3
            for s in (i / n for i in range(n + 1))]


def inner_top(y, lift=.200):
    """Point riding `lift` above the inner boom centreline at station y."""
    return P1.z + DIR1.z / abs(DIR1.y) * (COL_Y - y) + lift


VALVE_Z = P1.z + .210
SLEW.append(box('Column head valve', (CR_X + .050, COL_Y + .060, VALVE_Z), (.460, .200, .120), CRANE, .016))
for dy in (-.06, .06):
    SLEW.append(cyl('Valve hose fitting', (CR_X + .050, COL_Y + .060 + dy, VALVE_Z + .072), .022, .030,
                    BRASS, axis='Z', verts=12))

# base bank -> along the base top -> up the column's rear face -> valve
FEED_HOSES = []
for k in range(3):
    x = CR_X + .195 + k * .030
    pts = [Vector((x, VB_Y + .08, BASE_Z1 + .030)), Vector((x, COL_Y - .420, BASE_Z1 + .030))]
    pts += bezier(pts[-1], pts[-1] + Vector((0, .200, 0)), Vector((x, COL_Y - .090, BASE_Z1 + .200)),
                  Vector((x, COL_Y - .090, BASE_Z1 + .380)), 10)[1:]
    pts.append(Vector((x, COL_Y - .090, VALVE_Z - .060)))
    FEED_HOSES.append(hose_curve('Column feed hose', pts, .012, TOOL_DK))
    SLEW.append(FEED_HOSES[-1])
for y in (VB_Y + .25, 0.0, COL_Y - .45):
    box('Hose clip', (CR_X + .225, y, BASE_Z1 + .030), (.110, .030, .040), TRIM, .006)

BOOM_HOSES = []
for k, dx in enumerate((-.07, -.023, .023, .07)):
    x0 = CR_X + dx
    # valve -> over the pivot -> along the inner boom -> round the knuckle
    v = Vector((x0, COL_Y + .060, VALVE_Z + .065))
    a = Vector((x0, .55, inner_top(.55)))
    pts = bezier(v, v + Vector((0, 0, .110)), a + Vector((0, .12, .05)), a, 10)
    b = Vector((x0, -0.80, inner_top(-0.80)))
    pts.append(b)
    e = K2 + DIR2 * .10 + UP2 * .175 + Vector((dx, 0, 0))
    pts += bezier(b, b + Vector((0, -.32 - .03 * k, .06)), e - DIR2 * (.30 + .03 * k), e, 18)[1:]
    BOOM_HOSES.append(hose_curve('Boom hose', pts, .013, TOOL_DK))
    MAIN.append(BOOM_HOSES[-1])
    # along the outer boom's top edge into the port block
    f = TIP - DIR2 * .42 + UP2 * .175 + Vector((dx, 0, 0))
    g = TIP - DIR2 * .30 + UP2 * .175 + Vector((dx, 0, 0))
    OUTER.append(hose_curve('Outer boom hose', [e] + bezier(f - DIR2 * .001, f + DIR2 * .06, g + UP2 * .04, g, 6),
                            .013, TOOL_DK))
for s in (.55, 1.05):
    OUTER.append(beam('Hose guide', K2 + DIR2 * (s - .03) + UP2 * .175, K2 + DIR2 * (s + .03) + UP2 * .175,
                      .200, .060, TRIM, .006))
OUTER.append(beam('Extension port block', TIP - DIR2 * .36 + UP2 * .165, TIP - DIR2 * .22 + UP2 * .165,
                  .220, .080, CRANE, .010))
for s in (-.30, .45):
    MAIN.append(beam('Hose guide', Vector((CR_X, s, inner_top(s, .0))) - DIR1 * .03,
                     Vector((CR_X, s, inner_top(s, .0))) + DIR1 * .03, .200, .420, TRIM, .006))

_lbl = text('Crane load plate', 'SWL 1000 kg', K2 + DIR2 * .95 + Vector((.134, 0, 0)), .090, WHITE,
            (0, 0, 0))
_lbl.matrix_world = (Matrix.Translation(_lbl.location) @ Matrix.Rotation(math.radians(OUT_ANG), 4, 'X')
                     @ Matrix.Rotation(math.pi / 2, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'))
OUTER.append(_lbl)

# As on the Taipei rescue cranes (photo of a Fire Wolf / Ferrari unit at a
# rescue branch): black telescopic extension, a hoist winch on the side of
# the boom by the knuckle, its wire running along the boom to the tip
# sheave, and a red swivel hook with a safety latch hanging off the tip.
EXT_BLK = mat('Boom extension black', (.028, .030, .034), .30, .32, .40)
T = TIP + DIR2 * .12                       # sheave at the extension tip
EXT = [beam('Boom extension', TIP - DIR2 * 1.15, TIP + DIR2 * .06, .190, .220, EXT_BLK, .018),
       beam('Boom head', TIP + DIR2 * .02, TIP + DIR2 * .20, .210, .240, EXT_BLK, .020),
       cyl('Boom tip sheave', tuple(T), .085, .230, TRIM, axis='X', verts=28),
       cyl('Boom tip pin', tuple(T), .022, .260, CHROME, axis='X', verts=12)]
OUTER.append(beam('Outer boom end band', TIP - DIR2 * .10, TIP, .270, .310, EXT_BLK, .012))

# hoist winch on the +X face of the outer boom, by the knuckle
WD = K2 + DIR2 * .55 + Vector((.130 + .110, 0, 0))
OUTER += [cyl('Winch drum', tuple(WD), .150, .200, EXT_BLK, axis='X', verts=36),
          cyl('Winch rope wrap', tuple(WD), .158, .160, ALU, axis='X', verts=36),
          cyl('Winch flange', tuple(WD + Vector((.105, 0, 0))), .190, .018, EXT_BLK, axis='X', verts=36),
          cyl('Winch flange', tuple(WD - Vector((.105, 0, 0))), .190, .018, EXT_BLK, axis='X', verts=36),
          cyl('Winch motor', tuple(WD + Vector((.150, 0, 0))), .080, .100, CRANE, axis='X', verts=24),
          beam('Winch bracket', WD - DIR2 * .20 + Vector((-.110, 0, 0)), WD + DIR2 * .20 + Vector((-.110, 0, 0)),
               .030, .300, CRANE, .006)]
# the wire leaves the top of the drum and runs along the boom to the sheave;
# Stretch To keeps it taut as the extension runs out
W0 = WD + UP2 * .158 + Vector((-.040, 0, 0))
W1 = T + UP2 * .085
_wl = (W1 - W0).length
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=.006, depth=_wl, location=(0, 0, 0))
winch_wire = bpy.context.object
winch_wire.name = 'Hoist wire'
for v in winch_wire.data.vertices:              # lay it along +Y from the origin
    v.co = Vector((v.co.x, v.co.z + _wl / 2, -v.co.y))
winch_wire.location = W0
winch_wire.rotation_euler = (W1 - W0).to_track_quat('Y', 'Z').to_euler()
_finish(winch_wire, ALU, 0, 1, False)
OUTER.append(winch_wire)

# The hook hangs plumb whatever the boom does: a hang point at the sheave
# keeps world-upright orientation (Copy Rotation, added with the rig), the
# rope is a unit that stretches down from it, and the hook rides a 'lower'
# empty that pays out the rope.
HOOK_L0 = .140                             # wire showing when stowed
HOOK_TOP = T - Vector((0, 0, .050))
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=.006, depth=HOOK_L0, location=HOOK_TOP)
hook_rope = bpy.context.object
hook_rope.name = 'Hook rope'
for v in hook_rope.data.vertices:
    v.co.z -= HOOK_L0 / 2
_finish(hook_rope, ALU, 0, 1, False)
HZ = HOOK_TOP.z - HOOK_L0                  # top of the hook block
HOOK = [box('Hook block', (T.x, T.y, HZ - .055), (.080, .095, .110), CRANE, .020),
        cyl('Hook block pin', (T.x, T.y, HZ - .040), .016, .110, CHROME, axis='X', verts=12),
        cyl('Hook swivel', (T.x, T.y, HZ - .128), .028, .036, CHROME, axis='Z', verts=20),
        cyl('Hook swivel nut', (T.x, T.y, HZ - .158), .034, .024, CRANE, axis='Z', verts=6)]
# red J hook with its throat opening to +Y, and the sprung safety latch
_hp = [Vector((0, 0, -.170)), Vector((0, 0, -.215))]
for i in range(12):
    a = math.radians(180 + 220 * i / 11)
    _hp.append(Vector((0, .050 + .050 * math.cos(a), -.230 + .050 * math.sin(a))))
_cu = bpy.data.curves.new('Crane hook', 'CURVE')
_cu.dimensions, _cu.bevel_depth, _cu.bevel_resolution = '3D', .017, 3
_cu.use_fill_caps = True
_sp = _cu.splines.new('POLY')
_sp.points.add(len(_hp) - 1)
for i, p in enumerate(_hp):
    _sp.points[i].co = (p.x, p.y, p.z, 1)
_ck = bpy.data.objects.new('Crane hook', _cu)
bpy.context.collection.objects.link(_ck)
_ck.location = (T.x, T.y, HZ)
_cu.materials.append(CRANE)
HOOK.append(_ck)
HOOK.append(rod('Hook safety latch', Vector((T.x, T.y + .006, HZ - .200)),
                Vector((T.x, T.y + .088, HZ - .196)), .005, CHROME, verts=8))

EXT.append(beam('Extension ram head lug', TIP + DIR2 * .10 - UP2 * .100, E1 - UP2 * .030,
                .120, .110, EXT_BLK, .010))

# Every ram is pinned at both ends: a chrome pin through two round clevis
# cheeks on the structure, with the ram's eye on the pin between them.  The
# barrel and rod halves aim at each other's pin (Damped Track), so the rams
# stay on their pins and stroke as the booms move.
lift_barrel = ram('Lift ram barrel', tuple(A), .860, .095, CRANE)
lift_rod = ram('Lift ram rod', tuple(B), .820, .052, HYD)
knuckle_barrel = ram('Knuckle ram barrel', tuple(C), .700, .085, CRANE)
knuckle_rod = ram('Knuckle ram rod', tuple(D), .700, .048, HYD)
ext_barrel = ram('Extension ram barrel', tuple(E0), 1.250, .065, CRANE)
ext_rod = ram('Extension ram rod', tuple(E1), 1.250, .040, HYD)
SLEW.append(lift_barrel)
MAIN += [lift_rod, knuckle_barrel]
OUTER += [knuckle_rod, ext_barrel]
EXT.append(ext_rod)


def clevis(name, p, group, gap, eye_r, eye_mat):
    """Pin, two clevis cheeks and the ram eye between them, across X at p."""
    group.append(cyl(name + ' pin', tuple(p), .028, gap + .070, CHROME, axis='X', verts=14))
    group.append(cyl(name + ' eye', tuple(p), eye_r, gap - .012, eye_mat, axis='X', verts=24))
    for dx in (-1, 1):
        group.append(cyl(name + ' cheek', (p.x + dx * (gap / 2 + .012), p.y, p.z), eye_r + .020, .022,
                         CRANE, axis='X', verts=24))


clevis('Lift ram base', A, SLEW, .200, .070, CRANE)
clevis('Lift ram head', B, MAIN, .140, .050, HYD)
clevis('Knuckle ram base', C, MAIN, .180, .065, CRANE)
clevis('Knuckle ram head', D, OUTER, .130, .050, HYD)
clevis('Extension ram base', E0, OUTER, .140, .052, CRANE)
clevis('Extension ram head', E1, EXT, .110, .042, HYD)

# ------------------------------------------------------------- lettering
# On the plain red band above the shutters - never on the shutters (the
# ladder's round-four lesson) - in reading order on both flanks.
LET_Z = 2.760
for side in (-1, 1):
    rot = (math.pi / 2, 0, 0 if side < 0 else math.pi)
    xd, xt = (-0.80, 1.12) if side < 0 else (0.76, -1.16)
    text('City department', '臺北市政府消防局', (xd, side * (body_hw(LET_Z) + .014), LET_Z), .235, WHITE, rot)
    text('Vehicle type', '救助器材車', (xt, side * (body_hw(LET_Z) + .014), LET_Z), .235, WHITE, rot)
    for k, (line, size) in enumerate((('臺北市政府消防局', .078), ('總重 13 噸', .066),
                                      ('限乘 3 人', .066), (PLATE, .066))):
        z = 1.800 - k * .105
        text('Door lettering', line, (-3.860, side * (cab_hw(z) + .014), z), size, WHITE, rot)

# --------------------------------------------------- level reflective band
# --------------------------------------------------- level reflective band
ARCH_GROUPS = ((AX_F, AX_F), (AX_R, AX_R))


def arch_block(z):
    r, h = ARCH_R + .085, z - AXLE_Z
    if abs(h) >= r:
        return []
    half = math.sqrt(r * r - h * h)
    return [(a - half, b + half) for a, b in ARCH_GROUPS]


def arch_spans(x0, x1, z):
    spans = [(x0, x1)]
    for c0, c1 in arch_block(z):
        out = []
        for a, b in spans:
            if c1 <= a or c0 >= b:
                out.append((a, b))
                continue
            if a < c0:
                out.append((a, c0))
            if c1 < b:
                out.append((c1, b))
        spans = out
    return [(a, b) for a, b in spans if b - a > .06]


def over_arch(u0, u1):
    return any(c0 < u < c1 for c0, c1 in arch_block(BAND_Z0) for u in (u0, (u0 + u1) / 2, u1))


for side in (-1, 1):
    for x0, x1, hw in ((CAB_F + .06, CAB_R, HW_CAB_B), (BODY_F, BODY_R, HW_BODY)):
        for a, b in arch_spans(x0, x1, BAND_Z0):
            y = side * (hw + .004)
            quad('Reflective band base',
                 [(a, y, BAND_Z0), (b, y, BAND_Z0), (b, y, BAND_Z1), (a, y, BAND_Z1)], RED_DK)
    x = CAB_F + .06
    while x < BODY_R:
        poly = clip_rect([(x, BAND_Z0), (x + .130, BAND_Z0),
                          (x + .130 + .18, BAND_Z1), (x + .18, BAND_Z1)],
                         CAB_F + .06, BAND_Z0, BODY_R - .02, BAND_Z1)
        in_gap = CAB_R < x < BODY_F
        if poly and not over_arch(x, x + .31) and not in_gap:
            hw = HW_CAB_B if x < CAB_R else HW_BODY
            quad('Reflective hatch', [(u, side * (hw + .012), v) for u, v in poly], YELLOW)
        x += .245
    # a second, thin reflective line along the top of the body flank
    yb = side * (body_hw(2.63) + .006)
    quad('Upper reflective line', [(BODY_F + .06, yb, 2.615), (BODY_R - .06, yb, 2.615),
                                   (BODY_R - .06, yb, 2.650), (BODY_F + .06, yb, 2.650)], YELLOW)

# ----------------------------------------------------------------- wheels
def tread_ring(name, cx, cy, r, width, lugs=28, depth=.020):
    verts, faces = [], []
    for i in range(lugs):
        a0 = i * TAU / lugs
        a1 = a0 + TAU / lugs * .58
        base = len(verts)
        for a in (a0, a1):
            for rr in (r - .01, r + depth):
                verts.append((cx + rr * math.cos(a), cy - width / 2, AXLE_Z + rr * math.sin(a)))
                verts.append((cx + rr * math.cos(a), cy + width / 2, AXLE_Z + rr * math.sin(a)))
        b = base
        faces += [(b + 0, b + 1, b + 3, b + 2), (b + 4, b + 6, b + 7, b + 5),
                  (b + 0, b + 2, b + 6, b + 4), (b + 1, b + 5, b + 7, b + 3),
                  (b + 2, b + 3, b + 7, b + 6), (b + 0, b + 4, b + 5, b + 1)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(RUBBER)
    return o


def wheel(cx, cy, side, width=.310, face=True):
    """Build one wheel and return its parts (they spin together)."""
    parts = [cyl('Tire', (cx, cy, AXLE_Z), TIRE_R, width, RUBBER, verts=48, bevel=.030),
             tread_ring('Tire tread', cx, cy, TIRE_R, width - .045)]
    if not face:
        return parts
    yo = cy + side * (width / 2)
    parts.append(cyl('Brake drum', (cx, yo - side * .090, AXLE_Z), .250, .150, TRIM, verts=32, bevel=.006))
    rim = cyl('Rim', (cx, yo + side * .010, AXLE_Z), .290, .046, ALU, verts=44, bevel=.009)
    bake(rim)
    for j in range(6):
        a = j * TAU / 6 + .26
        cutter = cyl('Hand hole cutter',
                     (cx + .202 * math.cos(a), yo, AXLE_Z + .202 * math.sin(a)),
                     .060, .40, RUBBER, verts=20, bevel=0)
        carve(rim, cutter)
        bpy.data.objects.remove(cutter, do_unlink=True)
    hb = rim.modifiers.new('Hole break', 'BEVEL')
    hb.width, hb.segments, hb.limit_method = .005, 2, 'ANGLE'
    hb.angle_limit = math.radians(40)
    bpy.context.view_layer.objects.active = rim
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(32))
    except Exception:
        pass
    parts.append(rim)
    parts.append(cyl('Rim centre bore', (cx, yo - side * .004, AXLE_Z), .074, .050, TRIM,
                     verts=28, bevel=.005))
    for j in range(10):
        a = j * TAU / 10
        parts.append(cyl('Wheel bolt', (cx + .116 * math.sin(a), yo + side * .030,
                                        AXLE_Z + .116 * math.cos(a)), .021, .026, CHROME,
                         verts=10, bevel=.003))
    parts.append(cyl('Hub cap', (cx, yo + side * .030, AXLE_Z), .064, .028, ALU, verts=24,
                     bevel=.006))
    return parts


def mud_flap(ax, side, y_mid, width, z_body):
    x = ax + ARCH_R + .090
    z_top, z_bot = z_body - .010, 0.190
    box('Mud flap', (x, side * y_mid, (z_top + z_bot) / 2),
        (.026, width, z_top - z_bot), RUBBER, .009)
    box('Mud flap retainer', (x - .014, side * y_mid, z_top - .045),
        (.030, width * .94, .062), TRIM, .008)
    box('Mud flap bracket', (x - .085, side * y_mid, z_top - .022),
        (.170, width * .55, .036), TRIM, .008)



WHEELS = []          # (spin empty name, centre, parts)
for side in (-1, 1):
    sn = 'L' if side < 0 else 'R'
    WHEELS.append(('Wheel spin F ' + sn, (AX_F, side * 0.980, AXLE_Z),
                   wheel(AX_F, side * 0.980, side, .310)))               # front singles
    WHEELS.append(('Wheel spin R %s outer' % sn, (AX_R, side * 1.035, AXLE_Z),
                   wheel(AX_R, side * 1.035, side, .290)))               # rear twins
    WHEELS.append(('Wheel spin R %s inner' % sn, (AX_R, side * 0.705, AXLE_Z),
                   wheel(AX_R, side * 0.705, side, .290, face=False)))
    mud_flap(AX_F, side, 0.980, 0.380, CAB_Z0)
    mud_flap(AX_R, side, 0.870, 0.700, BODY_Z0)

# ------------------------------------------------------- service emblem decal
def decal_mat(name, filename, rough=.30, coat=.55):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(os.path.join(OUT, filename))
    tex.interpolation, tex.extension = 'Cubic', 'CLIP'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Metallic'].default_value = .0
    bsdf.inputs['Roughness'].default_value = rough
    m.diffuse_color = (.85, .68, .05, 1)
    if 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = coat
    for attr, value in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
        if hasattr(m, attr):
            try:
                setattr(m, attr, value)
            except Exception:
                pass
    return m


def decal(name, material, x, z, w, h, side, y):
    a, b = w / 2, h / 2
    if side > 0:
        pts = [(x + a, y, z - b), (x - a, y, z - b), (x - a, y, z + b), (x + a, y, z + b)]
    else:
        pts = [(x - a, y, z - b), (x + a, y, z - b), (x + a, y, z + b), (x - a, y, z + b)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(pts, [], [(0, 1, 2, 3)])
    me.update()
    uv = me.uv_layers.new(name='UVMap')
    for i, co in enumerate(((1, 0), (0, 0), (0, 1), (1, 1))):
        uv.data[i].uv = co
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    return o


try:
    EMBLEM = decal_mat('Fire service emblem', 'phoenix_emblem.png')
    # on the cab panel behind the door
    EM_H = 0.440
    EM_W = EM_H * 200.0 / 228.0
    EM_X, EM_Z = -2.760, 1.950
    for side in (-1, 1):
        decal('Fire service emblem', EMBLEM, EM_X, EM_Z, EM_W, EM_H,
              side, side * (cab_hw(EM_Z) + .016))
except Exception as exc:
    print('emblem decal skipped:', exc, flush=True)

# ------------------------------------------------------------- rig assembly
#   Vehicle                           <- drive (translate along -X)
#   ├─ Wheel spin F / R L/R ...       <- roll (rotate local Y, - is forward)
#   ├─ Light mast stage 2             <- extend (translate Z, 0 .. MAST_STROKE)
#   │  └─ Light mast stage 3          <- extend (translate Z, 0 .. MAST_STROKE)
#   │     └─ Light head pan           <- pan (rotate Z)
#   │        └─ Light head tilt       <- tilt (rotate Y, - aims the floods down)
#   ├─ Stabiliser extend L/R          <- beam out (translate Y, outward)
#   │  └─ Stabiliser leg L/R          <- leg down (translate -Z)
#   └─ Crane slew                     <- slew (rotate Z) about the kerbside column
#      └─ Crane inner boom            <- lift (rotate X, - raises the knuckle)
#         └─ Crane outer boom         <- knuckle (rotate X, + unfolds)
#            └─ Crane extension       <- telescope (translate local Z, along the boom)
#               └─ Crane hook hang    <- kept upright (Copy Rotation of Vehicle)
#                  ├─ Hook rope       <- scale Z = (HOOK_L0 + payout) / HOOK_L0
#                  └─ Crane hook lower <- pay out (translate -Z)
def empty(name, loc, size=0.25, kind='PLAIN_AXES'):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type, e.empty_display_size = kind, size
    e.location = loc
    bpy.context.collection.objects.link(e)
    return e


def adopt(child, parent):
    """Re-parent without moving anything in world space."""
    bpy.context.view_layer.update()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


MAST_STROKE = 1.30
st2 = empty('Light mast stage 2', (MAST_X, MAST_Y, MAST_TOP), 0.30, 'SINGLE_ARROW')
st3 = empty('Light mast stage 3', (MAST_X, MAST_Y, MAST_TOP + .080), 0.25, 'SINGLE_ARROW')
pan = empty('Light head pan', (MAST_X, MAST_Y, HEAD_Z), 0.35, 'CIRCLE')
tilt = empty('Light head tilt', TILT_P, 0.25, 'SINGLE_ARROW')
adopt(st3, st2)
adopt(pan, st3)
adopt(tilt, pan)
for group, parent in ((MAST2, st2), (MAST3, st3), (PAN, pan), (TILT, tilt)):
    for o in group:
        adopt(o, parent)

for sn, (ext, leg) in STAB.items():
    e1 = empty('Stabiliser extend ' + sn, STAB_POS[sn][0], 0.25, 'SINGLE_ARROW')
    e2 = empty('Stabiliser leg ' + sn, STAB_POS[sn][1], 0.20, 'SINGLE_ARROW')
    adopt(e2, e1)
    for o in ext:
        adopt(o, e1)
    for o in leg:
        adopt(o, e2)

slew = empty('Crane slew', (CR_X, COL_Y, DECK_Z), 0.45, 'CIRCLE')
inner = empty('Crane inner boom', tuple(P1), 0.35, 'SINGLE_ARROW')
outer = empty('Crane outer boom', tuple(K2), 0.30, 'SINGLE_ARROW')
extn = empty('Crane extension', tuple(TIP), 0.20, 'SINGLE_ARROW')
extn.rotation_euler = DIR2.to_track_quat('Z', 'X').to_euler()
anchor_a = empty('Lift ram anchor', tuple(A), 0.08)
anchor_b = empty('Lift ram eye', tuple(B), 0.08)
anchor_c = empty('Knuckle ram anchor', tuple(C), 0.08)
anchor_d = empty('Knuckle ram eye', tuple(D), 0.08)
anchor_e0 = empty('Extension ram anchor', tuple(E0), 0.08)
anchor_e1 = empty('Extension ram eye', tuple(E1), 0.08)
adopt(inner, slew)
adopt(outer, inner)
adopt(extn, outer)
for group, parent in ((SLEW + [anchor_a], slew), (MAIN + [anchor_b, anchor_c], inner),
                      (OUTER + [anchor_d, anchor_e0], outer), (EXT + [anchor_e1], extn)):
    for o in group:
        adopt(o, parent)
for o, target in ((lift_barrel, anchor_b), (lift_rod, anchor_a),
                  (knuckle_barrel, anchor_d), (knuckle_rod, anchor_c),
                  (ext_barrel, anchor_e1), (ext_rod, anchor_e0)):
    c = o.constraints.new('DAMPED_TRACK')
    c.target, c.track_axis = target, 'TRACK_Z'
hook_hang = empty('Crane hook hang', tuple(T), 0.15)
hook_lower = empty('Crane hook lower', tuple(T), 0.12, 'SINGLE_ARROW')
adopt(hook_hang, extn)
adopt(hook_lower, hook_hang)
adopt(hook_rope, hook_hang)
for o in HOOK:
    adopt(o, hook_lower)
wire_end = empty('Hoist wire end', tuple(W1), 0.06)
adopt(wire_end, extn)
c = winch_wire.constraints.new('STRETCH_TO')
c.target, c.rest_length, c.volume, c.keep_axis = wire_end, _wl, 'NO_VOLUME', 'PLANE_X'
bpy.context.view_layer.update()

for name, centre, parts in WHEELS:
    e = empty(name, centre, 0.30, 'SPHERE')
    for o in parts:
        adopt(o, e)

vehicle = empty('Vehicle', (0, 0, 0), 1.5, 'ARROWS')
for o in list(bpy.context.scene.objects):
    if o is not vehicle and o.parent is None:
        adopt(o, vehicle)

# hook hangs plumb: the hang point copies the truck's own orientation, so its
# -Z is always straight down however the booms and slew are set
c = hook_hang.constraints.new('COPY_ROTATION')
c.target = vehicle
bpy.context.view_layer.update()


def hose_hook(curve, target, idx, w):
    """Pin one hose point to another rig part with strength w (0..1)."""
    if w <= .001:
        return
    m = curve.modifiers.new('Hose hook', 'HOOK')
    m.object = target
    m.vertex_indices_set([idx])
    m.strength = w
    m.matrix_inverse = target.matrix_world.inverted() @ curve.matrix_world


def smooth(t):
    return t * t * (3 - 2 * t)


# The boom hoses belong to the inner boom; their valve end is pinned to the
# column and their knuckle loop is blended onto the outer boom, so the loop
# bends as the knuckle opens instead of tearing (points: 0-10 valve bend,
# 11 along the boom, 12-29 knuckle loop).  The feed hoses belong to the
# column; their run along the base is pinned to the truck.
for cu in BOOM_HOSES:
    for i in range(11):
        hose_hook(cu, slew, i, 1.0 - smooth(i / 10))
    for j in range(1, 19):
        hose_hook(cu, outer, 11 + j, smooth(j / 18))
for cu in FEED_HOSES:
    for i in range(2):
        hose_hook(cu, vehicle, i, 1.0)
    for i in range(2, 12):
        hose_hook(cu, vehicle, i, 1.0 - smooth((i - 1) / 10))

scene = bpy.context.scene
scene['Axles'] = (AX_F, AX_R)
scene['Tyre radius'] = TIRE_R
scene['Mast stroke per stage'] = MAST_STROKE
scene['Crane inner boom pivot'] = tuple(P1)
scene['Crane knuckle'] = tuple(K2)
scene['Crane outer boom stowed deg'] = OUT_ANG
scene['Crane outer boom length'] = L2
scene['Hook rope stowed length'] = HOOK_L0
scene['Stabiliser foot clearance'] = .280   # foot bottom above the floor when stowed

# -------------------------------------------------------------- presentation
FLOOR = mat('Studio floor', (.135, .142, .150), .0, .42)
box('Ground', (0, 0, -.06), (300, 300, .12), FLOOR, 0, smooth=False)

world = bpy.context.scene.world
if world is None:
    world = bpy.data.worlds.new('World')
    bpy.context.scene.world = world
world.use_nodes = True
try:
    nt = world.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    w_out = nt.nodes.new('ShaderNodeOutputWorld')
    w_bg = nt.nodes.new('ShaderNodeBackground')
    w_ramp = nt.nodes.new('ShaderNodeValToRGB')
    w_sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    w_tex = nt.nodes.new('ShaderNodeTexCoord')
    nt.links.new(w_tex.outputs['Generated'], w_sep.inputs['Vector'])
    nt.links.new(w_sep.outputs['Z'], w_ramp.inputs['Fac'])
    nt.links.new(w_ramp.outputs['Color'], w_bg.inputs['Color'])
    nt.links.new(w_bg.outputs['Background'], w_out.inputs['Surface'])
    w_ramp.color_ramp.elements[0].position = 0.08
    w_ramp.color_ramp.elements[0].color = (.135, .148, .168, 1)
    w_ramp.color_ramp.elements[1].position = 0.82
    w_ramp.color_ramp.elements[1].color = (.70, .77, .90, 1)
    w_bg.inputs['Strength'].default_value = 1.0
except Exception as exc:
    print('gradient world skipped:', exc, flush=True)


def aim(o, target):
    o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()


for name, loc, power, size in (('Key', (-9.0, -9.5, 10.5), 7200, 18),
                               ('Fill', (3.0, 9.5, 6.5), 3400, 12),
                               ('Rim', (10.5, -2.0, 7.5), 4400, 8),
                               ('Top', (-1.0, 0.0, 14.0), 2800, 16),
                               ('Sky card', (-17.0, -6.0, 11.0), 3800, 24),
                               ('Tail fill', (14.0, 3.0, 4.0), 900, 10)):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy, d.shape, d.size = power, 'DISK', size
    o = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(o)
    o.location = loc
    aim(o, (0, 0, 1.8))

CAMERAS = (
    ('Hero front three-quarter', (-14.5, -12.0, 4.30), (-0.70, 0, 1.80), 68, 'PERSP', 1800, 1150),
    ('Rear three-quarter',       (12.6, -10.8, 4.60),  (0.30, 0, 1.90), 68, 'PERSP', 1800, 1150),
    ('Side elevation',           (-0.80, -26.0, 1.80), (-0.80, 0, 1.80), 50, 'ORTHO', 2000, 900),
    ('Crane detail',             (7.40, -2.70, 2.60),  (2.50, 0, 2.20), 40, 'PERSP', 1400, 1100),
    ('Equipment locker',         (-0.55, -5.30, 2.30), (-1.50, -0.90, 1.85), 40, 'PERSP', 1500, 1100),
    ('Roof detail',              (-5.8, -6.4, 7.2),    (0.00, 0, 3.00), 50, 'PERSP', 1500, 1000),
    ('Head on',                  (-20.0, 0.0, 2.00),   (0, 0, 1.80),   135, 'PERSP', 1250, 1250),
)
cams = {}
for name, loc, target, lens, kind, rx, ry in CAMERAS:
    bpy.ops.object.camera_add(location=loc)
    c = bpy.context.object
    c.name = name
    c.data.lens, c.data.type = lens, kind
    if kind == 'ORTHO':
        c.data.ortho_scale = 9.0
    aim(c, target)
    cams[name] = (c, rx, ry)

s = bpy.context.scene
s.camera = cams['Hero front three-quarter'][0]
s.render.engine = 'CYCLES'
s.cycles.samples = int(os.environ.get('RESCUE_SAMPLES', '150'))
s.cycles.use_denoising = True
s.cycles.max_bounces = 14
s.cycles.transmission_bounces = 10
s.cycles.transparent_max_bounces = 10
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for backend in ('CUDA', 'OPTIX', 'HIP', 'ONEAPI', 'NONE'):
        prefs.compute_device_type = backend
        prefs.get_devices()
        if backend != 'NONE' and any(d.type == backend for d in prefs.devices):
            for d in prefs.devices:
                d.use = True
            s.cycles.device = 'GPU'
            print('CYCLES DEVICE:', backend, flush=True)
            break
except Exception as exc:
    print('GPU setup skipped:', exc, flush=True)

s.render.film_transparent = False
s.view_settings.view_transform = 'AgX'
for look in ('AgX - Medium High Contrast', 'AgX - Base Contrast', 'None'):
    try:
        s.view_settings.look = look
        break
    except TypeError:
        continue
s.render.image_settings.file_format = 'PNG'
s.unit_settings.system = 'METRIC'
s['Reference'] = ('Taipei City Fire Department rescue equipment truck (救助器材車, 71); '
                  'layout after the photos on www.119.gov.taipei')
s['Model scope'] = ('Proportional exterior study with a single-row cab and a rear knuckle-boom '
                    'crane. Locker contents and factory detail are estimated.')

bpy.ops.object.select_all(action='DESELECT')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'Rescue_Truck.blend'))

def extent():
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    dg = bpy.context.evaluated_depsgraph_get()
    for o in bpy.context.scene.objects:
        if o.type != 'MESH' or o.name.startswith('Ground'):
            continue
        ob = o.evaluated_get(dg)
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            lo = Vector((min(lo[i], w[i]) for i in range(3)))
            hi = Vector((max(hi[i], w[i]) for i in range(3)))
    return lo, hi


lo, hi = extent()
print('EXTENT  length %.3f  width %.3f  height %.3f  (metres)'
      % (hi.x - lo.x, hi.y - lo.y, hi.z), flush=True)
print('OBJECT COUNT', len(bpy.context.scene.objects), flush=True)

ONLY = os.environ.get('RESCUE_ONLY', '')
for name, filename in (('Hero front three-quarter', 'rescue_front.png'),
                       ('Rear three-quarter', 'rescue_rear.png'),
                       ('Side elevation', 'rescue_side.png'),
                       ('Crane detail', 'rescue_crane.png'),
                       ('Equipment locker', 'rescue_locker.png'),
                       ('Roof detail', 'rescue_roof.png'),
                       ('Head on', 'rescue_head_on.png')):
    if ONLY and filename not in ONLY.split(','):
        continue
    c, rx, ry = cams[name]
    s.camera = c
    s.render.resolution_x, s.render.resolution_y = rx, ry
    s.view_settings.exposure = 0.0
    s.render.filepath = os.path.join(OUT, filename)
    bpy.ops.render.render(write_still=True)
    print('RENDERED', filename, flush=True)

print('BUILD OK', flush=True)
