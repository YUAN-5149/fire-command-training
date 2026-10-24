# -*- coding: utf-8 -*-
"""Taipei City Fire Department water tanker (臺北市 水庫車), built in the
idiom of the 32 m aerial ladder study (../2026-09-13(雲梯車)).

Reference class: the 12-tonne three-axle (6x4) water tankers Taipei runs for
water supply at working fires - single-row two-door cab, box-section tank body
with a walkable roof, roof monitor, hard suction hoses on the roof, and the
pump worked from an operator's bay in the tail.

    overall L x W x H      ~9.4 x 2.5 x ~3.4 m
    axles                  front single, tandem rear bogie (1.32 m spread)
    tank                   12 000 L
    crew                   1 + 2 in a single-row cab

Reused from the ladder build: the helper library (boxes, lofted rounded cab,
boolean carving, decals, Weld), the arch flares, banding, wheels and the studio.

Run:  blender -b --factory-startup -P build_water_tanker.py
      TANKER_SAMPLES=40 TANKER_ONLY=tanker_front.png  -> quick preview
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

# --------------------------------------------------------------- dimensions
# Taipei's 12-tonne class water tanker (水庫車): a three-axle 6x4 chassis with a
# single-row two-door cab, a 12 000 L box tank under a walkable roof, a roof
# monitor, and the pump worked from a bay in the tail.
FRONT, REAR = -4.62, 4.70
TIRE_R, AXLE_Z = 0.545, 0.545
AX_F = -3.20
AX_R1, AX_R2 = 1.80, 3.12          # tandem bogie, 1.32 m spread
ARCH_R = 0.720
CAB_F, CAB_R = -4.49, -2.40        # 2.09 m single-row cab; the tank gets the rest
CAB_Z0, CAB_Z1 = 0.98, 3.05
HW_CAB_B = 1.230
# a boxy, upright cab with small radii - the reference cabs are near-vertical slabs
CAB_N = 14.0
CAB_FY, CAB_FZT, CAB_FZB = 0.120, 0.100, 0.050
CAB_RAKE, CAB_TUMBLE = 0.050, 0.020
CAB_RINGS = 48
BODY_F = -2.28
HW_BODY = 1.250
BODY_Z0, BODY_Z1 = 0.96, 2.72      # tank body; the roof is a walkway
DOORS = ((-4.30, -3.22),)
GW, GH = 0.820, 0.740
WIN_Z = 2.380
WS_Z0, WS_Z1 = 1.98, 2.82
WS_HW_B, WS_HW_T = 1.030, 1.020
GRILLE_Z0, GRILLE_Z1 = 1.10, 1.64
CALLSIGN = '信義61'                # unit name + 61, the tanker's call number
BAND_Z0, BAND_Z1 = 1.00, 1.18
SH_Z0, SH_Z1 = 1.24, 2.58
BAYS = ((-0.97, 2.36), (4.27, 0.66))  # front locker, rear hose locker
LEVEL_X = 0.56                     # tank level column, ahead of the bogie
PUMP_Y, PUMP_Z0, PUMP_Z1, PUMP_D = 0.80, 1.16, 2.32, 0.28
CAPACITY_L = 12000

# the ladder's cab detailing was laid out for a nose at -4.72; this cab sits
# 0.23 m further back and 0.08 m taller at the glass
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
    box('Chassis rail', (0.0, y, 0.840), (9.10, 0.12, 0.250), TRIM, .012)
for x in (-4.00, -2.40, -0.60, 1.10, 2.46, 3.80, 4.45):
    box('Cross member', (x, 0, 0.850), (0.11, 0.88, 0.16), TRIM, .010)
cyl('Fuel tank', (-0.95, -0.74, 0.700), 0.25, 1.05, ALU, axis='X')
for dx in (-.40, .40):
    box('Fuel tank strap', (-0.95 + dx, -0.74, 0.700), (.040, .53, .53), TRIM, .006)
box('Battery box', (-0.95, 0.74, 0.720), (0.66, 0.42, 0.40), TRIM, .020)
cyl('Air reservoir', (0.25, 0.70, 0.700), 0.16, 0.80, ALU, axis='X')
cyl('Air reservoir', (0.25, -0.70, 0.700), 0.16, 0.80, ALU, axis='X')
cyl('Silencer', (-2.10, -0.66, 0.640), 0.19, 0.70, TRIM, axis='X')
rod('Exhaust pipe', (-1.75, -0.66, 0.640), (-1.20, -0.98, 0.420), .055, TRIM)
rod('Prop shaft', (-2.30, 0, 0.66), (AX_R1 - .32, 0, AXLE_Z), .055, TRIM)
rod('Inter-axle shaft', (AX_R1 + .32, 0, AXLE_Z), (AX_R2 - .32, 0, AXLE_Z), .050, TRIM)
box('Front axle beam', (AX_F, 0, 0.520), (0.21, 2.02, 0.17), TRIM, .020)
for ax in (AX_R1, AX_R2):
    cyl('Rear differential', (ax, 0, AXLE_Z), 0.30, 0.44, TRIM, axis='Y')
    box('Rear axle beam', (ax, 0, AXLE_Z), (0.19, 2.06, 0.18), TRIM, .020)
for y in (-0.82, 0.82):
    # walking-beam bogie: one spring pack per side rocking on a trunnion
    box('Bogie spring pack', ((AX_R1 + AX_R2) / 2, y, 0.700), (1.40, 0.10, 0.12), TRIM, .010)
    cyl('Bogie trunnion', ((AX_R1 + AX_R2) / 2, y, 0.760), 0.10, 0.20, ALU, axis='Y', verts=24)
    box('Front spring', (AX_F, y, 0.640), (1.20, 0.09, 0.09), TRIM, .010)
# rear-mounted pump hung under the tail, fed by the PTO
cyl('Pump volute', (4.20, 0, 0.700), 0.26, 0.30, TRIM, axis='Y', verts=40)
cyl('Pump casing', (4.20, 0, 0.700), 0.18, 0.52, ALU, axis='Y', verts=32)
rod('Pump drive shaft', (AX_R2 + .32, 0, 0.62), (4.02, 0, 0.70), .045, TRIM)

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
body = taper('Tank body', BODY_F, REAR, BODY_Z0, BODY_Z1,
             HW_BODY, HW_BODY - 0.018, RED, bevel=.050, seg=4)

# arches: one round cut at the front, and for the bogie two round cuts joined
# by a box so the tandem shares one long opening
cutters = [(cab, cyl('Arch cutter', (AX_F, 0, AXLE_Z), ARCH_R, 3.2, RUBBER, bevel=0))]
for ax in (AX_R1, AX_R2):
    cutters.append((body, cyl('Arch cutter', (ax, 0, AXLE_Z), ARCH_R, 3.2, RUBBER, bevel=0)))
cutters.append((body, box('Arch bridge cutter', ((AX_R1 + AX_R2) / 2, 0, (AXLE_Z + ARCH_R) / 2 - .2),
                          (AX_R2 - AX_R1, 3.2, AXLE_Z + ARCH_R + .4), RUBBER, 0)))
for target, cutter in cutters:
    carve(target, cutter)
    bpy.data.objects.remove(cutter, do_unlink=True)

bake(body)
# the pump bay is let into the tail so the panel sits behind the body line
cutter = box('Pump bay cutter', (REAR - PUMP_D / 2 + .05, 0, (PUMP_Z0 + PUMP_Z1) / 2),
             (PUMP_D + .10, PUMP_Y * 2, PUMP_Z1 - PUMP_Z0), RUBBER, 0)
carve(body, cutter)
bpy.data.objects.remove(cutter, do_unlink=True)
b = body.modifiers.new('Bay break', 'BEVEL')
b.width, b.segments, b.limit_method, b.angle_limit = .010, 2, 'ANGLE', math.radians(40)

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
arch_flare((AX_R1, AX_R2), body_hw, BODY_Z0)

# ---------------------------------------------------------- the front face
# Laid out after the Actros-based tankers Fire Wolf bodies for the Taipei area
# (New Taipei's Yongping-61, AAD-570): an upright flat face, a near full-width
# screen in a black surround under a visor, a black wiper cowl, a three-bar
# grey grille, and a grey bumper that carries the headlamps and wraps round
# into the step boxes.  The first cut's bulbous nose and small screen read as
# a toy, which is what this replaces.
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
text('Plate lettering', 'KEB-5121', (FRONT - .032, 0, .860), .082, TRIM, _rot_front)
box('Lower lip', (FRONT + .140, 0, .410), (.240, 2.360, .070), PLASTIC, .030, 3)
# unit callsign in yellow inside the screen, kerb-side top corner, as on the
# Taipei trucks (e.g. 大同15 on KEJ-0662); tankers carry the 61 suffix
text('Windscreen callsign', CALLSIGN, (face_x(2.700) + .040, 0.640, 2.700), .090, YELLOW,
     _rot_front)

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
    for xc, w in BAYS:
        box('Locker frame', (xc, yf, (SH_Z0 + SH_Z1) / 2), (w, .034, SH_Z1 - SH_Z0), ALU, .016)
        box('Shutter backing', (xc, yf, (SH_Z0 + SH_Z1) / 2),
            (w - .075, .016, SH_Z1 - SH_Z0 - .02), PLASTIC, .004)
        n = 11
        pitch = (SH_Z1 - SH_Z0 - .11) / n
        for i in range(n):
            box('Shutter slat', (xc, side * (HW_BODY + .024), SH_Z0 + .075 + i * pitch),
                (w - .085, .028, pitch - .018), RED_DK, .009)
        box('Shutter pull rail', (xc, side * (HW_BODY + .026), SH_Z0 + .045),
            (w - .085, .034, .062), ALU, .012)
        box('Shutter latch', (xc, side * (HW_BODY + .038), SH_Z0 + .045),
            (min(.185, w - .20), .036, .042), CHROME, .010)
        box('Locker header', (xc, side * (HW_BODY + .014), SH_Z1 + .028),
            (w, .028, .048), ALU, .010)
        box('Locker LED strip', (xc, side * (HW_BODY + .034), SH_Z1 + .008),
            (w - .120, .014, .016), LEDBAR, 0)

    # --------------------------------------- tank level column (水位指示燈)
    # Five lamps read the tank from empty to full; the build shows it at
    # four-fifths, with the top lamp dark.
    yl = side * (HW_BODY + .010)
    box('Level column housing', (LEVEL_X, yl, 1.880), (.200, .030, 1.120), TRIM, .014)
    box('Level column bezel', (LEVEL_X, side * (HW_BODY + .026), 1.880), (.170, .012, 1.080),
        ALU, .006)
    for i, m in enumerate((LVL_R, LVL_Y, LVL_G, LVL_G, LVL_OFF)):
        box('Level lamp', (LEVEL_X, side * (HW_BODY + .036), 1.470 + i * .205),
            (.120, .020, .150), m, .014)
    rot = (math.pi / 2, 0, 0 if side < 0 else math.pi)
    text('Level legend', '水位', (LEVEL_X, side * (HW_BODY + .014), 2.530), .095, WHITE, rot)

    # side under-run guard between the cab arch and the bogie
    for z in (0.560, 0.780):
        box('Under-run rail', (-0.70, side * 1.180, z), (3.10, .060, .085), ALU, .016)
    for x in (-2.10, -0.70, 0.70):
        box('Under-run bracket', (x, side * 0.900, 0.700), (.070, .560, .320), TRIM, .010)
    # top capping rail along the body edge
    box('Body cap rail', ((BODY_F + REAR) / 2, side * (HW_BODY - .002), BODY_Z1 - .020),
        (REAR - BODY_F - .06, .036, .060), ALU, .012)
    for x in (BODY_F + .018, REAR - .018):
        box('Corner extrusion', (x, side * (HW_BODY - .004), (BODY_Z0 + BODY_Z1) / 2),
            (.050, .040, BODY_Z1 - BODY_Z0 - .02), ALU, .012)

# --------------------------------------------------------------------- roof
RZ = BODY_Z1 + .036                     # walking surface
box('Roof walkway', ((BODY_F + REAR) / 2, 0, BODY_Z1 + .018),
    (REAR - BODY_F - .20, 2.30, .036), TREAD, .010)
# fold-down guard rail round the walkway
for side in (-1, 1):
    y = side * 1.140
    rod('Roof guard rail', (BODY_F + .25, y, RZ + .330), (REAR - .12, y, RZ + .330), .021, ALU)
    rod('Roof guard rail', (BODY_F + .25, y, RZ + .170), (REAR - .12, y, RZ + .170), .018, ALU)
    for i in range(7):
        x = BODY_F + .25 + (REAR - .12 - BODY_F - .25) * i / 6
        rod('Guard rail stanchion', (x, y, RZ), (x, y, RZ + .330), .019, ALU)
        cyl('Stanchion hinge', (x, y, RZ + .020), .030, .060, TRIM, axis='Y', verts=16)

# roof monitor (車頂水砲), at the front of the walkway so it clears the cab
MX = BODY_F + .55
box('Monitor pedestal', (MX, 0, RZ + .050), (.360, .360, .100), TRIM, .020)
cyl('Monitor riser', (MX, 0, RZ + .190), .078, .200, ALU, axis='Z', verts=28)
cyl('Monitor swivel', (MX, 0, RZ + .325), .098, .070, CHROME, axis='Z', verts=28)
box('Monitor body', (MX, 0, RZ + .430), (.240, .200, .150), RED_DK, .030, 3)
for dy in (-1, 1):
    box('Trunnion cheek', (MX, dy * .120, RZ + .470), (.170, .026, .150), ALU, .014)
cyl('Trunnion pin', (MX, 0, RZ + .480), .030, .290, CHROME, axis='Y', verts=20)
_el = math.radians(14)
_dir = Vector((-math.cos(_el), 0, math.sin(_el)))
_b0 = Vector((MX, 0, RZ + .480))
_b1 = _b0 + _dir * .620
rod('Monitor barrel', _b0, _b1, .056, CHROME)
rod('Flow straightener', _b0 + _dir * .200, _b0 + _dir * .330, .068, ALU)
rod('Monitor nozzle', _b1, _b1 + _dir * .190, .046, ALU)
rod('Nozzle tip', _b1 + _dir * .190, _b1 + _dir * .215, .032, CHROME)
# short tiller off the back of the body, grip across it at waist height
rod('Monitor tiller', _b0 + Vector((.10, 0, -.02)), _b0 + Vector((.30, 0, -.06)), .017, CHROME)
rod('Tiller grip', _b0 + Vector((.30, 0, -.06)), _b0 + Vector((.30, 0, -.20)), .024, PLASTIC)
bpy.ops.mesh.primitive_torus_add(location=(MX + .02, -0.180, RZ + .420),
                                 major_radius=.070, minor_radius=.013,
                                 major_segments=24, minor_segments=8,
                                 rotation=(math.pi / 2, 0, 0))
_hw = bpy.context.object
_hw.name = 'Monitor handwheel'
_hw.data.materials.append(RED_DK)
box('Monitor data plate', (MX + .121, 0, RZ + .430), (.010, .120, .070), WHITE, .004)

# tank manway (人孔): raised collar, hinged lid and swing-bolt dogs
MH_X = 1.50
cyl('Manway collar', (MH_X, 0, RZ + .060), .330, .120, ALU, axis='Z', verts=48)
cyl('Manway lid', (MH_X, 0, RZ + .135), .350, .036, ALU, axis='Z', verts=48, bevel=.010)
cyl('Manway lid boss', (MH_X, 0, RZ + .162), .120, .024, TRIM, axis='Z', verts=28)
box('Manway hinge', (MH_X + .360, 0, RZ + .120), (.080, .200, .060), TRIM, .012)
for j in range(4):
    a = j * TAU / 4 + TAU / 8
    px, py = MH_X + .370 * math.cos(a), .370 * math.sin(a)
    rod('Swing bolt', (px, py, RZ + .040), (px, py, RZ + .190), .016, CHROME)
    rod('Swing bolt tee', (px - .040 * math.sin(a), py + .040 * math.cos(a), RZ + .190),
        (px + .040 * math.sin(a), py - .040 * math.cos(a), RZ + .190), .012, CHROME)
rod('Tank vent', (2.20, 0.55, RZ), (2.20, 0.55, RZ + .260), .040, ALU)
cyl('Vent cap', (2.20, 0.55, RZ + .280), .075, .050, TRIM, axis='Z', verts=24)
rod('Overflow pipe', (2.20, -0.55, RZ), (2.20, -0.55, RZ + .180), .045, ALU)
cyl('Overflow hood', (2.20, -0.55, RZ + .200), .070, .040, TRIM, axis='Z', verts=24)

# hard suction hoses (硬式吸水管) racked along each side of the walkway
for side in (-1, 1):
    y = side * 0.82
    x0, x1 = 2.15, 4.45
    cyl('Hard suction hose', ((x0 + x1) / 2, y, RZ + .115), .072, x1 - x0, HOSE, axis='X',
        verts=24, bevel=.004)
    for k in range(int((x1 - x0) / .09)):
        cyl('Hose helix rib', (x0 + .06 + k * .09, y, RZ + .115), .077, .024, HOSE, axis='X',
            verts=20, bevel=.003)
    for xe in (x0 - .055, x1 + .055):
        cyl('Suction coupling', (xe, y, RZ + .115), .088, .110, BRASS, axis='X', verts=24)
    for xc in (x0 + .35, x1 - .35):
        box('Hose saddle', (xc, y, RZ + .035), (.090, .220, .070), TRIM, .012)
        rod('Hose strap', (xc, y - .080, RZ + .190), (xc, y + .080, RZ + .190), .012, SAFETY)
    cyl('Hose strainer', (x0 - .185, y, RZ + .115), .095, .150, ALU, axis='X', verts=24)

for side in (-1, 1):
    box('Rear roof beacon', (REAR - .14, side * 1.030, BODY_Z1 + .090), (.150, .150, .130),
        BEACON, .030)
    box('Rear work light', (REAR - .06, side * 0.700, BODY_Z1 + .070), (.080, .220, .090), LAMP, .020)

# ------------------------------------------------------------------- tail
# pump operator's bay (後置泵浦操作盤), open with the shutter rolled up
PX = REAR - PUMP_D                 # back wall of the bay
PZC = (PUMP_Z0 + PUMP_Z1) / 2
box('Pump panel', (PX + .012, 0, PZC), (.024, PUMP_Y * 2 - .02, PUMP_Z1 - PUMP_Z0 - .02),
    ALU, .006)
for dy in (-1, 1):
    box('Pump bay cheek', (REAR - PUMP_D / 2, dy * (PUMP_Y - .012), PZC),
        (PUMP_D, .024, PUMP_Z1 - PUMP_Z0), ALU, .006)
box('Pump bay floor', (REAR - PUMP_D / 2, 0, PUMP_Z0 + .012), (PUMP_D, PUMP_Y * 2, .024), TREAD, .006)
box('Shutter roll box', (REAR - .10, 0, PUMP_Z1 - .070), (.170, PUMP_Y * 2 - .04, .130), ALU, .018)
box('Shutter bottom rail', (REAR - .03, 0, PUMP_Z1 - .150), (.040, PUMP_Y * 2 - .06, .040), ALU, .010)
box('Pump bay LED', (REAR - .10, 0, PUMP_Z1 - .145), (.020, PUMP_Y * 2 - .20, .014), LEDBAR, 0)
# master gauges: compound (intake) and discharge pressure
for dy, label in ((-0.24, '進水'), (0.24, '出水')):
    cyl('Gauge bezel', (PX + .035, dy, 2.000), .095, .036, CHROME, axis='X', verts=32)
    cyl('Gauge face', (PX + .046, dy, 2.000), .082, .024, GAUGE, axis='X', verts=32)
    rod('Gauge needle', (PX + .060, dy, 2.000), (PX + .060, dy - .045, 2.035), .004, RED)
    text('Gauge legend', label, (PX + .026, dy, 1.875), .045, TRIM, (math.pi / 2, 0, math.pi / 2))
box('Engine display', (PX + .030, 0.0, 2.040), (.030, .220, .140), DASH, .010)
box('Engine display glass', (PX + .046, 0.0, 2.040), (.006, .180, .100), GLASS_T, .003)
for i, m in enumerate((LVL_G, LVL_Y, LVL_R)):
    box('Panel tell-tale', (PX + .036, 0.55, 2.10 - i * .055), (.020, .040, .030), m, .006)
cyl('Throttle knob', (PX + .050, -0.56, 2.04), .040, .060, RED_DK, axis='X', verts=20)
cyl('Primer knob', (PX + .050, -0.56, 1.92), .032, .060, PLASTIC, axis='X', verts=20)
# central 100 mm intake and four 65 mm discharges, each with its valve lever
cyl('Intake collar', (REAR - .060, 0, 1.430), .105, .140, RED_DK, axis='X', verts=32)
cyl('Intake cap', (REAR + .020, 0, 1.430), .118, .060, BRASS, axis='X', verts=32)
for j in range(3):
    a = j * TAU / 3
    box('Cap lug', (REAR + .020, .120 * math.cos(a), 1.430 + .120 * math.sin(a)),
        (.050, .040, .040), BRASS, .008)
text('Intake legend', '進水口', (PX + .026, 0, 1.620), .050, TRIM, (math.pi / 2, 0, math.pi / 2))
for dy in (-0.60, -0.36, 0.36, 0.60):
    rod('Discharge pipe', (PX + .02, dy, 1.420), (REAR - .040, dy, 1.420), .040, ALU)
    cyl('Discharge coupling', (REAR - .030, dy, 1.420), .058, .060, BRASS, axis='X', verts=24)
    cyl('Discharge cap', (REAR + .006, dy, 1.420), .052, .030, BRASS, axis='X', verts=24)
    rod('Valve stem', (PX + .03, dy, 1.640), (PX + .10, dy, 1.640), .014, CHROME)
    rod('Valve lever', (PX + .10, dy, 1.640), (PX + .12, dy, 1.780), .016, RED_DK)
    cyl('Valve knob', (PX + .12, dy, 1.800), .026, .040, PLASTIC, axis='Z', verts=16)
    cyl('Drain valve', (PX + .05, dy, 1.270), .020, .060, CHROME, axis='X', verts=12)
text('Discharge legend', '出水口', (PX + .026, 0.48, 1.540), .042, TRIM, (math.pi / 2, 0, math.pi / 2))
text('Discharge legend', '出水口', (PX + .026, -0.48, 1.540), .042, TRIM, (math.pi / 2, 0, math.pi / 2))


def chevrons(u0, u1, v0, v1, x):
    """45-degree red and yellow hatching clipped to a rectangle on the tail,
    the halves sloping down and out from the centreline."""
    box('Chevron backing', (x - .008, (u0 + u1) / 2, (v0 + v1) / 2),
        (.016, u1 - u0, v1 - v0), RED_DK, .004)
    for sign in (-1, 1):
        a0, a1 = (u0, min(u1, 0.0)) if sign < 0 else (max(u0, 0.0), u1)
        if a1 - a0 < .02:
            continue
        i, z = 0, v0 - .30
        while z < v1 + 1.80:
            if i % 2 == 0:
                poly = clip_rect([(0, z), (0, z + .150),
                                  (sign * 1.6, z + .150 - 1.6), (sign * 1.6, z - 1.6)],
                                 a0, v0, a1, v1)
                if poly:
                    quad('Rear chevron', [(x + .004, u, v) for u, v in poly], YELLOW)
            z += .150
            i += 1


chevrons(-1.22, 1.22, 0.985, 1.145, REAR + .012)
chevrons(-1.22, -0.83, 1.160, 2.560, REAR + .012)

# rear ladder to the walkway, kerbside, carried past the roof as grab hoops
LY = 1.010
for dy in (-.180, .180):
    # stiles run on past the roof edge and turn forward onto the walkway, so
    # there is something to hold while stepping over the top
    TOP = BODY_Z1 + .62
    rod('Rear ladder stile', (REAR + .120, LY + dy, 0.900), (REAR + .120, LY + dy, TOP), .022, ALU)
    rod('Ladder grab rail', (REAR + .120, LY + dy, TOP), (REAR - .080, LY + dy, TOP), .022, SAFETY)
    rod('Ladder grab rail', (REAR - .080, LY + dy, TOP), (REAR - .080, LY + dy, RZ), .022, SAFETY)
    cyl('Grab rail foot', (REAR - .080, LY + dy, RZ + .010), .040, .020, TRIM, axis='Z', verts=16)
    for z in (1.10, 2.20):
        rod('Ladder stand-off', (REAR + .010, LY + dy, z), (REAR + .120, LY + dy, z), .016, TRIM)
z = 1.000
while z < BODY_Z1:
    box('Ladder rung', (REAR + .120, LY, z), (.050, .360, .030), TREAD, .008)
    z += .280

for side in (-1, 1):
    box('Tail lamp housing', (REAR + .030, side * .860, 0.870), (.055, .600, .150), TRIM, .020)
    for dy, m in ((-.19, TAILRED), (0.0, AMBER), (.19, WHITE)):
        box('Tail lamp lens', (REAR + .060, side * (.860 + dy), 0.870), (.024, .170, .110), m, .012)
    box('Step bumper leg', (REAR - .040, side * .72, 0.820), (.110, .140, .260), TRIM, .014)
    box('Rear marker', (REAR + .016, side * 1.200, 2.640), (.020, .060, .090), AMBER, .008)
box('Rear step bumper', (REAR + .045, 0, 0.680), (.230, 2.320, .130), TREAD, .022)
text('Rear department', '臺北市政府消防局', (REAR + .020, -0.020, 2.470), .115, WHITE,
     (math.pi / 2, 0, math.pi / 2))
box('Rear number plate', (REAR + .060, -0.45, 0.680), (.020, .44, .16), WHITE, .008)
text('Rear plate lettering', 'KEB-5121', (REAR + .072, -0.45, 0.680), .080, TRIM,
     (math.pi / 2, 0, math.pi / 2))

# --------------------------------------------------- level reflective band
ARCH_GROUPS = ((AX_F, AX_F), (AX_R1, AX_R2))


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
    for x0, x1, hw in ((CAB_F + .06, CAB_R, HW_CAB_B), (BODY_F, REAR, HW_BODY)):
        for a, b in arch_spans(x0, x1, BAND_Z0):
            y = side * (hw + .004)
            quad('Reflective band base',
                 [(a, y, BAND_Z0), (b, y, BAND_Z0), (b, y, BAND_Z1), (a, y, BAND_Z1)], RED_DK)
    x = CAB_F + .06
    while x < REAR:
        poly = clip_rect([(x, BAND_Z0), (x + .130, BAND_Z0),
                          (x + .130 + .18, BAND_Z1), (x + .18, BAND_Z1)],
                         CAB_F + .06, BAND_Z0, REAR - .02, BAND_Z1)
        in_gap = CAB_R < x < BODY_F
        if poly and not over_arch(x, x + .31) and not in_gap:
            hw = HW_CAB_B if x < CAB_R else HW_BODY
            quad('Reflective hatch', [(u, side * (hw + .012), v) for u, v in poly], YELLOW)
        x += .245
    # a second, thin reflective line along the top of the tank flank
    yb = side * (body_hw(2.63) + .006)
    quad('Upper reflective line', [(BODY_F + .06, yb, 2.615), (REAR - .06, yb, 2.615),
                                   (REAR - .06, yb, 2.650), (BODY_F + .06, yb, 2.650)], YELLOW)

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
    for tag, ax in (('R1', AX_R1), ('R2', AX_R2)):
        WHEELS.append(('Wheel spin %s %s outer' % (tag, sn), (ax, side * 1.035, AXLE_Z),
                       wheel(ax, side * 1.035, side, .290)))             # bogie outer
        WHEELS.append(('Wheel spin %s %s inner' % (tag, sn), (ax, side * 0.705, AXLE_Z),
                       wheel(ax, side * 0.705, side, .290, face=False))) # bogie inner
    mud_flap(AX_F, side, 0.980, 0.380, CAB_Z0)
    mud_flap(AX_R2, side, 0.870, 0.700, BODY_Z0)

# ---------------------------------------------------------------- lettering
TANK_X = (AX_R1 + AX_R2) / 2
for side in (-1, 1):
    rot = (math.pi / 2, 0, 0 if side < 0 else math.pi)
    text('City department', '臺北市政府消防局',
         (TANK_X, side * (body_hw(2.270) + .014), 2.270), .205, WHITE, rot)
    text('Vehicle type', '水庫車',
         (TANK_X, side * (body_hw(1.800) + .014), 1.800), .340, WHITE, rot)
    text('Capacity', '水箱容量 12 噸',
         (TANK_X, side * (body_hw(1.520) + .014), 1.520), .115, WHITE, rot)
    # door block as Taipei letters it: department, gross weight, seats, plate
    for k, (line, size) in enumerate((('臺北市政府消防局', .078), ('總重 26 噸', .066),
                                      ('限乘 3 人', .066), ('KEB-5121', .066))):
        z = 1.800 - k * .105
        text('Door lettering', line, (-3.860, side * (cab_hw(z) + .014), z), size, WHITE, rot)

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
# Same idea as the ladder: every moving part hangs on an empty, so the
# animation only keys empties and no geometry is rebuilt.
#
#   Vehicle                      <- drive (translate along -X)
#   ├─ Wheel spin F/R1/R2 L/R    <- roll (rotate local Y, - is forward)
#   └─ Monitor slew              <- traverse (rotate Z, + swings the nozzle to the left/-Y)
#      └─ Monitor elevation      <- elevate (rotate Y, + raises the nozzle)
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


MON_SLEW = ('Monitor body', 'Trunnion cheek', 'Trunnion pin', 'Monitor handwheel',
            'Monitor data plate')
MON_ELEV = ('Monitor barrel', 'Flow straightener', 'Monitor nozzle', 'Nozzle tip',
            'Monitor tiller', 'Tiller grip')
mon_slew = empty('Monitor slew', (MX, 0, RZ + .325), 0.35, 'CIRCLE')
mon_elev = empty('Monitor elevation', tuple(_b0), 0.25, 'SINGLE_ARROW')
adopt(mon_elev, mon_slew)
for o in list(bpy.context.scene.objects):
    base = o.name.split('.')[0]
    if base in MON_SLEW:
        adopt(o, mon_slew)
    elif base in MON_ELEV:
        adopt(o, mon_elev)

for name, centre, parts in WHEELS:
    e = empty(name, centre, 0.30, 'SPHERE')
    for o in parts:
        adopt(o, e)

vehicle = empty('Vehicle', (0, 0, 0), 1.5, 'ARROWS')
for o in list(bpy.context.scene.objects):
    if o is not vehicle and o.parent is None:
        adopt(o, vehicle)

scene = bpy.context.scene
scene['Monitor pivot'] = tuple(mon_slew.location)
scene['Monitor trunnion'] = tuple(_b0)
scene['Monitor barrel rest elevation deg'] = 14.0
scene['Axles'] = (AX_F, AX_R1, AX_R2)
scene['Tyre radius'] = TIRE_R
scene['Tank capacity L'] = CAPACITY_L

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
    ('Hero front three-quarter', (-16.0, -13.0, 4.30), (-0.40, 0, 1.80), 68, 'PERSP', 1800, 1150),
    ('Rear three-quarter',       (14.8, -12.4, 4.80),  (1.20, 0, 1.80), 68, 'PERSP', 1800, 1150),
    ('Side elevation',           (0.0, -26.0, 1.80),   (0.0, 0, 1.80),  50, 'ORTHO', 2000, 900),
    ('Roof detail',              (-5.2, -7.0, 7.4),    (1.20, 0, 2.80), 50, 'PERSP', 1500, 1000),
    ('Pump panel',               (8.6, -2.6, 2.10),    (4.60, 0, 1.70), 62, 'PERSP', 1400, 1050),
    ('Head on',                  (-20.0, 0.0, 2.00),   (0, 0, 1.75),   135, 'PERSP', 1250, 1250),
)
cams = {}
for name, loc, target, lens, kind, rx, ry in CAMERAS:
    bpy.ops.object.camera_add(location=loc)
    c = bpy.context.object
    c.name = name
    c.data.lens, c.data.type = lens, kind
    if kind == 'ORTHO':
        c.data.ortho_scale = 10.6
    aim(c, target)
    cams[name] = (c, rx, ry)

s = bpy.context.scene
s.camera = cams['Hero front three-quarter'][0]
s.render.engine = 'CYCLES'
s.cycles.samples = int(os.environ.get('TANKER_SAMPLES', '150'))
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
s['Reference'] = 'Taipei City Fire Department 12-tonne 6x4 water tanker (水庫車)'
s['Model scope'] = ('Proportional exterior study of a Taipei-style water tanker. '
                    'Tank internals and factory detail are estimated.')

bpy.ops.object.select_all(action='DESELECT')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'Water_Tanker.blend'))


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

ONLY = os.environ.get('TANKER_ONLY', '')
for name, filename in (('Hero front three-quarter', 'tanker_front.png'),
                       ('Rear three-quarter', 'tanker_rear.png'),
                       ('Side elevation', 'tanker_side.png'),
                       ('Roof detail', 'tanker_roof.png'),
                       ('Pump panel', 'tanker_pump_panel.png'),
                       ('Head on', 'tanker_head_on.png')):
    if ONLY and filename not in ONLY.split(','):
        continue
    c, rx, ry = cams[name]
    s.camera = c
    s.render.resolution_x, s.render.resolution_y = rx, ry
    # the tail faces the rim light, so the close-up stops down
    s.view_settings.exposure = -1.0 if name == 'Pump panel' else 0.0
    s.render.filepath = os.path.join(OUT, filename)
    bpy.ops.render.render(write_still=True)
    print('RENDERED', filename, flush=True)

print('BUILD OK', flush=True)
