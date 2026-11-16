# -*- coding: utf-8 -*-
"""Taipei City Fire Department smoke exhaust truck (臺北市 排煙車, call
number 76), built in the idiom of the rescue truck (../2026-10-24(救助器材車)),
the water tanker (../2026-10-24(水庫車)) and the aerial ladder
(../2026-09-13(雲梯車)).

Reference: the department's own vehicle page (消防車輛大觀 - 排煙車),
https://www.119.gov.taipei/News_Content.aspx?n=33BD63446AD2E349&sms=B19BD8864CAC3FA9&s=C776F22C9DEE83B2
which lists a generator, an engine-driven smoke fan, a smoke/foam system and
portable fans, at about 7.4 x 2.45 x 3.13 m.  Its rear photo of 劍潭76
(KEG-0626) shows the layout built here:

  * a red drum fan on a pedestal in the middle of an open rear deck, its
    outlet facing the tail, a grey folded duct sleeve gathered round the
    outlet and a stainless mist-nozzle frame inside it;
  * an LED work lamp and yellow handles on the drum, a brass water inlet and
    a stainless flexible pipe at the foot of the boom base, chevrons on the
    base's back face;
  * stainless boxes on the deck either side of the fan;
  * a diamond-plate panel in the middle of the tail with the plate on it,
    red side panels with chevrons, the call sign and the big plate number,
    and tail lamps in yellow bezels.

The fan is lifted on an inclined two-section telescopic boom from a pivot at
the tail of the deck, as on the Fire Wolf water-mist smoke truck shown at
Yilan (自由時報, 雪隧、蘇花改救災利器水霧排煙車) - not on a vertical column -
and slews on a ring in the deck.  The cab is the tanker's, unchanged.

Run:  blender -b --factory-startup -P build_smoke_truck.py
      SMOKE_SAMPLES=40 SMOKE_ONLY=smoke_front.png  -> quick preview
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

# --------------------------------------------- rescue-kit finishes (reused)
TOOL_Y  = mat('Rescue tool yellow',     (.80, .52, .020), .05, .30, .50)
TOOL_DK = mat('Rescue tool black',      (.030, .030, .035), .20, .45)
ORANGE  = mat('Safety orange',          (.85, .20, .015), .0, .35, .30)
ROPE    = mat('Rope bag red',           (.40, .020, .020), .0, .70)
BAGBLK  = mat('Lifting bag rubber',     (.020, .020, .022), .0, .65)
# the Taipei truck's shutters are bare aluminium, not body colour
SHUTTER = mat('Shutter aluminium',      (.56, .58, .59), .75, .30)
CRANE   = mat('Crane red',              (.46, .012, .010), .0, .22, .60)


# -------------------------------------------------------- smoke-only finishes
FAN_RED = mat('Fan drum red',           (.47, .013, .011), .0, .20, .70)
STEEL   = mat('Stainless steel',        (.62, .64, .66), 1.0, .22)
FABRIC  = mat('Duct sleeve fabric',     (.11, .115, .12), .0, .82)
DUCT_BK = mat('Duct coil black',        (.018, .019, .021), .0, .62)
DUCT_OR = mat('Duct lining orange',     (.75, .30, .030), .0, .55)
LINER   = mat('Drum liner',             (.045, .046, .050), .10, .55)
BLADE   = mat('Fan blade alloy',        (.20, .21, .22), .80, .35)

# --------------------------------------------------------------- dimensions
FRONT = -4.62
TIRE_R, AXLE_Z = 0.545, 0.545
AX_F, AX_R = -3.20, 0.95           # 4.15 m wheelbase
ARCH_R = 0.720
CAB_F, CAB_R = -4.49, -2.40        # the tanker's 2.09 m single-row cab
CAB_Z0, CAB_Z1 = 0.98, 3.05
HW_CAB_B = 1.215
CAB_N = 14.0
CAB_FY, CAB_FZT, CAB_FZB = 0.120, 0.100, 0.050
CAB_RAKE, CAB_TUMBLE = 0.050, 0.020
CAB_RINGS = 48
BODY_F, BODY_R = -2.30, 0.35       # tall locker body; the fan deck behind it runs over the rear axle
HW_BODY = 1.225                    # 2.45 m, the department's figure
BODY_Z0, BODY_Z1 = 0.96, 2.85
DOORS = ((-4.30, -3.22),)
GW, GH = 0.820, 0.740
WIN_Z = 2.380
WS_Z0, WS_Z1 = 1.98, 2.82
WS_HW_B, WS_HW_T = 1.030, 1.020
GRILLE_Z0, GRILLE_Z1 = 1.10, 1.64
CALLSIGN = '劍潭76'                # 劍潭 branch + 76, the smoke truck's call number
PLATE = 'KEB-7621'                 # fictitious (the photo's truck is KEG-0626)
PLATE_A, PLATE_B = PLATE.split('-')
BAND_Z0, BAND_Z1 = 1.00, 1.18
SH_Z0, SH_Z1 = 1.24, 2.42
# (x0, x1, z0) per locker; the second starts above the rear arch
BAYS = ((-2.22, -0.80, SH_Z0), (-0.76, 0.27, 1.50))
OPEN_BAY = 0                       # driver's side (-Y) front locker shown open
BAY_DEPTH = 0.70
# open fan deck behind the body
DECK_Z = 1.45
REAR_FACE = 2.70                   # tail panel
REAR = 2.78                        # back of the bumper: 7.40 m overall
FX = 2.30                          # slewing ring, at the tail of the deck
FZ = 2.60                          # drum axis height, stowed
DRUM_R = .52

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


def lathe(name, prof, material, y0=0.0, z0=0.0, segs=64, bevel=0.0):
    """Closed (x, r) profile revolved about an X-parallel axis through (y0, z0)."""
    n, v, f = len(prof), [], []
    for i in range(segs):
        a = TAU * i / segs
        v += [(x, y0 + r * math.cos(a), z0 + r * math.sin(a)) for x, r in prof]
    for i in range(segs):
        j = (i + 1) % segs
        for k in range(n):
            k2 = (k + 1) % n
            f.append((i * n + k, i * n + k2, j * n + k2, j * n + k))
    return _mesh(name, v, f, material, bevel, 2, True)


def torus_x(name, x, y, z, major, minor, material, segs=48):
    """Torus whose axis runs along X."""
    bpy.ops.mesh.primitive_torus_add(location=(x, y, z), major_radius=major, minor_radius=minor,
                                     major_segments=segs, minor_segments=10,
                                     rotation=(0, math.pi / 2, 0))
    o = bpy.context.object
    o.name = name
    return _finish(o, material, 0, 1, True)


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
    p0, p1, p2, p3 = Vector(p0), Vector(p1), Vector(p2), Vector(p3)
    return [p0 * (1 - s) ** 3 + p1 * 3 * s * (1 - s) ** 2 + p2 * 3 * s * s * (1 - s) + p3 * s ** 3
            for s in (i / n for i in range(n + 1))]


def sphere(name, loc, r, material):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=16, ring_count=8)
    o = bpy.context.object
    o.name = name
    return _finish(o, material, 0, 1, True)


# ------------------------------------------------------------------ chassis
for y in (-0.44, 0.44):
    box('Chassis rail', ((-4.40 + REAR_FACE - .05) / 2, y, 0.840), (REAR_FACE - .05 + 4.40, 0.12, 0.250), TRIM, .012)
for x in (-4.00, -2.40, -0.60, 0.40, 1.40, 1.85, 2.62):
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
# PTO generator (發電機) slung under the body, kerbside
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
# the deck section behind the tall body: sides up to the deck, and the tail
# apron dropping to the bumper behind the rear wheels
deck_body = box('Deck body', ((BODY_R + REAR_FACE) / 2, 0, (BODY_Z0 + DECK_Z) / 2),
                (REAR_FACE - BODY_R, 2 * HW_BODY, DECK_Z - BODY_Z0), RED, .030, 3)
box('Tail apron', ((1.92 + REAR_FACE) / 2, 0, (.560 + BODY_Z0 + .02) / 2),
    (REAR_FACE - 1.92, 2 * HW_BODY, BODY_Z0 + .02 - .560), RED, .020)

cutters = [(cab, cyl('Arch cutter', (AX_F, 0, AXLE_Z), ARCH_R, 3.2, RUBBER, bevel=0)),
           (body, cyl('Arch cutter', (AX_R, 0, AXLE_Z), ARCH_R, 3.2, RUBBER, bevel=0)),
           (deck_body, cyl('Arch cutter', (AX_R, 0, AXLE_Z), ARCH_R, 3.2, RUBBER, bevel=0))]
for target, cutter in cutters:
    bake(target)
    carve(target, cutter)
    bpy.data.objects.remove(cutter, do_unlink=True)

# the open locker is a real pocket in the body, so the kit sits inside it
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
                     1.040, .995, RUBBER, x0t=CAB_F + .225, bevel=0),
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

# --------------------------------------------- open locker: portable kit
# As in the department's photo of the earlier truck (568-BH, 排煙消防車):
# coiled lay-flat ducts, black outside and orange inside, stood on edge on
# the shelf, and red portable fans (移動排風機) on the floor below.
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
SHELF = 1.760                              # one shelf, kept below the rolled shutter
box('Locker shelf', (BX, BYC + .02, SHELF), (BW - .04, BAY_DEPTH - .08, .024), ALU, .004)
box('Shelf lip', (BX, -HW_BODY + .085, SHELF + .030), (BW - .04, .016, .040), ALU, .004)

# portable fans: red shroud facing out of the locker, wire guards both
# faces, tube frame with a carry handle, small wheels
for x in (OB_X0 + .30, OB_X0 + .82):
    zc = FL + .260
    lathe('Portable fan shroud', [(-.13, .215), (.13, .215), (.13, .195), (-.13, .195)], RED,
          0, 0, 40).matrix_world = Matrix.Translation((x, BYC, zc)) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
    for dy in (-.135, .135):
        for rr in (.06, .12, .18):
            bpy.ops.mesh.primitive_torus_add(location=(x, BYC + dy, zc), major_radius=rr, minor_radius=.004,
                                             major_segments=28, minor_segments=4, rotation=(math.pi / 2, 0, 0))
            _finish(bpy.context.object, CHROME, 0, 1, False).name = 'Fan guard ring'
        rod('Fan guard spoke', (x, BYC + dy, zc - .20), (x, BYC + dy, zc + .20), .004, CHROME, 6)
        rod('Fan guard spoke', (x - .20, BYC + dy, zc), (x + .20, BYC + dy, zc), .004, CHROME, 6)
    cyl('Portable fan motor', (x, BYC + .03, zc), .070, .14, TOOL_DK, axis='Y', verts=20)
    for dx in (-.23, .23):
        rod('Portable fan frame', (x + dx, BYC, FL + .03), (x + dx, BYC, zc + .23), .012, TOOL_DK)
    rod('Portable fan handle', (x - .23, BYC, zc + .23), (x + .23, BYC, zc + .23), .014, TOOL_DK)
    rod('Portable fan skid', (x - .26, BYC, FL + .03), (x + .26, BYC, FL + .03), .014, TOOL_DK)
    for dx in (-.20, .20):
        cyl('Portable fan wheel', (x + dx, BYC - .16, FL + .045), .045, .035, RUBBER, axis='Y', verts=16)

# lay-flat ducts coiled on edge on the shelf, faces out
for x in (OB_X0 + .33, OB_X0 + 1.00):
    zc = SHELF + .012 + .290
    lathe('Duct coil', [(-.14, .285), (.14, .285), (.14, .110), (-.14, .110)], DUCT_BK, 0, 0, 48
          ).matrix_world = Matrix.Translation((x, BYC, zc)) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
    for dy in (-.141, .141):
        for rr in (.150, .195, .240):
            bpy.ops.mesh.primitive_torus_add(location=(x, BYC + dy, zc), major_radius=rr, minor_radius=.010,
                                             major_segments=40, minor_segments=6, rotation=(math.pi / 2, 0, 0))
            _finish(bpy.context.object, DUCT_OR, 0, 1, True).name = 'Duct coil lining'
    rod('Duct strap', (x, BYC - .15, zc + .29), (x, BYC + .15, zc + .29), .012, SAFETY, 8)

bay_lamp = bpy.data.lights.new('Locker lamp', 'AREA')
bay_lamp.energy, bay_lamp.shape, bay_lamp.size = 45, 'DISK', .60
o = bpy.data.objects.new('Locker lamp', bay_lamp)
bpy.context.collection.objects.link(o)
o.location = (BX, BYC, SH_Z1 - .060)

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

    for z in (0.560, 0.780):
        box('Under-run rail', (-1.12, side * 1.180, z), (2.40, .060, .085), ALU, .016)
    for x in (-2.00, -1.10, -0.20):
        box('Under-run bracket', (x, side * 0.900, 0.700), (.070, .560, .320), TRIM, .010)
    box('Body cap rail', ((BODY_F + BODY_R) / 2, side * (HW_BODY - .002), BODY_Z1 - .020),
        (BODY_R - BODY_F - .06, .036, .060), ALU, .012)
    for x in (BODY_F + .018, BODY_R - .018):
        box('Corner extrusion', (x, side * (HW_BODY - .004), (BODY_Z0 + BODY_Z1) / 2),
            (.050, .040, BODY_Z1 - BODY_Z0 - .02), ALU, .012)


# --------------------------------------------------------------------- roof
RZ = BODY_Z1 + .036
box('Roof deck', ((BODY_F + BODY_R) / 2, 0, BODY_Z1 + .018), (BODY_R - BODY_F - .20, 2.30, .036), TREAD, .010)
# guard rails kept low so the truck stays inside the 3.13 m the department quotes
for side in (-1, 1):
    y = side * 1.140
    rod('Roof guard rail', (BODY_F + .40, y, RZ + .240), (BODY_R - .12, y, RZ + .240), .021, ALU)
    rod('Roof guard rail', (BODY_F + .40, y, RZ + .120), (BODY_R - .12, y, RZ + .120), .018, ALU)
    for i in range(5):
        x = BODY_F + .40 + (BODY_R - .12 - BODY_F - .40) * i / 4
        rod('Guard rail stanchion', (x, y, RZ), (x, y, RZ + .240), .019, ALU)
        cyl('Stanchion hinge', (x, y, RZ + .020), .030, .060, TRIM, axis='Y', verts=16)
# long box for spare lay-flat duct along the centre of the roof
box('Roof duct box', (-0.95, 0, RZ + .110), (2.00, .900, .220), ALU, .025, 3)
box('Duct box lid seam', (-0.95, 0, RZ + .180), (2.02, .910, .010), TRIM, .002)
for x in (-1.70, -0.95, -0.20):
    for side in (-1, 1):
        box('Duct box latch', (x, side * .457, RZ + .145), (.080, .020, .050), CHROME, .006)

# ------------------------------------------ body back wall above the deck
# diamond plate, as seen behind the fan in the photo, with a work lamp on
# each top corner and amber markers on the edges
box('Body back wall', (BODY_R + .006, 0, (DECK_Z + BODY_Z1) / 2), (.012, 2 * HW_BODY - .06, BODY_Z1 - DECK_Z - .04),
    TREAD, .004)
for side in (-1, 1):
    box('Rear work lamp housing', (BODY_R + .055, side * 1.020, BODY_Z1 - .110), (.090, .220, .140), TRIM, .016)
    box('Rear work lamp lens', (BODY_R + .102, side * 1.020, BODY_Z1 - .110), (.006, .190, .110), LAMP, .004)
    box('Rear marker', (BODY_R + .016, side * 1.200, BODY_Z1 - .300), (.020, .060, .090), AMBER, .008)
    box('Rear marker', (BODY_R + .016, side * 1.200, DECK_Z + .300), (.020, .060, .090), TAILRED, .008)

# ------------------------------------------------------------------- deck
box('Fan deck', ((BODY_R + REAR_FACE) / 2, 0, DECK_Z + .010), (REAR_FACE - BODY_R, 2 * HW_BODY - .02, .022),
    TREAD, .004)
for side in (-1, 1):
    box('Deck edge trim', ((BODY_R + REAR_FACE) / 2, side * (HW_BODY - .010), DECK_Z + .025),
        (REAR_FACE - BODY_R, .030, .050), ALU, .008)
box('Deck tail trim', (REAR_FACE - .012, 0, DECK_Z + .025), (.030, 2 * HW_BODY, .050), ALU, .008)

# stainless boxes either side of the fan, clear of its sweep when stowed
DB_X0, DB_X1, DB_H = BODY_R + .06, REAR_FACE - .05, .440
for side in (-1, 1):
    y = side * .925
    box('Deck box', ((DB_X0 + DB_X1) / 2, y, DECK_Z + .022 + DB_H / 2), (DB_X1 - DB_X0, .530, DB_H), STEEL, .018, 3)
    box('Deck box lid', ((DB_X0 + DB_X1) / 2, y, DECK_Z + .022 + DB_H + .008), (DB_X1 - DB_X0 + .02, .550, .016),
        STEEL, .006)
    for x in (DB_X0 + .45, DB_X1 - .45):
        box('Deck box latch', (x, side * .655, DECK_Z + DB_H - .06), (.080, .020, .050), CHROME, .006)
    rod('Deck box hinge', (DB_X0 + .05, side * 1.188, DECK_Z + .022 + DB_H), (DB_X1 - .05, side * 1.188, DECK_Z + .022 + DB_H),
        .010, CHROME, 10)
# the fan's control box, white, on the kerb-side box facing the pedestal
box('Fan control box', (FX + .10, .640, DECK_Z + .300), (.300, .100, .340), WHITE, .020, 3)
box('Fan control panel', (FX + .10, .588, DECK_Z + .310), (.240, .006, .220), TRIM, .004)
for dz, m in ((.06, LVL_G), (0.0, LVL_Y), (-.06, LVL_R)):
    cyl('Control lamp', (FX + .02, .582, DECK_Z + .330 + dz), .014, .012, m, axis='Y', verts=12)
cyl('Emergency stop', (FX + .16, .578, DECK_Z + .380), .030, .022, LVL_R, axis='Y', verts=16)

# ------------------------------------------------------------------- tail
# After the photo: diamond-plate centre panel carrying the plate, red side
# panels with a band of chevrons, call sign in yellow over the plate letters
# on the left, plate numbers on the right, tail lamps in yellow bezels, and
# a red bumper with a reflector strip along it.
_rot_rear = (math.pi / 2, 0, math.pi / 2)
TP_Z0, TP_Z1 = .580, DECK_Z - .010
box('Tail centre panel', (REAR_FACE + .004, 0, (TP_Z0 + TP_Z1) / 2), (.012, .860, TP_Z1 - TP_Z0), TREAD, .004)
box('Rear number plate', (REAR_FACE + .014, 0, 1.080), (.012, .420, .150), WHITE, .006)
text('Rear plate lettering', PLATE, (REAR_FACE + .022, 0, 1.080), .085, TRIM, _rot_rear)
box('Plate lamp', (REAR_FACE + .025, 0, 1.180), (.030, .090, .025), CHROME, .006)
box('Tow bracket', (REAR_FACE + .020, 0, .780), (.030, .420, .080), TRIM, .010)
for dy in (-.14, .14):
    bpy.ops.mesh.primitive_torus_add(location=(REAR_FACE + .045, dy, .735), major_radius=.034,
                                     minor_radius=.010, major_segments=16, minor_segments=6,
                                     rotation=(0, math.pi / 2, 0))
    _finish(bpy.context.object, CHROME, 0, 1, True).name = 'Tow shackle'

CH_Z0, CH_Z1 = 1.180, 1.330
for side in (-1, 1):
    u0, u1 = (.46, 1.20) if side > 0 else (-1.20, -.46)
    k = 0
    u = u0 - .20
    while u < u1:
        poly = clip_rect([(u, CH_Z0), (u + .075, CH_Z0), (u + .075 + .15, CH_Z1), (u + .15, CH_Z1)],
                         u0, CH_Z0, u1, CH_Z1)
        if poly:
            quad('Tail chevron', [(REAR_FACE + .006, a, b) if side > 0 else (REAR_FACE + .006, a, b)
                                  for a, b in poly], YELLOW if k % 2 == 0 else ORANGE)
        u += .075
        k += 1
    yl = (u0 + u1) / 2
    box('Tail lamp bezel', (REAR_FACE + .015, yl, .720), (.030, .400, .170), SAFETY, .014)
    box('Tail lamp lens', (REAR_FACE + .032, yl - .075 * side, .720), (.010, .190, .120), TAILRED, .010)
    box('Reverse lamp lens', (REAR_FACE + .032, yl + .105 * side, .720), (.010, .110, .120), LAMP, .010)
    box('Tail marker', (REAR_FACE + .010, side * 1.180, 1.400), (.020, .050, .050), TAILRED, .006)
text('Tail call sign', CALLSIGN, (REAR_FACE + .010, -0.830, 1.395), .075, YELLOW, _rot_rear)
text('Tail plate letters', PLATE_A + '-', (REAR_FACE + .010, -0.830, 0.990), .200, WHITE, _rot_rear)
text('Tail plate numbers', PLATE_B, (REAR_FACE + .010, 0.830, 1.040), .200, WHITE, _rot_rear)

box('Rear bumper', (REAR - .040, 0, .500), (.080, 2 * HW_BODY - .02, .130), RED, .020, 3)
box('Bumper reflector strip', (REAR + .001, 0, .500), (.004, 2 * HW_BODY - .12, .050), TAILRED, .002)
for side in (-1, 1):
    box('Bumper hanger', (REAR - .100, side * .440, .640), (.120, .100, .200), TRIM, .010)


# ------------------------------------------------------------ the smoke fan
# The head is lifted on an inclined boom, not a vertical column - as on the
# Fire Wolf water-mist smoke truck shown at Yilan (自由時報: 雪隧、蘇花改救災
# 利器水霧排煙車), which matches 劍潭76's stowed head:
#   slewing ring on the deck at the tail -> turntable with two cheek plates
#   (the red block with chevrons under the outlet in the 劍潭76 photo) ->
#   boom pivot across the cheeks -> two-section telescopic boom that lies
#   forward under the drum when stowed and rises toward the cab -> cradle
#   on a tilt pin at the boom tip gripping the middle of the drum.
# A lift ram from low in the slewing column (below the deck) pushes the
# boom's underside; a hydraulic rotary actuator on the tip pin keeps the drum
# level as the boom rises.  The fan has a flared red inlet bell at the front
# and is driven hydraulically from the truck's PTO (the black couplings on top
# of the drum) - there is no separate engine on the head.
BOOM_UP = 65.0                             # boom raise, degrees
TILT_LEVEL = -45.0                         # tilt that leaves the outlet 20 deg down
BOOM_EXT = .55                             # telescope stroke
P = Vector((FX + .05, 0, 1.820))           # boom pivot
PIN0 = Vector((1.320, 0, 1.820))           # tilt pin at the boom tip, stowed (ahead of the drum)
A_RAM = Vector((FX + .10, 0, 1.150))       # lift ram anchor, low in the slewing column
OB_W, OB_H = .300, .320                    # outer boom section
IB_W, IB_H = .240, .260                    # inner boom section
OB_BUTT, OB_FRONT = P.x + .17, P.x - .72   # outer boom ends (stowed, along X)
IB_TAIL = P.x + .15                        # inner boom tail (stowed)
assert FZ - DRUM_R - .03 > P.z + OB_H / 2, 'drum must clear the stowed boom'

HOUSING, SLEW, BOOM, EXTN, TILT, ROTOR = [], [], [], [], [], []


def rot_y(v, deg, about):
    """Rotate point v about a Y-parallel axis through `about` (+ raises -X)."""
    a = math.radians(deg)
    d = Vector(v) - about
    return about + Vector((d.x * math.cos(a) + d.z * math.sin(a), d.y,
                          -d.x * math.sin(a) + d.z * math.cos(a)))


def xbeam(name, a, b, wy, h, material, bevel=.016):
    """Box section from a to b in an X-Z plane: wy across Y, h across the plane."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    n = Vector((-d.z, 0, d.x)) * (h / 2)
    y = Vector((0, wy / 2, 0))

    def ring(p):
        return [tuple(p - y - n), tuple(p + y - n), tuple(p + y + n), tuple(p - y + n)]
    return hexa(name, ring(a), ring(b), material, bevel, 2)


def ram(name, base, length, r, material):
    """Cylinder along local +Z from its origin at `base` (Damped Track aims +Z)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=r, depth=length, location=base)
    o = bpy.context.object
    o.name = name
    for v in o.data.vertices:
        v.co.z += length / 2
    return _finish(o, material, .005, 2, True)


def clevis(name, p, group, gap, eye_r, eye_mat, cheek_mat=FAN_RED):
    """Pin across Y through two round cheeks, the ram eye between them."""
    group.append(cyl(name + ' pin', tuple(p), .025, gap + .070, CHROME, axis='Y', verts=14))
    group.append(cyl(name + ' eye', tuple(p), eye_r, gap - .012, eye_mat, axis='Y', verts=24))
    for dy in (-1, 1):
        group.append(cyl(name + ' cheek', (p.x, p.y + dy * (gap / 2 + .012), p.z), eye_r + .020, .022,
                         cheek_mat, axis='Y', verts=24))


# ------------------------------------- pedestal, slewing ring, turntable
# fixed pedestal under the deck, bolted to the rails; the slewing column
# hangs inside it and carries the lift ram's anchor
HOUSING += [box('Fan pedestal', (FX, 0, (.550 + DECK_Z) / 2), (.560, .560, DECK_Z - .550), FAN_RED, .020, 3),
            box('Pedestal deck flange', (FX, 0, DECK_Z + .026), (.760, .760, .012), TRIM, .004),
            cyl('Slewing ring race', (FX, 0, DECK_Z + .045), .330, .030, TRIM, axis='Z', verts=48)]
for side in (-1, 1):
    HOUSING.append(box('Pedestal rail bracket', (FX, side * .340, .830), (.440, .160, .140), TRIM, .010))
HOUSING += [box('Slew drive gearbox', (FX - .330, .260, DECK_Z + .060), (.120, .120, .070), TRIM, .010),
            cyl('Slew drive motor', (FX - .330, .260, DECK_Z + .150), .040, .110, TRIM, axis='Z', verts=16)]

TT_Z = DECK_Z + .060                       # turntable underside
SLEW += [cyl('Slewing ring', (FX, 0, TT_Z), .320, .030, CHROME, axis='Z', verts=48),
         box('Turntable', (FX, 0, TT_Z + .035), (.600, .600, .040), FAN_RED, .012),
         cyl('Slewing column', (FX, 0, (1.000 + TT_Z) / 2), .200, TT_Z - 1.000, FAN_RED, axis='Z', verts=32)]
CH_X0, CH_X1, CH_Z1 = FX - .25, FX + .26, P.z + .12
for side in (-1, 1):
    SLEW.append(box('Boom cheek plate', ((CH_X0 + CH_X1) / 2, side * .200, (TT_Z + .055 + CH_Z1) / 2),
                    (CH_X1 - CH_X0, .040, CH_Z1 - TT_Z - .055), FAN_RED, .012))
    SLEW.append(cyl('Boom pivot boss', (P.x, side * .228, P.z), .100, .040, FAN_RED, axis='Y', verts=28))
SLEW.append(cyl('Boom pivot pin', tuple(P), .040, .520, CHROME, axis='Y', verts=16))
# boom rest frame - the bottom stroke of the Z: two rails forward from the
# cheeks along the deck, padded where the stowed boom lies on them
RF_Z0, RF_Z1 = TT_Z + .055, P.z - OB_H / 2 - .020
for side in (-1, 1):
    SLEW += [box('Boom rest rail', ((1.550 + CH_X0 + .02) / 2, side * .110, (RF_Z0 + RF_Z1) / 2),
                 (CH_X0 + .02 - 1.550, .050, RF_Z1 - RF_Z0), FAN_RED, .008),
             box('Boom rest pad', (1.640, side * .110, RF_Z1 + .010), (.120, .060, .020), PLASTIC, .004)]
SLEW.append(box('Boom rest cross tie', (1.575, 0, (RF_Z0 + RF_Z1) / 2), (.050, .270, RF_Z1 - RF_Z0), FAN_RED, .008))
# back of the cheeks: chevron band over a diamond-plate guard, as on 劍潭76
_px = CH_X1 + .006
SLEW += [box('Boom base back plate', (CH_X1, 0, (TT_Z + .055 + CH_Z1) / 2), (.012, .440, CH_Z1 - TT_Z - .055),
             FAN_RED, .004),
         box('Boom base kick guard', (_px, 0, TT_Z + .150), (.006, .400, .160), TREAD, .002)]
k, u = 0, -.45
while u < .21:
    poly = clip_rect([(u, CH_Z1 - .170), (u + .055, CH_Z1 - .170), (u + .170, CH_Z1 - .040),
                      (u + .115, CH_Z1 - .040)], -.21, CH_Z1 - .170, .21, CH_Z1 - .040)
    if poly:
        SLEW.append(quad('Boom base chevron', [(_px + .004, a, b) for a, b in poly],
                         YELLOW if k % 2 == 0 else ORANGE))
    u += .055
    k += 1

# ------------------------------------------------------ telescopic boom
BOOM += [xbeam('Outer boom', (OB_BUTT, 0, P.z), (OB_FRONT, 0, P.z), OB_W, OB_H, FAN_RED),
         xbeam('Outer boom mouth', (OB_FRONT + .05, 0, P.z), (OB_FRONT, 0, P.z), OB_W + .03, OB_H + .03, TRIM, .008)]
for side in (-1, 1):
    BOOM.append(cyl('Boom pivot eye', (P.x, side * .160, P.z), .110, .020, FAN_RED, axis='Y', verts=28))
EXTN += [xbeam('Inner boom', (IB_TAIL, 0, P.z), (PIN0.x + .06, 0, P.z), IB_W, IB_H, FAN_RED),
         xbeam('Boom head', (PIN0.x + .12, 0, P.z), (PIN0.x - .06, 0, P.z), IB_W + .04, IB_H + .04, FAN_RED, .020),
         cyl('Tilt pin', tuple(PIN0), .030, .520, CHROME, axis='Y', verts=14),
         # hydraulic rotary actuator on the pin: keeps the drum level
         cyl('Tilt rotary actuator', (PIN0.x, .250, PIN0.z), .095, .110, TRIM, axis='Y', verts=28),
         cyl('Actuator end cap', (PIN0.x, .313, PIN0.z), .070, .016, CHROME, axis='Y', verts=24),
         # rotary union on the other side passes oil and water across the pin
         cyl('Rotary union', (PIN0.x, -.250, PIN0.z), .060, .110, TRIM, axis='Y', verts=24),
         cyl('Union port', (PIN0.x, -.320, PIN0.z), .030, .030, BRASS, axis='Y', verts=14)]
# wear pads at the outer boom mouth ride on the inner boom
for dz in (-1, 1):
    BOOM.append(box('Boom wear pad', (OB_FRONT + .040, 0, P.z + dz * (IB_H / 2 + .012)), (.060, IB_W - .02, .020),
                    PLASTIC, .004))

# lift ram: barrel pinned low in the slewing column, rod pinned to a lug on
# the outer boom's underside; both halves aim at each other's pin
B_RAM = Vector((P.x - .500, 0, P.z - OB_H / 2 - .040))
BOOM.append(box('Lift ram lug', (B_RAM.x, 0, B_RAM.z + .030), (.140, .120, .080), FAN_RED, .010))
L_STOW = (B_RAM - A_RAM).length
L_UP = (rot_y(B_RAM, BOOM_UP, P) - A_RAM).length
LB, LR = L_STOW - .030, L_STOW - .050
assert LB + LR - L_UP > .20, 'lift ram would come apart at full raise'
print('LIFT RAM  stowed %.3f  raised %.3f  overlap at full %.3f' % (L_STOW, L_UP, LB + LR - L_UP), flush=True)
lift_barrel = ram('Lift ram barrel', tuple(A_RAM), LB, .075, FAN_RED)
lift_rod = ram('Lift ram rod', tuple(B_RAM), LR, .045, HYD)
SLEW.append(lift_barrel)
BOOM.append(lift_rod)
clevis('Lift ram base', A_RAM, SLEW, .160, .060, FAN_RED)
clevis('Lift ram head', B_RAM, BOOM, .120, .045, HYD)
# the telescope stays engaged: inner boom inside the outer at full stroke
_ov = (IB_TAIL - BOOM_EXT) - OB_FRONT
assert _ov > .30, 'inner boom would leave the outer boom'
print('TELESCOPE inner boom left inside the outer at full stroke %.3f m' % _ov, flush=True)

# ---------------------------------------------- cradle and drum (tilt)
# The head arm - the top stroke of the boom's Z, as in the Taitung and
# Kaohsiung photos - runs back from the tip pin to a long base plate under
# the drum: two side plates that straddle the boom (stowed they lie either
# side of it), welded to the plate.  A side arm up each flank of the drum
# ends in bolted trunnion blocks at the drum's middle.
CR_X0, CR_X1, CR_Z = 1.420, 2.060, FZ - DRUM_R - .030
TRX = 1.760                                # trunnion blocks
TILT.append(box('Cradle base plate', ((CR_X0 + CR_X1) / 2, 0, CR_Z), (CR_X1 - CR_X0, 1.180, .030), FAN_RED, .008))
for side in (-1, 1):
    _he = Vector((1.900, side * .175, CR_Z - .115))
    TILT += [xbeam('Head arm plate', (PIN0.x - .060, side * .175, PIN0.z), tuple(_he), .030, .200, FAN_RED, .010),
             cyl('Head arm boss', (PIN0.x, side * .175, PIN0.z), .110, .036, FAN_RED, axis='Y', verts=28),
             box('Cradle side arm', (TRX, side * .575, (CR_Z + FZ) / 2 + .020), (.300, .030, FZ - CR_Z + .100),
                 FAN_RED, .012),
             box('Cradle trunnion block', (TRX, side * .545, FZ), (.200, .040, .160), FAN_RED, .012)]
    for dx in (-.07, .07):
        for dz in (-.05, .05):
            TILT.append(cyl('Trunnion bolt', (TRX + dx, side * .568, FZ + dz), .012, .012, CHROME, axis='Y', verts=10))

# drum: flared red inlet bell at the front, cylindrical body, outlet at the tail
TILT.append(lathe('Fan drum', [(1.150, .600), (1.170, .608), (1.250, .588), (1.350, .548), (1.420, DRUM_R),
                               (2.400, DRUM_R), (2.460, .535), (2.520, .560), (2.530, .552), (2.515, .530),
                               (2.455, .508), (2.400, .506), (1.420, .506), (1.350, .532), (1.250, .572),
                               (1.170, .590)], FAN_RED, 0, FZ, 72))
TILT.append(lathe('Drum liner', [(1.440, .504), (2.400, .504), (2.452, .506), (2.452, .498), (2.400, .496),
                                 (1.440, .496)], LINER, 0, FZ, 72))
# inlet guard: rings and spokes across the bell
for rr in (.14, .28, .42, .54):
    TILT.append(torus_x('Inlet guard ring', 1.240, 0, FZ, rr, .005, CHROME, 40))
for i in range(6):
    a = math.pi * i / 6
    TILT.append(rod('Inlet guard spoke', (1.240, -.56 * math.cos(a), FZ - .56 * math.sin(a)),
                    (1.240, .56 * math.cos(a), FZ + .56 * math.sin(a)), .005, CHROME, 6))
# hydraulic motor in the drum's centre on four struts, rotor just behind it
TILT += [cyl('Hydraulic fan motor', (1.560, 0, FZ), .110, .200, TRIM, axis='X', verts=28),
         lathe('Motor nose', [(1.460, .010), (1.460, .105), (1.400, .060), (1.380, .010)], TRIM, 0, FZ, 28)]
for i in range(4):
    a = math.radians(45 + 90 * i)
    TILT.append(rod('Motor strut', (1.560, .110 * math.cos(a), FZ + .110 * math.sin(a)),
                    (1.560, .495 * math.cos(a), FZ + .495 * math.sin(a)), .016, TRIM, 8))
for i in range(6):                         # straightener vanes downstream
    a = TAU * i / 6
    TILT.append(rod('Straightener vane', (2.120, .060 * math.cos(a), FZ + .060 * math.sin(a)),
                    (2.120, .495 * math.cos(a), FZ + .495 * math.sin(a)), .010, TRIM, 6))
TILT.append(cyl('Straightener hub', (2.120, 0, FZ), .060, .120, TRIM, axis='X', verts=20))

HUB_X = 1.760
ROTOR += [cyl('Fan hub', (HUB_X, 0, FZ), .110, .180, TRIM, axis='X', verts=32),
          lathe('Hub tail cone', [(HUB_X + .090, .010), (HUB_X + .090, .105), (HUB_X + .150, .070),
                                  (HUB_X + .175, .010)], ALU, 0, FZ, 32)]
PITCH = math.radians(32)
for i in range(9):
    a = TAU * i / 9
    u = Vector((0, math.cos(a), math.sin(a)))       # radial
    t = Vector((0, -math.sin(a), math.cos(a)))      # tangential
    ring = []
    for r, ch in ((.115, .160), (.485, .220)):
        c = (Vector((1, 0, 0)) * math.cos(PITCH) + t * math.sin(PITCH)) * (ch / 2)
        n = c.cross(u).normalized() * .006
        p = Vector((HUB_X, 0, FZ)) + u * r
        ring.append([tuple(p - c - n), tuple(p + c - n), tuple(p + c + n), tuple(p - c + n)])
    ROTOR.append(hexa('Fan blade', ring[0], ring[1], BLADE, .003, 1))

# stainless mist / foam nozzle frame in the outlet (排煙發泡), as in the photo
NX, NH = 2.380, .150
_c = [(-NH, -NH), (NH, -NH), (NH, NH), (-NH, NH)]
for (y0, z0), (y1, z1) in zip(_c, _c[1:] + _c[:1]):
    TILT.append(rod('Nozzle manifold', (NX, y0, FZ + z0), (NX, y1, FZ + z1), .016, STEEL, 12))
for y, z in _c + [(0, -.330), (.260, 0)]:
    TILT += [cyl('Mist nozzle body', (NX + .035, y, FZ + z), .026, .060, STEEL, axis='X', verts=14),
             cyl('Mist nozzle tip', (NX + .072, y, FZ + z), .018, .020, BRASS, axis='X', verts=12)]
RISER_Z = FZ - DRUM_R - .045
TILT += [rod('Nozzle riser', (NX, 0, RISER_Z + .005), (NX, 0, FZ - NH), .020, STEEL, 12),
         rod('Nozzle side stub', (NX, NH, FZ), (NX, .260, FZ), .016, STEEL, 12),
         cyl('Riser coupling', (NX, 0, RISER_Z), .035, .050, BRASS, axis='Z', verts=16)]

# grey lay-flat duct sleeve concertina'd round the outlet, stiff mouth ring
for i in range(6):
    x = 2.430 + i * .042
    TILT.append(torus_x('Duct sleeve fold', x, 0, FZ - .006 * i, .566 + .016 * (i % 2), .030, FABRIC))
TILT.append(torus_x('Duct sleeve mouth ring', 2.690, 0, FZ - .040, .552, .016, WHITE))
for i in range(8):
    a = TAU * i / 8
    TILT.append(rod('Duct sleeve strap', (2.420, .585 * math.cos(a), FZ + .585 * math.sin(a)),
                    (2.690, .570 * math.cos(a), FZ - .040 + .570 * math.sin(a)), .006, FABRIC, 6))

# LED work lamp on the upper driver's-side shoulder, yellow lifting handles
_la = math.radians(135)
_lp = Vector((2.300, (DRUM_R + .075) * math.cos(_la), FZ + (DRUM_R + .075) * math.sin(_la)))
TILT += [box('Work lamp housing', tuple(_lp), (.100, .130, .130), TRIM, .020),
         box('Work lamp lens', tuple(_lp + Vector((.052, 0, 0))), (.006, .105, .105), LAMP, .004),
         rod('Work lamp bracket', tuple(_lp - Vector((.030, 0, 0))),
             (2.270, (DRUM_R - .01) * math.cos(_la), FZ + (DRUM_R - .01) * math.sin(_la)), .016, SAFETY, 10)]
for x in (1.600, 2.250):
    TILT += [rod('Lifting handle', (x - .070, 0, FZ + DRUM_R - .005), (x - .070, 0, FZ + DRUM_R + .060), .014, SAFETY, 10),
             rod('Lifting handle', (x + .070, 0, FZ + DRUM_R - .005), (x + .070, 0, FZ + DRUM_R + .060), .014, SAFETY, 10),
             rod('Lifting handle', (x - .070, 0, FZ + DRUM_R + .060), (x + .070, 0, FZ + DRUM_R + .060), .014, SAFETY, 10)]

# hydraulic couplings on top of the drum (the photo's black knobs) feed the
# motor; their hoses run down the driver's-side flank to the rotary union
_cp = []
for i, a in enumerate((100, 115, 130, 145)):     # upper driver's-side shoulder
    r = math.radians(a)
    p = Vector((2.000, (DRUM_R + .030) * math.cos(r), FZ + (DRUM_R + .030) * math.sin(r)))
    TILT += [rod('Hydraulic coupling', tuple(p - (p - Vector((p.x, 0, FZ))).normalized() * .030),
             tuple(p + (p - Vector((p.x, 0, FZ))).normalized() * .040), .030, PLASTIC, 16)]
    _cp.append(p + (p - Vector((p.x, 0, FZ))).normalized() * .040)
# pressure and return hoses from two of them, laid down the flank close to
# the drum, clipped to the cradle arm, into the rotary union on the pin
OIL_HOSES = []
for i, p in enumerate((_cp[2], _cp[3])):
    out = (p - Vector((p.x, 0, FZ))).normalized()
    end = Vector((PIN0.x - .030 + .060 * i, -.335, PIN0.z))
    mid = Vector((TRX + .060 - .050 * i, -.615, FZ - .080))
    pts = bezier(p, p + out * .080, mid + Vector((.050, -.020, .200)), mid, 12)
    pts += bezier(mid, mid + Vector((-.040, 0, -.200)), end + Vector((.060, -.120, .120)), end, 12)[1:]
    OIL_HOSES.append(hose_curve('Motor oil hose', pts, .016, TOOL_DK))
TILT += OIL_HOSES
TILT.append(box('Hose clamp', (TRX + .035, -.605, FZ - .080), (.120, .030, .050), TRIM, .006))

# --------------------------------------------------------------- water
# 65 mm brass inlet on the deck at the tail, stainless flexible pipe into a
# gland over the slewing ring's centre swivel; the water rides up inside
# the boom and leaves the head through the rotary union to the riser
_inl = Vector((FX + .340, -.420, DECK_Z + .120))
HOUSING += [cyl('Water inlet coupling', tuple(_inl + Vector((.060, 0, 0))), .052, .080, BRASS, axis='X', verts=24),
            cyl('Inlet coupling lugs', tuple(_inl + Vector((.090, 0, 0))), .062, .025, BRASS, axis='X', verts=6),
            box('Inlet bracket', tuple(_inl + Vector((.000, 0, -.070))), (.100, .100, .110), TRIM, .010),
            box('Deck water gland', (FX + .080, -.400, DECK_Z + .050), (.120, .120, .060), TRIM, .008)]
_flex = bezier(_inl, _inl - Vector((.150, 0, 0)), Vector((FX + .120, -.400, DECK_Z + .200)),
               Vector((FX + .080, -.400, DECK_Z + .080)), 16)
HOUSING.append(hose_curve('Stainless flexible pipe', _flex, .036, STEEL))
for p in _flex[2:-2:3]:
    HOUSING.append(torus_x('Flexible pipe corrugation', p.x, p.y, p.z, .036, .006, STEEL, 16))
_wa = Vector((PIN0.x, -.335, PIN0.z - .050))
_wb = Vector((NX, 0, RISER_Z - .020))
FEED = hose_curve('Nozzle feed hose', bezier(_wa, _wa + Vector((0, -.08, -.10)), _wb + Vector((-.30, -.20, -.06)),
                                             _wb, 16), .022, STEEL)
TILT.append(FEED)

# ------------------------------------------------------------- lettering
# On the plain red band above the shutters - never on the shutters - in
# reading order on both flanks; the earlier Taipei truck reads 排煙消防車.
LET_Z = 2.660
_mid = (BODY_F + BODY_R) / 2
for side in (-1, 1):
    rot = (math.pi / 2, 0, 0 if side < 0 else math.pi)
    xd, xt = (_mid - .55, _mid + .82) if side < 0 else (_mid + .55, _mid - .82)
    text('City department', '臺北市政府消防局', (xd, side * (body_hw(LET_Z) + .014), LET_Z), .180, WHITE, rot)
    text('Vehicle type', '排煙消防車', (xt, side * (body_hw(LET_Z) + .014), LET_Z), .180, WHITE, rot)
    for k, (line, size) in enumerate((('臺北市政府消防局', .078), ('總重 11 噸', .066),
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
    for x0, x1, hw in ((CAB_F + .06, CAB_R, HW_CAB_B), (BODY_F, REAR_FACE, HW_BODY)):
        for a, b in arch_spans(x0, x1, BAND_Z0):
            y = side * (hw + .004)
            quad('Reflective band base',
                 [(a, y, BAND_Z0), (b, y, BAND_Z0), (b, y, BAND_Z1), (a, y, BAND_Z1)], RED_DK)
    x = CAB_F + .06
    while x < REAR_FACE:
        poly = clip_rect([(x, BAND_Z0), (x + .130, BAND_Z0),
                          (x + .130 + .18, BAND_Z1), (x + .18, BAND_Z1)],
                         CAB_F + .06, BAND_Z0, REAR_FACE - .02, BAND_Z1)
        in_gap = CAB_R < x < BODY_F
        if poly and not over_arch(x, x + .31) and not in_gap:
            hw = HW_CAB_B if x < CAB_R else HW_BODY
            quad('Reflective hatch', [(u, side * (hw + .012), v) for u, v in poly], YELLOW)
        x += .245
    # a second, thin reflective line along the top of the body flank
    yb = side * (body_hw(2.50) + .006)
    quad('Upper reflective line', [(BODY_F + .06, yb, 2.480), (BODY_R - .06, yb, 2.480),
                                   (BODY_R - .06, yb, 2.515), (BODY_F + .06, yb, 2.515)], YELLOW)

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
#   └─ Fan slew                       <- slew (rotate Z) on the deck slewing ring
#      └─ Fan boom lift               <- raise (rotate Y, + lifts the tip), 0 .. BOOM_UP
#         └─ Fan boom extend          <- telescope (translate local -X), 0 .. BOOM_EXT
#            └─ Fan tilt              <- level (rotate Y about the tip pin;
#               │                        TILT_LEVEL with the boom up keeps
#               │                        the outlet 20 deg down)
#               └─ Fan rotor          <- spin (rotate X)
# Raise before slewing: stowed, the head sits between the deck boxes.
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


slew = empty('Fan slew', (FX, 0, TT_Z), 0.60, 'CIRCLE')
lift = empty('Fan boom lift', tuple(P), 0.40, 'SINGLE_ARROW')
extn = empty('Fan boom extend', tuple(P), 0.30, 'SINGLE_ARROW')
tilt = empty('Fan tilt', tuple(PIN0), 0.40, 'SINGLE_ARROW')
rotor = empty('Fan rotor', (HUB_X, 0, FZ), 0.30, 'CIRCLE')
anchor_a = empty('Lift ram anchor', tuple(A_RAM), 0.08)
anchor_b = empty('Lift ram eye', tuple(B_RAM), 0.08)
bpy.context.view_layer.update()
adopt(lift, slew)
adopt(extn, lift)
adopt(tilt, extn)
adopt(rotor, tilt)
for group, parent in ((SLEW + [anchor_a], slew), (BOOM + [anchor_b], lift), (EXTN, extn),
                      (TILT, tilt), (ROTOR, rotor)):
    for o in group:
        adopt(o, parent)
# the ram halves aim at each other's pin, so the ram strokes as the boom rises
for o, target in ((lift_barrel, anchor_b), (lift_rod, anchor_a)):
    c = o.constraints.new('DAMPED_TRACK')
    c.target, c.track_axis = target, 'TRACK_Z'

for name, centre, parts in WHEELS:
    e = empty(name, centre, 0.30, 'SPHERE')
    for o in parts:
        adopt(o, e)

vehicle = empty('Vehicle', (0, 0, 0), 1.5, 'ARROWS')
for o in list(bpy.context.scene.objects):
    if o is not vehicle and o.parent is None:
        adopt(o, vehicle)
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


# Hoses that cross the tilt pin belong to the drum but their union end is
# pinned to the boom head, blending over the last few points so they bend
# round the pin as the drum levels instead of pulling off the union.
for cu in OIL_HOSES:                       # points 0-24, union end last
    for i in range(17, 25):
        hose_hook(cu, extn, i, smooth((i - 16) / 8))
for i in range(0, 8):                      # feed hose: union end first
    hose_hook(FEED, extn, i, smooth((8 - i) / 8))

scene = bpy.context.scene
scene['Axles'] = (AX_F, AX_R)
scene['Tyre radius'] = TIRE_R
scene['Fan slew axis'] = (FX, 0.0)
scene['Fan boom pivot'] = tuple(P)
scene['Fan boom up deg'] = BOOM_UP
scene['Fan boom extension'] = BOOM_EXT
scene['Fan tilt level deg'] = TILT_LEVEL
scene['Fan drum radius'] = DRUM_R

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
    ('Rear three-quarter',       (11.8, -9.6, 4.40),   (0.60, 0, 1.80), 68, 'PERSP', 1800, 1150),
    ('Side elevation',           (-0.92, -26.0, 1.70), (-0.92, 0, 1.70), 50, 'ORTHO', 2000, 900),
    # the angle of the department's photo: low, off the driver's-side tail
    ('Fan detail',               (6.60, -2.30, 1.75),  (2.00, 0.05, 2.25), 36, 'PERSP', 1400, 1200),
    ('Equipment locker',         (-0.55, -5.30, 2.10), (-1.45, -0.90, 1.80), 40, 'PERSP', 1500, 1100),
    ('Roof detail',              (-5.8, -6.4, 7.2),    (0.00, 0, 2.80), 50, 'PERSP', 1500, 1000),
    ('Head on',                  (-20.0, 0.0, 2.00),   (0, 0, 1.70),   135, 'PERSP', 1250, 1250),
    ('Fan deployed',             (10.5, -8.4, 5.20),   (1.20, 0, 2.60), 62, 'PERSP', 1800, 1150),
    # side-on and low, the angle of the Yilan photo of the boom
    ('Boom detail',              (2.00, -9.00, 2.90),  (2.00, 0, 2.90), 40, 'PERSP', 1400, 1250),
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
s.cycles.samples = int(os.environ.get('SMOKE_SAMPLES', '150'))
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
s['Reference'] = ('Taipei City Fire Department smoke exhaust truck (排煙車, 76); '
                  'layout after the photos on www.119.gov.taipei')
s['Model scope'] = ('Proportional exterior study with a single-row cab and a rear deck smoke fan '
                    'on a lift / slew / tilt head. Cab, locker contents and factory detail are estimated.')

bpy.ops.object.select_all(action='DESELECT')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'Smoke_Truck.blend'))

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

ONLY = os.environ.get('SMOKE_ONLY', '')
for name, filename in (('Hero front three-quarter', 'smoke_front.png'),
                       ('Rear three-quarter', 'smoke_rear.png'),
                       ('Side elevation', 'smoke_side.png'),
                       ('Fan detail', 'smoke_fan.png'),
                       ('Equipment locker', 'smoke_locker.png'),
                       ('Roof detail', 'smoke_roof.png'),
                       ('Head on', 'smoke_head_on.png')):
    if ONLY and filename not in ONLY.split(','):
        continue
    c, rx, ry = cams[name]
    s.camera = c
    s.render.resolution_x, s.render.resolution_y = rx, ry
    s.view_settings.exposure = 0.0
    s.render.filepath = os.path.join(OUT, filename)
    bpy.ops.render.render(write_still=True)
    print('RENDERED', filename, flush=True)

# ---------------------------------------------- deployed pose (check only)
# Raise and run out the boom, level the drum and slew, then measure the head against the body
# so a clash shows up as a number, not just in the picture.
lift.rotation_euler.y = math.radians(BOOM_UP)
extn.location.x -= BOOM_EXT
tilt.rotation_euler.y = math.radians(TILT_LEVEL)
slew.rotation_euler.z = math.radians(-35)
bpy.context.view_layer.update()
lo, hi = extent()
print('DEPLOYED height %.3f' % hi.z, flush=True)
if not ONLY or 'smoke_deployed.png' in ONLY.split(','):
    c, rx, ry = cams['Fan deployed']
    s.camera = c
    s.render.resolution_x, s.render.resolution_y = rx, ry
    s.render.filepath = os.path.join(OUT, 'smoke_deployed.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED smoke_deployed.png', flush=True)
if not ONLY or 'smoke_boom.png' in ONLY.split(','):
    slew.rotation_euler.z = 0.0            # square on, so the boom's Z reads
    bpy.context.view_layer.update()
    c, rx, ry = cams['Boom detail']
    s.camera = c
    s.render.resolution_x, s.render.resolution_y = rx, ry
    s.render.filepath = os.path.join(OUT, 'smoke_boom.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED smoke_boom.png', flush=True)

print('BUILD OK', flush=True)

