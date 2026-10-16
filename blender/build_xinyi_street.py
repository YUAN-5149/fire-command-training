# -*- coding: utf-8 -*-
"""
Xinyi District street scene - Taipei City Fire Department HQ corner
(Songren Rd x Zhongxiao E Rd Sec. 5), built in stages.

Reference: Google Street View pano 4zIyhQYMorzdcPpXP0F9Cw (2025-01) and the
Google Maps plan view, used only as a layout / look reference.  Nothing is
traced or textured from the imagery; every dimension is an estimate read off
the 20 m scale bar, so treat it as "reads right at scene distance".

Stages (each one includes everything before it):
  1  road network - carriageways, sidewalks, curbs, medians, lane markings
  2  fire department HQ - granite podium, framed glass tower, entrance
     portal with pediment, apparatus bays on Zhongxiao, forecourt
  3  shophouses across Zhongxiao - arcaded brick-tile rows on both
     north blocks, dense signage, NE corner unit wrapping onto Songren,
     mid-rise office on the NW corner;
     one object per building
  4  street furniture - street trees and median palms, mast-arm signals
     with switchable lenses, side-arm and ring lamps, Zhongxiao median
     barrier, utility cabinets, yellow box grid in front of the bays
  5  backdrop and lighting - far ground, ring of generic blocks, the
     sign-banded mid-rise up Songren, Xinyi towers and a simplified
     Taipei 101; day sky and a night pass for the previews

Run:
  blender -b -P blender/build_xinyi_street.py -- --stage 4 --outdir blender

Build space: +X = east, +Y = north, +Z = up, metres, origin at the centre of
the Songren / Zhongxiao intersection.  The glTF exporter maps +Y to -Z, so
north is glTF forward.  Traffic drives on the right.

Window: X -60..90, Y -110..40 (150 m x 150 m).
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

STAGE = 1
if "--stage" in sys.argv:
    STAGE = int(sys.argv[sys.argv.index("--stage") + 1])

OUT_DIR = os.getcwd()
if "--outdir" in sys.argv:
    OUT_DIR = sys.argv[sys.argv.index("--outdir") + 1]

# ------------------------------------------------------------------- layout
X0, X1 = -60.0, 90.0          # window
Y0, Y1 = -110.0, 40.0

SR_HW   = 14.0                 # Songren Rd: half width of roadway
SR_MED  = 1.5                  #   half width of planted median
SR_WALK = 8.0                  #   sidewalk width
ZX_HW   = 15.0                 # Zhongxiao E Rd: half width of roadway
ZX_WALK = 6.0                  #   sidewalk width
AL_Y0, AL_Y1 = -64.0, -57.0    # Lane 236 Alley 2 (east side only)
XY_Y0, XY_Y1 = -107.0, -99.0   # Xingya Rd stub (west side only)

CURB_H  = 0.15                 # sidewalk / curb height
CURB_W  = 0.20                 # curb band width
CORNER_R = 8.0                 # corner radius at the main intersection
MINOR_R  = 3.0                 # corner radius at side streets

# Distances back from the intersection, along each approach
XW_IN, XW_OUT = 16.5, 20.5     # zebra crossing
MB_IN, MB_OUT = 21.0, 25.0     # motorcycle waiting box
STOP_AT = 25.5                 # car stop line (centre)
MED_NOSE = 26.5                # where the Songren median starts

MARK_Z = 0.006                 # markings float just above the asphalt
LINE_W = 0.15                  # lane line width
STOP_W = 0.40                  # stop line width

# Street View camera spot (pano 4zIyhQYMorzdcPpXP0F9Cw)
PANO = (15.0, -31.0, 2.45)

SCENE_ROOT = "Xinyi street"


# ------------------------------------------------------------------ helpers
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.length_unit = 'METERS'


def mat(name, base=(0.5, 0.5, 0.5, 1.0), metallic=0.0, rough=0.5,
        emis=None, emis_str=0.0):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next((nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED'), None)
    if b is None:
        # newer Blender builds no longer seed a default node tree
        b = nt.nodes.new('ShaderNodeBsdfPrincipled')
        out = next((nd for nd in nt.nodes if nd.type == 'OUTPUT_MATERIAL'), None) \
            or nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(b.outputs[0], out.inputs[0])
    b.inputs["Base Color"].default_value = base
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    if emis is not None:
        b.inputs["Emission Color"].default_value = emis
        b.inputs["Emission Strength"].default_value = emis_str
    return m


def build_materials():
    return {
        'asphalt':  mat("Asphalt", (0.040, 0.041, 0.044, 1), rough=0.92),
        'walk':     mat("Sidewalk paving", (0.30, 0.27, 0.24, 1), rough=0.85),
        'curb':     mat("Curb concrete", (0.42, 0.42, 0.40, 1), rough=0.80),
        'curb_red': mat("Curb red paint", (0.42, 0.035, 0.030, 1), rough=0.65),
        'median':   mat("Median planting soil", (0.075, 0.110, 0.040, 1), rough=0.95),
        'lot':      mat("Forecourt paving", (0.36, 0.33, 0.30, 1), rough=0.80),
        'lawn':     mat("Park lawn", (0.070, 0.150, 0.040, 1), rough=0.95),
        'plot':     mat("Building plot", (0.22, 0.22, 0.22, 1), rough=0.90),
        'white':    mat("Road marking white", (0.80, 0.80, 0.78, 1), rough=0.60),
        'yellow':   mat("Road marking yellow", (0.85, 0.58, 0.04, 1), rough=0.60),
    }


def new_obj(name, verts, faces, materials, face_mats=None, parent=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    for m in materials:
        me.materials.append(m)
    if face_mats:
        for i, mi in enumerate(face_mats):
            me.polygons[i].material_index = mi
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if parent:
        ob.parent = parent
    return ob


def group(name, parent=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = 'PLAIN_AXES'
    bpy.context.collection.objects.link(ob)
    if parent:
        ob.parent = parent
    return ob


def rr_points(x0, y0, x1, y1, r_bl=0.0, r_br=0.0, r_tr=0.0, r_tl=0.0, seg=10):
    """Counter-clockwise outline of a rectangle with per-corner radii.
    A square corner emits one point, a rounded one seg+1.  Radii in this file
    are either 0 or >= 1.5 m, so an inset copy (radius - CURB_W) has the same
    point count and lines up vertex for vertex with the outline."""
    pts = []
    for (cx, cy, r, a0) in ((x0 + r_bl, y0 + r_bl, r_bl, 180),
                            (x1 - r_br, y0 + r_br, r_br, 270),
                            (x1 - r_tr, y1 - r_tr, r_tr, 0),
                            (x0 + r_tl, y1 - r_tl, r_tl, 90)):
        if r <= 1e-6:
            pts.append((cx, cy))
            continue
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


class MarkBuf:
    """All flat road paint for one material goes into a single mesh."""

    def __init__(self, name, material):
        self.name, self.material = name, material
        self.verts, self.faces = [], []

    def poly(self, pts, z=MARK_Z):
        i = len(self.verts)
        self.verts += [(x, y, z) for x, y in pts]
        self.faces.append(tuple(range(i, i + len(pts))))

    def rect(self, x0, y0, x1, y1):
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = min(y0, y1), max(y0, y1)
        self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])

    def line_y(self, x, ya, yb, w=LINE_W):
        self.rect(x - w / 2, ya, x + w / 2, yb)

    def line_x(self, y, xa, xb, w=LINE_W):
        self.rect(xa, y - w / 2, xb, y + w / 2)

    def dashed_y(self, x, ya, yb, dash=4.0, gap=6.0):
        lo, hi = min(ya, yb), max(ya, yb)
        t = lo
        while t < hi:
            self.line_y(x, t, min(t + dash, hi))
            t += dash + gap

    def dashed_x(self, y, xa, xb, dash=4.0, gap=6.0):
        lo, hi = min(xa, xb), max(xa, xb)
        t = lo
        while t < hi:
            self.line_x(y, t, min(t + dash, hi))
            t += dash + gap

    def emit(self, parent):
        if self.faces:
            return new_obj(self.name, self.verts, self.faces, [self.material],
                           parent=parent)


def place2d(pts, origin, heading):
    """Rotate local 2D points (local +Y = travel direction) to world."""
    c, s = math.cos(heading), math.sin(heading)
    ox, oy = origin
    return [(ox + x * c - y * s, oy + x * s + y * c) for x, y in pts]


# Arrow outlines in local space, +Y = direction of travel, base at y = 0.
ARROW_STRAIGHT = [(-0.15, 0.0), (0.15, 0.0), (0.15, 3.5), (0.50, 3.5),
                  (0.0, 5.0), (-0.50, 3.5), (-0.15, 3.5)]
ARROW_LEFT = [(-0.15, 0.0), (0.15, 0.0), (0.15, 3.2), (-0.90, 3.2),
              (-0.90, 3.65), (-2.0, 3.05), (-0.90, 2.45), (-0.90, 2.90),
              (-0.15, 2.90)]
ARROW_RIGHT = [(-x, y) for x, y in reversed(ARROW_LEFT)]


# ------------------------------------------------------------ stage 1: roads
def build_roads(M, root):
    g = group("S1 Road network", root)

    # one asphalt sheet under the whole window; the sidewalks sit on top
    new_obj("Road surface",
            [(X0, Y0, 0), (X1, Y0, 0), (X1, Y1, 0), (X0, Y1, 0)],
            [(0, 1, 2, 3)], [M['asphalt']], parent=g)

    # ---- city blocks: raised slabs with a curb band around the edge.
    # (name, rect, corner radii bl/br/tr/tl, lot rect, lot material)
    e, w = SR_HW, -SR_HW
    n, s = ZX_HW, -ZX_HW
    R, r = CORNER_R, MINOR_R
    blocks = [
        ("NE", (e, n, X1, Y1), (R, 0, 0, 0),
         (e + SR_WALK, n + ZX_WALK, X1, Y1), 'plot'),
        ("NW", (X0, n, w, Y1), (0, R, 0, 0),
         (X0, n + ZX_WALK, w - SR_WALK, Y1), 'plot'),
        ("SE fire HQ", (e, AL_Y1, X1, s), (r, 0, 0, R),
         (e + SR_WALK, AL_Y1 + 2.5, X1, s - ZX_WALK), 'lot'),
        ("SE south", (e, Y0, X1, AL_Y0), (0, 0, 0, r),
         (e + SR_WALK, Y0, X1, AL_Y0 - 2.5), 'plot'),
        ("SW park", (X0, XY_Y1, w, s), (0, r, R, 0),
         (X0, XY_Y1 + 2.5, w - SR_WALK, s - ZX_WALK), 'lawn'),
        ("SW south", (X0, Y0, w, XY_Y0), (0, 0, r, 0),
         (X0, Y0, w - SR_WALK, XY_Y0 - 2.5), 'plot'),
    ]

    def red_curb(p, q):
        # painted red (no stopping) along both HQ frontages
        mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
        return ((abs(mx - e) < 0.3 and AL_Y1 + r < my < s - R) or
                (abs(my - s) < 0.3 and e + R < mx < X1 - 1.0))

    for name, (bx0, by0, bx1, by1), (rbl, rbr, rtr, rtl), lot, lot_m in blocks:
        outer = rr_points(bx0, by0, bx1, by1, rbl, rbr, rtr, rtl)
        inner = rr_points(bx0 + CURB_W, by0 + CURB_W, bx1 - CURB_W, by1 - CURB_W,
                          max(rbl - CURB_W, 0), max(rbr - CURB_W, 0),
                          max(rtr - CURB_W, 0), max(rtl - CURB_W, 0))
        k = len(outer)

        # slab: top n-gon plus outward-facing sides
        verts = [(x, y, 0.0) for x, y in outer] + [(x, y, CURB_H) for x, y in outer]
        faces = [tuple(range(k, 2 * k))]
        fm = [0]
        for i in range(k):
            j = (i + 1) % k
            if outer[i] == outer[j]:
                continue
            faces.append((i, j, k + j, k + i))
            fm.append(2 if red_curb(outer[i], outer[j]) else 1)
        new_obj(f"Sidewalk {name}", verts, faces,
                [M['walk'], M['curb'], M['curb_red']], fm, parent=g)

        # curb band on top of the slab edge
        zc = CURB_H + 0.010
        verts = [(x, y, zc) for x, y in outer] + [(x, y, zc) for x, y in inner]
        faces, fm = [], []
        for i in range(k):
            j = (i + 1) % k
            if outer[i] == outer[j]:
                continue
            faces.append((i, j, k + j, k + i))
            fm.append(1 if red_curb(outer[i], outer[j]) else 0)
        new_obj(f"Curb {name}", verts, faces, [M['curb'], M['curb_red']], fm,
                parent=g)

        # the plot inside the sidewalk ring
        lx0, ly0, lx1, ly1 = lot
        zl = CURB_H + 0.020
        new_obj(f"Plot {name}",
                [(lx0, ly0, zl), (lx1, ly0, zl), (lx1, ly1, zl), (lx0, ly1, zl)],
                [(0, 1, 2, 3)], [M[lot_m]], parent=g)

    # ---- Songren planted median, broken at the intersection and the alley
    MH = 0.20
    for name, ya, yb in (("north", MED_NOSE, Y1),
                         ("south", AL_Y1 + 2.0, -MED_NOSE),
                         ("far south", Y0, AL_Y0 - 2.0)):
        pts = rr_points(-SR_MED, ya, SR_MED, yb,
                        SR_MED if ya > Y0 else 0, SR_MED if ya > Y0 else 0,
                        SR_MED if yb < Y1 else 0, SR_MED if yb < Y1 else 0, seg=6)
        k = len(pts)
        verts = [(x, y, 0.0) for x, y in pts] + [(x, y, MH) for x, y in pts]
        faces = [tuple(range(k, 2 * k))]
        fm = [0]
        for i in range(k):
            j = (i + 1) % k
            if pts[i] != pts[j]:
                faces.append((i, j, k + j, k + i))
                fm.append(1)
        new_obj(f"Median Songren {name}", verts, faces,
                [M['median'], M['curb']], fm, parent=g)

    build_markings(M, g)
    return g


def build_markings(M, g):
    W = MarkBuf("Road markings white", M['white'])
    Y = MarkBuf("Road markings yellow", M['yellow'])

    # ---------------- Songren Rd: 3 lanes + scooter lane each way
    lane = 3.3
    for sgn in (1, -1):                    # +1 = east carriageway (northbound)
        inner = sgn * (SR_MED + 0.20)
        divs = [sgn * (SR_MED + lane * i) for i in (1, 2)]
        scoot = sgn * (SR_MED + lane * 3)
        # (from, to) runs along Songren on each side of the intersection
        for ya, yb in ((STOP_AT, Y1), (-STOP_AT, Y0)):
            # east carriageway is cut by the alley
            runs = [(ya, yb)]
            if sgn > 0 and yb == Y0:
                runs = [(ya, AL_Y1), (AL_Y0, yb)]
            for ra, rb in runs:
                Y.line_y(inner, ra, rb)
                W.line_y(scoot, ra, rb)
                # solid for the last 30 m of an approach, dashed beyond
                d = 1 if rb > ra else -1
                near = ra + d * min(30, abs(rb - ra)) if abs(ra) == STOP_AT else ra
                for x in divs:
                    if abs(ra) == STOP_AT:
                        W.line_y(x, ra, near)
                        W.dashed_y(x, near, rb)
                    else:
                        W.dashed_y(x, ra, rb)

    # ---------------- Zhongxiao E Rd: double yellow, 3 lanes + scooter lane
    lane = 3.4
    for xa, xb in ((STOP_AT, X1), (-STOP_AT, X0)):
        for yc in (0.45, -0.45):        # either side of the median barrier
            Y.line_x(yc, xa, xb, 0.12)
        for sgn in (1, -1):
            for i in (1, 2):
                yl = sgn * lane * i
                d = 1 if xb > xa else -1
                near = xa + d * min(30, abs(xb - xa))
                W.line_x(yl, xa, near)
                W.dashed_x(yl, near, xb)
            W.line_x(sgn * lane * 3.65, xa, xb)

    # ---------------- approaches: stop line, scooter box, arrows
    # (heading of travel, stop-line span across the road, along-axis sign)
    # Northbound Songren (east carriageway), approaching from the south
    approaches = [
        ("NB Songren", 'y', -1, (SR_MED, SR_HW), 0.0),
        ("SB Songren", 'y', +1, (-SR_HW, -SR_MED), math.pi),
        ("EB Zhongxiao", 'x', -1, (-ZX_HW, 0.0), -math.pi / 2),
        ("WB Zhongxiao", 'x', +1, (0.0, ZX_HW), math.pi / 2),
    ]
    for name, axis, side, (c0, c1), heading in approaches:
        at = side * STOP_AT
        b_in, b_out = side * MB_IN, side * MB_OUT
        if axis == 'y':
            W.line_x(at, c0, c1, STOP_W)
            # scooter waiting box outline
            W.line_x(b_in, c0, c1, 0.15)
            W.line_y(c0 + 0.1, b_in, b_out)
            W.line_y(c1 - 0.1, b_in, b_out)
        else:
            W.line_y(at, c0, c1, STOP_W)
            W.line_y(b_in, c0, c1, 0.15)
            W.line_x(c0 + 0.1, b_in, b_out)
            W.line_x(c1 - 0.1, b_in, b_out)

        # lane arrows 8 m behind the stop line: left, straight, straight
        # lane centres ordered from the median outwards
        if axis == 'y':
            med = SR_MED if heading == 0.0 else -SR_MED
            step = 3.3 if heading == 0.0 else -3.3
        else:
            med = 0.0
            step = 3.4 if heading == math.pi / 2 else -3.4
        shapes = (ARROW_LEFT, ARROW_STRAIGHT, ARROW_STRAIGHT)
        back = side * (STOP_AT + 13.0)
        for i, shape in enumerate(shapes):
            cross = med + step * (i + 0.5)
            org = (cross, back) if axis == 'y' else (back, cross)
            W.poly(place2d(shape, org, heading))

    # ---------------- zebra crossings
    def zebra_across_y(ya, yb, x0, x1):     # crossing a N-S road
        x = x0 + 0.3
        while x + 0.4 <= x1 - 0.3:
            W.rect(x, ya, x + 0.4, yb)
            x += 0.9

    def zebra_across_x(xa, xb, y0, y1):     # crossing an E-W road
        y = y0 + 0.3
        while y + 0.4 <= y1 - 0.3:
            W.rect(xa, y, xb, y + 0.4)
            y += 0.9

    for sgn in (1, -1):
        zebra_across_y(sgn * XW_IN, sgn * XW_OUT, -SR_HW, SR_HW)
        zebra_across_x(sgn * XW_IN, sgn * XW_OUT, -ZX_HW, ZX_HW)
    # sidewalk crossing over the alley mouth and the Xingya stub
    zebra_across_x(SR_HW + 2.0, SR_HW + 6.0, AL_Y0, AL_Y1)
    zebra_across_x(-SR_HW - 6.0, -SR_HW - 2.0, XY_Y0, XY_Y1)

    W.emit(g)
    Y.emit(g)


# --------------------------------------------------------- stage 2: fire HQ
# Massing from the satellite view; facade from the two Street View panos
# (Songren side 4zIyhQYMorzdcPpXP0F9Cw, Zhongxiao side 1KP1sE0eaTdTXJhZTZWxuQ).
#   - podium: three storeys of dark maroon granite, small punched windows
#     upstairs, big glazing at street level
#   - tower: the same granite, with continuous full-height blue glass strips
#     between plain pilasters and a solid crown band on top
#   - two identical entrances (Songren and Zhongxiao): a projecting canopy on
#     two granite piers, gilt lettering on its front, small green glass
#     pediment on top
#   - the Xinyi squad's three open apparatus bays at the east end of the
#     Zhongxiao frontage, behind a raised forecourt with white-tiled planters
HQ_X0, HQ_X1 = 30.0, 72.0          # podium, west face on Songren side
HQ_Y0, HQ_Y1 = -51.0, -27.0        #   north face on Zhongxiao side
HQ_Z0 = CURB_H + 0.02              # plot level
POD_FLOORS = (4.6, 4.1, 4.1)       # podium storey heights
TOWER_FLOORS = 11
TOWER_FH = 3.6
TOWER_SET = 1.5                    # tower setback from the podium face
CROWN_H = 3.4                      # solid band above the last glass floor
ENTRY_Y = -39.0                    # Songren entrance centre line
ENTRY_X = 46.0                     # Zhongxiao entrance centre line
BAYS_X = (56.0, 61.6, 67.2)        # apparatus bay centres, Zhongxiao face
BAY_W = 4.4                        # clear opening width
BAY_HOUSING = 0.5                  # shutter drum box under the 2F slab
GARAGE_D = 10.0                    # bay depth
TERRACE_H = 0.45                   # raised forecourt on Zhongxiao
HQ_NAME = "臺北市政府消防局"
HQ_NAME_EN = "TAIPEI CITY FIRE DEPARTMENT"
SQUAD_NAME = "第二救災救護大隊信義分隊"

# west-facing decal basis: reads left-to-right for someone looking east
FACE_W = Matrix(((0, 0, -1), (-1, 0, 0), (0, 1, 0)))
# north-facing: reads left-to-right for someone looking south
FACE_N = Matrix(((-1, 0, 0), (0, 0, 1), (0, 1, 0)))
FLAT = Matrix(((1, 0, 0), (0, 1, 0), (0, 0, 1)))


class BoxBuf:
    """Axis-aligned boxes for one material, merged into a single mesh."""

    def __init__(self, name, material):
        self.name, self.material = name, material
        self.verts, self.faces = [], []

    def box(self, x0, y0, z0, x1, y1, z1):
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = min(y0, y1), max(y0, y1)
        z0, z1 = min(z0, z1), max(z0, z1)
        i = len(self.verts)
        self.verts += [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                       (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        self.faces += [(i, i + 3, i + 2, i + 1), (i + 4, i + 5, i + 6, i + 7),
                       (i, i + 1, i + 5, i + 4), (i + 1, i + 2, i + 6, i + 5),
                       (i + 2, i + 3, i + 7, i + 6), (i + 3, i, i + 4, i + 7)]

    def raw(self, verts, faces):
        i = len(self.verts)
        self.verts += verts
        self.faces += [tuple(i + k for k in f) for f in faces]

    def emit(self, parent):
        if self.faces:
            return new_obj(self.name, self.verts, self.faces, [self.material],
                           parent=parent)


class Facade:
    """Maps facade-local (u, n, z) to world.  u runs left-to-right for a
    viewer standing outside, n is the outward normal, z is height."""

    def __init__(self, side, centre):
        self.side, self.c = side, centre
        self.basis = {'W': FACE_W, 'N': FACE_N}[side]

    def p(self, u, n, z):
        if self.side == 'W':          # plane x = HQ_X0, outward -X, right = -Y
            return (HQ_X0 - n, self.c - u, z)
        return (self.c - u, HQ_Y1 + n, z)   # plane y = HQ_Y1, outward +Y, right = -X

    def box(self, buf, u0, n0, z0, u1, n1, z1):
        a, b = self.p(u0, n0, z0), self.p(u1, n1, z1)
        buf.box(a[0], a[1], a[2], b[0], b[1], b[2])


def load_font():
    for f in ("msjhbd.ttc", "msjh.ttc", "kaiu.ttf", "mingliu.ttc"):
        p = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", f)
        if os.path.exists(p):
            try:
                return bpy.data.fonts.load(p)
            except Exception as e:
                print("FONT failed", f, e)
    return None


def make_text(name, body, font, size, loc, basis, material, extrude=0.02,
              spacing=1.0, parent=None):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    if font:
        cu.font = font
    cu.size = size
    cu.extrude = extrude
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.space_character = spacing
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material)
    ob.matrix_world = Matrix.Translation(loc) @ basis.to_4x4()
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob.select_set(False)
    if parent:
        mw = ob.matrix_world.copy()
        ob.parent = parent
        ob.matrix_world = mw
    return ob


def hq_materials(M):
    M.update({
        'granite':  mat("Granite maroon polished", (0.17, 0.060, 0.045, 1), rough=0.30),
        'granite_t': mat("Granite rose brown", (0.26, 0.13, 0.10, 1), rough=0.35),
        'curtain':  mat("Curtain wall glass blue", (0.060, 0.150, 0.300, 1),
                        metallic=0.55, rough=0.06),
        'win':      mat("Window glass dark", (0.020, 0.026, 0.032, 1),
                        metallic=0.35, rough=0.10),
        'alu':      mat("Aluminium frame", (0.55, 0.56, 0.58, 1), metallic=0.9, rough=0.35),
        'copper':   mat("Pediment glass green", (0.18, 0.42, 0.36, 1),
                        metallic=0.4, rough=0.15),
        'gold':     mat("Lettering gilt", (0.80, 0.58, 0.20, 1), metallic=1.0, rough=0.30),
        'bay_red':  mat("Fire engine red", (0.55, 0.020, 0.015, 1), rough=0.40),
        'shutter':  mat("Roller shutter steel", (0.42, 0.43, 0.45, 1),
                        metallic=0.7, rough=0.45),
        'garage':   mat("Apparatus bay interior", (0.045, 0.045, 0.048, 1), rough=0.80),
        'sign':     mat("Sign panel bronze", (0.10, 0.075, 0.045, 1),
                        metallic=0.6, rough=0.40),
        'tile':     mat("Planter tile white", (0.74, 0.74, 0.71, 1), rough=0.40),
        'apron':    mat("Driveway concrete", (0.46, 0.45, 0.42, 1), rough=0.85),
        'shrub':    mat("Shrub foliage", (0.035, 0.090, 0.025, 1), rough=0.90),
        'roof':     mat("Roof membrane", (0.30, 0.30, 0.31, 1), rough=0.90),
    })


def build_portal(F, B, M, font, g, label, sign=None, steps=True):
    """Canopy entrance on two granite piers.  F is a Facade centred on the
    doorway.  Returns nothing; geometry goes into the shared buffers B."""
    z = HQ_Z0
    land = z + TERRACE_H
    hw, dep = 5.5, 3.5               # canopy half width and projection
    c0, c1 = z + 4.4, z + 6.4        # canopy fascia band
    # piers at the canopy's front corners
    for u0, u1 in ((-hw, -hw + 1.2), (hw - 1.2, hw)):
        F.box(B['granite'], u0, dep - 1.2, z, u1, dep, c0)
    F.box(B['granite'], -hw, 0, c0, hw, dep, c1)                       # canopy
    F.box(B['granite'], -hw - 0.15, -0.0, c1, hw + 0.15, dep + 0.15, c1 + 0.2)
    F.box(B['alu'], -hw + 1.2, 0.2, c0 - 0.08, hw - 1.2, dep - 0.2, c0)  # soffit
    # pediment: shallow glazed gable sitting back on the canopy roof
    ph, pw = 1.9, 3.8
    zb = c1 + 0.2
    tri = [(-pw, zb), (pw, zb), (0.0, zb + ph)]
    verts = []
    for n in (0.6, dep - 0.4):
        verts += [F.p(u, n, zz) for u, zz in tri]
    faces = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    B['copper'].raw(verts, faces)
    # glazing bars over the gable face
    for u in (-pw * 0.5, 0.0, pw * 0.5):
        top = zb + ph * (1 - abs(u) / pw)
        F.box(B['alu'], u - 0.05, dep - 0.42, zb, u + 0.05, dep - 0.34, top)
    F.box(B['alu'], -pw, dep - 0.42, zb, pw, dep - 0.34, zb + 0.10)
    # doors: a glazed screen with a mullion grid, set in the wall plane
    F.box(B['win'], -4.2, 0.02, land, 4.2, 0.10, c0 - 1.1)
    for k in range(9):
        u = -4.2 + k * 8.4 / 8
        F.box(B['alu'], u - 0.04, 0.10, land, u + 0.04, 0.16, c0 - 1.1)
    for zz in (land + 2.4, c0 - 1.15):
        F.box(B['alu'], -4.2, 0.10, zz, 4.2, 0.16, zz + 0.08)
    if sign:
        F.box(B['sign'], -4.2, 0.02, c0 - 1.05, 4.2, 0.14, c0 - 0.15)
        make_text(f"{label} sign", sign, font, 0.42, F.p(0, 0.17, c0 - 0.6),
                  F.basis, M['gold'], extrude=0.01, parent=g)
    # landing under the canopy, steps down to the forecourt
    F.box(B['granite'], -hw, 0, z, hw, dep, land)
    if steps:
        for k in range(3):
            F.box(B['granite'], -hw + 1.0, dep, z, hw - 1.0,
                  dep + 0.35 * (3 - k), z + 0.15 * (k + 1))
    make_text(f"{label} name plate", HQ_NAME, font, 1.15,
              F.p(0, dep + 0.03, (c0 + c1) / 2), F.basis, M['gold'],
              extrude=0.04, spacing=1.12, parent=g)


def build_hq(M, root):
    hq_materials(M)
    font = load_font()
    g = group("S2 Fire HQ", root)
    B = {k: BoxBuf(n, M[k]) for k, n in (
        ('granite', "HQ podium granite"), ('granite_t', "HQ tower granite"),
        ('curtain', "HQ tower curtain wall"), ('win', "HQ windows"),
        ('alu', "HQ mullions"), ('copper', "HQ entrance pediments"),
        ('roof', "HQ roof"), ('apron', "HQ driveway apron"),
        ('shrub', "HQ forecourt shrubs"), ('tile', "HQ planters"),
        ('garage', "HQ apparatus bay interior"), ('sign', "HQ sign panels"))}
    gr, gt, win, alu = B['granite'], B['granite_t'], B['win'], B['alu']

    z = HQ_Z0
    g1 = z + POD_FLOORS[0]
    pod_top = z + sum(POD_FLOORS)

    # ---------------------------------------------------------------- podium
    # Ground storey: solid except for the apparatus bays, which are cut back
    # GARAGE_D into the block with full-depth piers between them.
    piers = []
    edges = [BAYS_X[0] - BAY_W / 2 - 1.2]
    for bx in BAYS_X:
        piers.append((edges[-1], bx - BAY_W / 2))
        edges.append(bx + BAY_W / 2)
    piers.append((edges[-1], HQ_X1))
    gx0 = piers[0][0]
    gr.box(HQ_X0, HQ_Y0, z, gx0, HQ_Y1, g1)
    gr.box(gx0, HQ_Y0, z, HQ_X1, HQ_Y1 - GARAGE_D, g1)
    for a, b in piers:
        gr.box(a, HQ_Y1 - GARAGE_D, z, b, HQ_Y1, g1)
    gr.box(HQ_X0, HQ_Y0, g1, HQ_X1, HQ_Y1, pod_top)
    # plinth and cornice
    gr.box(HQ_X0 - 0.12, HQ_Y0 - 0.12, z, gx0, HQ_Y1 + 0.12, z + 0.5)
    gr.box(HQ_X0 - 0.35, HQ_Y0 - 0.35, pod_top - 0.5, HQ_X1 + 0.35, HQ_Y1 + 0.35, pod_top)
    gr.box(HQ_X0 - 0.20, HQ_Y0 - 0.20, g1 - 0.05, HQ_X1 + 0.20, HQ_Y1 + 0.20, g1 + 0.30)

    # apparatus bays: dark interior, shutter housing, raised shutters
    for n, bx in enumerate(BAYS_X, 1):
        x0, x1 = bx - BAY_W / 2, bx + BAY_W / 2
        B['garage'].box(x0, HQ_Y1 - GARAGE_D, z, x1, HQ_Y1 - GARAGE_D + 0.05, g1)
        B['garage'].box(x0, HQ_Y1 - GARAGE_D, g1 - 0.06, x1, HQ_Y1, g1)
        for xa in (x0, x1 - 0.05):            # line the bay side walls dark
            B['garage'].box(xa, HQ_Y1 - GARAGE_D, z, xa + 0.05, HQ_Y1 - 0.3, g1)
        B['apron'].box(x0, HQ_Y1 - GARAGE_D, z, x1, HQ_Y1, z + 0.02)
        hs = BoxBuf(f"Apparatus bay shutter housing {n}", M['shutter'])
        hs.box(x0, HQ_Y1 - 0.65, g1 - BAY_HOUSING, x1, HQ_Y1 - 0.05, g1)
        hs.emit(g)
        # The shutter is modelled OPEN: rolled up, parked inside the 2F slab
        # where it cannot be seen.  Translate it -4.6 m in Z to close it.
        sh = BoxBuf(f"Apparatus bay shutter {n}", M['shutter'])
        sh.box(x0, HQ_Y1 - 0.40, g1 + 0.0, x1, HQ_Y1 - 0.35, g1 + POD_FLOORS[0] - BAY_HOUSING)
        sh.emit(g)
        fr = BoxBuf(f"Apparatus bay frame {n}", M['bay_red'])
        fr.box(x0 - 0.12, HQ_Y1, z, x0, HQ_Y1 + 0.10, g1 - BAY_HOUSING)
        fr.box(x1, HQ_Y1, z, x1 + 0.12, HQ_Y1 + 0.10, g1 - BAY_HOUSING)
        fr.box(x0 - 0.12, HQ_Y1, g1 - BAY_HOUSING - 0.12, x1 + 0.12, HQ_Y1 + 0.10,
               g1 - BAY_HOUSING)
        fr.emit(g)
        make_text(f"Apparatus bay number {n}", str(n), font, 0.50,
                  (bx, HQ_Y1 + 0.22, g1 + 0.12), FACE_N, M['white'],
                  extrude=0.01, parent=g)

    # punched windows upstairs: (sill, head, width) for 2F and 3F
    upper = ((z + 6.2, z + 8.0, 1.3), (z + 10.3, z + 11.7, 1.3))
    pitch = 2.6

    def punched(F, length, skip2=None):
        k = int(length // pitch)
        off = (length - (k - 1) * pitch) / 2
        for i in range(k):
            u = -length / 2 + off + i * pitch
            for row, (s, h, w) in enumerate(upper):
                if row == 0 and skip2 and skip2[0] <= u <= skip2[1]:
                    continue
                F.box(win, u - w / 2, -0.05, s, u + w / 2, 0.05, h)
                F.box(gr, u - w / 2 - 0.1, 0.0, s - 0.18, u + w / 2 + 0.1, 0.12, s)
            # little granite studs between the rows, as on the real building
            if i < k - 1:
                F.box(gr, u + pitch / 2 - 0.18, 0, z + 9.0,
                      u + pitch / 2 + 0.18, 0.25, z + 9.36)

    def glazing(F, u0, u1, z0, z1, step=1.5):
        F.box(win, u0, -0.05, z0, u1, 0.06, z1)
        k = max(1, round((u1 - u0) / step))
        for i in range(k + 1):
            u = u0 + i * (u1 - u0) / k
            F.box(alu, u - 0.04, 0.06, z0, u + 0.04, 0.12, z1)
        for zz in (z0, z0 + 2.6, z1 - 0.08):
            F.box(alu, u0, 0.06, zz, u1, 0.12, zz + 0.08)

    wW = Facade('W', (HQ_Y0 + HQ_Y1) / 2)
    wN = Facade('N', (HQ_X0 + HQ_X1) / 2)
    lenY, lenX = HQ_Y1 - HQ_Y0, HQ_X1 - HQ_X0

    # west face (Songren): punched windows, entrance, glazing either side
    eu = (HQ_Y0 + HQ_Y1) / 2 - ENTRY_Y       # entrance offset in u
    punched(wW, lenY, (eu - 4.5, eu + 4.5))
    glazing(wW, -lenY / 2 + 1.0, eu - 6.0, z + 0.8, z + 3.9)
    glazing(wW, eu + 6.0, lenY / 2 - 1.0, z + 0.8, z + 3.9)
    # north face (Zhongxiao): punched windows, glazing west of the entrance
    nu = (HQ_X0 + HQ_X1) / 2 - ENTRY_X
    punched(wN, lenX, (nu - 4.5, nu + 4.5))
    glazing(wN, nu + 6.0, lenX / 2 - 1.0, z + TERRACE_H + 0.3, z + 3.9)
    # east and south faces: punched rows only, via direct world placement
    for i in range(int(lenY // pitch)):
        y = HQ_Y0 + 1.3 + i * pitch
        for s, h, w in upper:
            win.box(HQ_X1 - 0.05, y - w / 2, s, HQ_X1 + 0.05, y + w / 2, h)
    for i in range(int(lenX // pitch)):
        x = HQ_X0 + 1.3 + i * pitch
        for s, h, w in ((z + 1.2, z + 3.4, 1.3),) + upper:
            win.box(x - w / 2, HQ_Y0 - 0.05, s, x + w / 2, HQ_Y0 + 0.05, h)

    build_portal(Facade('W', ENTRY_Y), B, M, font, g, "HQ Songren entrance")
    build_portal(Facade('N', ENTRY_X), B, M, font, g, "HQ Zhongxiao entrance",
                 sign=SQUAD_NAME, steps=False)

    # ----------------------------------------------------------------- tower
    tx0, tx1 = HQ_X0 + TOWER_SET, HQ_X1 - TOWER_SET
    ty0, ty1 = HQ_Y0 + TOWER_SET, HQ_Y1 - TOWER_SET
    tz0 = pod_top
    tg = tz0 + TOWER_FLOORS * TOWER_FH        # top of the glass
    tz1 = tg + CROWN_H
    inset = 0.40
    B['curtain'].box(tx0 + inset, ty0 + inset, tz0, tx1 - inset, ty1 - inset, tg)
    gt.box(tx0, ty0, tg, tx1, ty1, tz1)                   # crown band
    gt.box(tx0 - 0.3, ty0 - 0.3, tz1 - 0.5, tx1 + 0.3, ty1 + 0.3, tz1)
    gt.box(tx0 - 0.15, ty0 - 0.15, tz0, tx1 + 0.15, ty1 + 0.15, tz0 + 1.2)  # base band

    def pilasters(a0, a1, n_strips, put, centre_w=None):
        """Lay pilasters along a face from a0 to a1, leaving n_strips glass
        strips.  Corners get 2.0 m piers; centre_w widens the middle one."""
        corner, pw = 2.0, 1.3
        n_p = n_strips - 1
        widths = [pw] * n_p
        if centre_w and n_p % 2 == 1:
            widths[n_p // 2] = centre_w
        s = (a1 - a0 - 2 * corner - sum(widths)) / n_strips
        put(a0, a0 + corner)
        a = a0 + corner + s
        for w in widths:
            put(a, a + w)
            a += w + s
        put(a1 - corner, a1)
        return s

    pr = 0.30                                 # proud of the frame line
    pilasters(tx0, tx1, 8, lambda a, b: gt.box(a, ty1 - inset, tz0, b, ty1 + pr, tg))
    pilasters(tx0, tx1, 8, lambda a, b: gt.box(a, ty0 - pr, tz0, b, ty0 + inset, tg))
    pilasters(ty0, ty1, 4, lambda a, b: gt.box(tx0 - pr, a, tz0, tx0 + inset, b, tg),
              centre_w=3.6)
    pilasters(ty0, ty1, 4, lambda a, b: gt.box(tx1 - inset, a, tz0, tx1 + pr, b, tg),
              centre_w=3.6)
    # a thin transom at every floor line, across the glass
    for f in range(1, TOWER_FLOORS):
        zf = tz0 + f * TOWER_FH
        alu.box(tx0 + inset - 0.06, ty0 + inset - 0.06, zf, tx1 - inset + 0.06,
                ty0 + inset, zf + 0.10)
        alu.box(tx0 + inset - 0.06, ty1 - inset, zf, tx1 - inset + 0.06,
                ty1 - inset + 0.06, zf + 0.10)
        alu.box(tx0 + inset - 0.06, ty0 + inset, zf, tx0 + inset, ty1 - inset, zf + 0.10)
        alu.box(tx1 - inset, ty0 + inset, zf, tx1 - inset + 0.06, ty1 - inset, zf + 0.10)
    # crown: a row of small windows
    for i in range(int((tx1 - tx0 - 4) // 2.4)):
        x = tx0 + 2.6 + i * 2.4
        for y0_, y1_ in ((ty1 - 0.02, ty1 + 0.05), (ty0 - 0.05, ty0 + 0.02)):
            win.box(x - 0.6, y0_, tg + 1.0, x + 0.6, y1_, tg + 2.3)

    # roof: membrane, plant room, comms mast
    B['roof'].box(tx0 + 0.3, ty0 + 0.3, tz1 - 0.6, tx1 - 0.3, ty1 - 0.3, tz1 - 0.45)
    gt.box(44.0, -44.0, tz1, 58.0, -34.0, tz1 + 4.2)
    gt.box(43.6, -44.4, tz1 + 4.2, 58.4, -33.6, tz1 + 4.6)
    alu.box(50.85, -39.15, tz1 + 4.6, 51.15, -38.85, tz1 + 16.0)
    for zz in (tz1 + 8.0, tz1 + 12.0):
        alu.box(50.0, -39.6, zz, 52.0, -38.4, zz + 0.12)

    # emblem on the widened centre pilaster of the Songren face, English
    # name on the base band below it
    ex = tx0 - pr - 0.02
    ez = tz0 + 3.6 * TOWER_FH
    for nm, rad, dz, mt in (("HQ emblem", 1.35, 0.08, 'gold'),
                            ("HQ emblem field", 1.05, 0.10, 'bay_red')):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=rad, depth=dz * 2,
                                            location=(ex - dz, ENTRY_Y, ez),
                                            rotation=(0, math.radians(90), 0))
        ob = bpy.context.object
        ob.name = nm
        ob.data.materials.append(M[mt])
        ob.parent = g
    make_text("HQ name plate EN", HQ_NAME_EN, font, 0.62,
              (tx0 - 0.17, (ty0 + ty1) / 2, tz0 + 0.6), FACE_W, M['gold'],
              extrude=0.02, spacing=1.08, parent=g)

    # --------------------------------------- Zhongxiao forecourt and apron
    walk = -ZX_HW - ZX_WALK                   # back of the sidewalk
    tx_end = piers[0][0]                      # terrace stops at the bays
    tile, shrub = B['tile'], B['shrub']
    gr.box(HQ_X0 - 0.5, HQ_Y1, z, tx_end, walk - 2.3, z + TERRACE_H)
    for k in range(3):                        # steps along the full frontage
        gr.box(HQ_X0 - 0.5, walk - 2.3, z, tx_end,
               walk - 2.3 + 0.35 * (3 - k), z + 0.15 * (k + 1))
    # white-tiled planters on the steps, gaps for the walk-ups
    for xa, xb in ((HQ_X0 - 0.3, ENTRY_X - 9.0), (ENTRY_X - 7.0, ENTRY_X - 2.4),
                   (ENTRY_X + 2.4, ENTRY_X + 7.0), (ENTRY_X + 9.0, tx_end - 0.4)):
        tile.box(xa, walk - 1.25, z, xb, walk - 0.05, z + 0.95)
        shrub.box(xa + 0.12, walk - 1.13, z + 0.95, xb - 0.12, walk - 0.17, z + 1.35)
    # driveway apron from the bays out over the sidewalk to the kerb
    ax0, ax1 = piers[0][0], HQ_X1
    B['apron'].box(ax0, HQ_Y1, z, ax1, walk, z + 0.02)
    B['apron'].box(ax0, walk, CURB_H, ax1, -ZX_HW, CURB_H + 0.025)
    make_text("Apparatus apron no parking", "消防車出入 禁止停車", font, 0.9,
              ((ax0 + ax1) / 2, -ZX_HW - ZX_WALK / 2, CURB_H + 0.035),
              FLAT, M['yellow'], extrude=0.0, parent=g)

    # ---------------------------------------- Songren forecourt (west)
    fx0, fx1 = SR_HW + SR_WALK + 0.6, SR_HW + SR_WALK + 3.2
    for ya, yb in ((HQ_Y0 - 2.0, ENTRY_Y - 6.5), (ENTRY_Y + 6.5, HQ_Y1 + 3.0)):
        gr.box(fx0, ya, z, fx1, yb, z + 0.65)
        shrub.box(fx0 + 0.15, ya + 0.15, z + 0.65, fx1 - 0.15, yb - 0.15, z + 1.15)
    for k in range(3):                        # flagpoles beside the walk
        y = ENTRY_Y - 7.6 - 1.4 * k
        alu.box(fx1 + 1.0, y - 0.06, z, fx1 + 1.12, y + 0.06, z + 11.0)

    for buf in B.values():
        buf.emit(g)
    return g


# ---------------------------------------------------- stage 3: shophouses
# North side of Zhongxiao, from panos 1KP1sE0eaTdTXJhZTZWxuQ (looking north)
# and 4zIyhQYMorzdcPpXP0F9Cw (looking north-west across the intersection).
# Both north-side blocks are rows of 4-5 storey 1970s/80s shophouses:
#   - dark red brick-tile walls in a white concrete frame (pilasters at the
#     party walls, slab edges at every floor), a few cream-tiled ones
#   - wide grey aluminium windows; curved red hoods on the top floor; some
#     recessed balconies with plants and white window cages
#   - a 騎樓 arcade with a big fascia sign on every shop, lightboxes hung
#     under it, sign wraps on the columns, tall vertical signs between units
#     and the odd 2F lightbox billboard
#   - the NE corner unit wraps round onto Songren with signs on both faces
#   - the NW corner is a mid-rise office block (ribbon windows over an
#     arcade), with shophouses beyond it to the west
# The taller 八千代 block seen in the panos stands ~70 m up Songren, outside
# this window; it belongs to the stage 5 backdrop.
# Every building is its own object ("Shophouse NE 03") so the training sim
# can name one as the fire building.  Shop names are generic trades.
import random

FRONT_Y = ZX_HW + ZX_WALK           # facade line on the north side
SH_GF = 4.0                         # ground storey (arcade) height
SH_FH = 3.2                         # upper storey height
SH_ARC = 3.6                        # arcade depth
SH_DEPTH = 14.0                     # building depth
SHOP_WORDS = ["藥局", "不動產", "牛肉麵", "早餐店", "眼鏡行", "牙醫診所",
              "便當", "咖啡", "水電行", "通訊行", "洗衣店", "麵包坊",
              "五金行", "中醫診所", "火鍋", "文具行", "機車行", "小吃",
              "拉麵", "水餃館", "汽車修理", "義大利麵", "滷味", "飲料店"]
VSIGN_WORDS = ["補習班", "美髮沙龍", "診所", "法律事務所", "按摩", "托兒所",
               "房屋仲介", "牙科", "會計事務所", "英語教室", "瑜珈", "旅行社"]
BOARD_WORDS = ["人才募集中", "店面出租", "招生中", "專業牙科", "廣告招租"]
SMALL_WORDS = ["營業中", "外帶", "歡迎光臨", "優惠中", "外送"]

# normal +X: reads correctly for a viewer standing to the east
FACE_E = Matrix(((0, 0, 1), (1, 0, 0), (0, 1, 0)))
# normal -Y: reads correctly for a viewer standing to the south
FACE_S = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))


class MBuf:
    """Boxes with per-box material, emitted as one multi-material mesh."""

    def __init__(self, name):
        self.name = name
        self.verts, self.faces, self.fm, self.mats = [], [], [], []

    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def box(self, m, x0, y0, z0, x1, y1, z1):
        b = BoxBuf("", None)
        b.box(x0, y0, z0, x1, y1, z1)
        self.raw(m, b.verts, b.faces)

    def raw(self, m, verts, faces):
        mi, i = self._mi(m), len(self.verts)
        self.verts += verts
        self.faces += [tuple(i + k for k in f) for f in faces]
        self.fm += [mi] * len(faces)

    def emit(self, parent):
        return new_obj(self.name, self.verts, self.faces, self.mats, self.fm,
                       parent=parent)


class Row:
    """Local frame for a south-facing street front: u runs east along the
    street from x0, d runs north into the building from FRONT_Y."""

    def __init__(self, buf, x0):
        self.b, self.x0 = buf, x0

    def box(self, m, u0, d0, z0, u1, d1, z1):
        self.b.box(m, self.x0 + u0, FRONT_Y + d0, z0, self.x0 + u1, FRONT_Y + d1, z1)

    def p(self, u, d, z):
        return (self.x0 + u, FRONT_Y + d, z)


class Flank:
    """Local frame for a corner unit's side wall onto Songren.  t runs north
    along the flank from FRONT_Y, n is the outward normal (east or west)."""

    def __init__(self, buf, x, sgn):
        self.b, self.x, self.s = buf, x, sgn        # sgn +1 faces east

    def box(self, m, t0, n0, z0, t1, n1, z1):
        self.b.box(m, self.x + self.s * n0, FRONT_Y + t0, z0,
                   self.x + self.s * n1, FRONT_Y + t1, z1)

    def p(self, t, n, z):
        return (self.x + self.s * n, FRONT_Y + t, z)

    @property
    def basis(self):
        return FACE_E if self.s > 0 else FACE_W


def shop_materials(M):
    M.update({
        'brick':      mat("Brick tile red", (0.27, 0.065, 0.040, 1), rough=0.60),
        'brick2':     mat("Brick tile red light", (0.34, 0.10, 0.065, 1), rough=0.60),
        'tile_cream': mat("Facade tile cream", (0.62, 0.56, 0.44, 1), rough=0.50),
        'tile_white': mat("Facade tile white", (0.70, 0.69, 0.66, 1), rough=0.45),
        'tile_beige': mat("Facade tile beige", (0.58, 0.49, 0.37, 1), rough=0.55),
        'frame':      mat("Concrete frame white", (0.66, 0.66, 0.63, 1), rough=0.70),
        'hood_red':   mat("Window hood red", (0.45, 0.07, 0.05, 1), rough=0.50),
        'hood_salmon': mat("Window hood salmon", (0.58, 0.22, 0.15, 1), rough=0.50),
        'iron':       mat("Iron window cage", (0.09, 0.09, 0.09, 1), metallic=0.6, rough=0.5),
        'cage_white': mat("Window cage white", (0.72, 0.72, 0.70, 1), metallic=0.3, rough=0.5),
        'win_frame':  mat("Window frame grey", (0.45, 0.46, 0.47, 1), metallic=0.7, rough=0.4),
        'sheet_blue': mat("Tin roof blue", (0.08, 0.22, 0.42, 1), metallic=0.4, rough=0.45),
        'sheet_grey': mat("Tin roof grey", (0.33, 0.35, 0.36, 1), metallic=0.4, rough=0.45),
        'tank':       mat("Water tank stainless", (0.70, 0.70, 0.70, 1), metallic=1.0, rough=0.30),
        'ac':         mat("AC unit white", (0.80, 0.80, 0.78, 1), rough=0.50),
        'teal':       mat("Shopfront glass teal", (0.30, 0.55, 0.52, 1), metallic=0.3, rough=0.08),
        'ceiling':    mat("Arcade ceiling", (0.70, 0.69, 0.65, 1), rough=0.80),
        'arc_floor':  mat("Arcade floor tile", (0.42, 0.37, 0.33, 1), rough=0.70),
        'sg_yellow':  mat("Sign yellow", (0.85, 0.62, 0.04, 1), rough=0.40),
        'sg_red':     mat("Sign red", (0.55, 0.03, 0.03, 1), rough=0.40),
        'sg_green':   mat("Sign green", (0.04, 0.32, 0.12, 1), rough=0.40),
        'sg_white':   mat("Sign white", (0.85, 0.85, 0.83, 1), rough=0.40),
        'sg_blue':    mat("Sign blue", (0.04, 0.14, 0.42, 1), rough=0.40),
        'sg_orange':  mat("Sign orange", (0.80, 0.30, 0.03, 1), rough=0.40),
        'sg_black':   mat("Sign black", (0.04, 0.04, 0.04, 1), rough=0.40),
        'txt_dark':   mat("Sign lettering dark red", (0.35, 0.02, 0.02, 1), rough=0.40),
    })


SIGN_COLOURS = (('sg_yellow', 'txt_dark'), ('sg_red', 'white'), ('sg_green', 'white'),
                ('sg_white', 'sg_red'), ('sg_blue', 'white'), ('sg_orange', 'white'),
                ('sg_white', 'sg_blue'), ('sg_black', 'sg_yellow'), ('sg_red', 'sg_yellow'))


def fit_size(word, avail, cap):
    return min(cap, avail / max(len(word), 1) / 1.08)


def hood(B, P, m, a0, a1, h, out=0.70, rise=0.55, seg=6):
    """Curved eyebrow hood over a window: a quarter-ellipse shell from the
    wall (top) bulging out and down, swept from a0 to a1 along the wall.
    P.p(a, n_or_d, z) with outward = negative second coordinate for Row,
    positive for Flank, so the caller passes the outward sign in."""
    verts, faces = [], []
    for k in range(seg + 1):
        th = math.radians(90 * k / seg)
        o, zz = out * math.sin(th), h + 0.05 + rise * math.cos(th)
        verts += [P(a0, o, zz), P(a1, o, zz)]
    for k in range(seg):
        i = 2 * k
        faces.append((i, i + 1, i + 3, i + 2))
    B.raw(m, verts, faces)


def build_shophouse(M, font, g, name, x0, w, floors, rng, corner=None):
    """corner: None, 'W' (flank faces west onto Songren) or 'E'."""
    B = MBuf(name)
    R = Row(B, x0)
    out = lambda a, o, zz: R.p(a, -o, zz)        # outward is -d on the front
    top = SH_GF + floors * SH_FH
    z = HQ_Z0
    wall = M[rng.choice(('brick', 'brick', 'brick2', 'brick', 'tile_cream',
                         'tile_white'))]
    fr = M['frame']

    # volumes: shop behind the arcade, upper floors out to the facade line.
    # A corner unit's shop is also pulled back from the flank so the arcade
    # wraps round onto Songren.
    s0 = SH_ARC if corner == 'W' else 0.0
    s1 = w - SH_ARC if corner == 'E' else w
    R.box(wall, s0, SH_ARC, z, s1, SH_DEPTH, z + SH_GF)
    R.box(wall, 0, 0, z + SH_GF, w, SH_DEPTH, z + top)
    R.box(M['ceiling'], 0, 0, z + SH_GF - 0.05, w, SH_DEPTH if corner else SH_ARC,
          z + SH_GF)
    R.box(M['arc_floor'], 0, 0, z, w, SH_ARC, z + 0.03)

    # concrete frame: pilaster at the west party wall (the next unit's is our
    # east one), slab edge at every floor, a cornice on top
    col_m = wall
    if rng.random() < 0.4:      # arcade column wrapped in a sign panel
        col_m = M[rng.choice(('sg_red', 'sg_yellow', 'sg_red'))]
    R.box(fr, 0, -0.15, z + SH_GF, 0.45, 0.0, z + top + 0.9)
    R.box(col_m, 0, 0, z, 0.50, 0.6, z + SH_GF)
    if corner == 'E':
        R.box(fr, w - 0.45, -0.15, z + SH_GF, w, 0.0, z + top + 0.9)
        R.box(wall, w - 0.5, 0, z, w, 0.6, z + SH_GF)
    for f in range(floors + 1):
        zf = z + SH_GF + f * SH_FH
        R.box(fr, -0.02, -0.12, zf - 0.08, w + 0.02, 0.0, zf + 0.28)

    # shopfront at the back of the arcade
    kind = 'teal' if corner == 'W' else rng.choice(('glass', 'glass', 'glass', 'shutter'))
    if kind == 'shutter':
        R.box(M['shutter'], s0 + 0.5, SH_ARC - 0.06, z, s1 - 0.1, SH_ARC,
              z + 1.2 + rng.random() * 1.8)
        R.box(M['win'], s0 + 0.5, SH_ARC - 0.04, z, s1 - 0.1, SH_ARC, z + SH_GF - 0.6)
    else:
        R.box(M['teal' if kind == 'teal' else 'win'], s0 + 0.5, SH_ARC - 0.05, z,
              s1 - 0.1, SH_ARC, z + SH_GF - 0.5)
        n = int((s1 - s0) // 1.6) + 1
        for k in range(1, n):
            u = s0 + 0.5 + k * (s1 - s0 - 0.6) / n
            R.box(M['alu'], u - 0.03, SH_ARC - 0.09, z, u + 0.03, SH_ARC - 0.05,
                  z + SH_GF - 0.5)

    # fascia sign: big, full width, lapping onto the neighbours a little
    sc, tc = rng.choice(SIGN_COLOURS)
    zs0, zs1 = z + SH_GF - 0.95, z + SH_GF + 0.55
    R.box(M[sc], -0.10, -0.40, zs0, w + 0.10, -0.10, zs1)
    word = rng.choice(SHOP_WORDS)
    make_text(f"{name} sign", word, font, fit_size(word, w - 0.9, 0.85),
              R.p(w / 2, -0.43, (zs0 + zs1) / 2), FACE_S, M[tc],
              extrude=0.01, spacing=1.05, parent=g)
    # a smaller lightbox hung under the fascia
    if rng.random() < 0.55:
        sc2, tc2 = rng.choice(SIGN_COLOURS)
        ua = rng.uniform(0.6, max(0.7, w - 2.8))
        R.box(M[sc2], ua, -0.30, zs0 - 0.62, ua + 2.2, -0.15, zs0 - 0.05)
        w2 = rng.choice(SMALL_WORDS)
        make_text(f"{name} lightbox", w2, font, fit_size(w2, 1.9, 0.38),
                  R.p(ua + 1.1, -0.32, zs0 - 0.33), FACE_S, M[tc2],
                  extrude=0.005, parent=g)

    # a 2F lightbox billboard over the whole bay on some units
    board_floor = 0 if rng.random() < 0.22 else None

    # upper floors
    for f in range(floors):
        zf = z + SH_GF + f * SH_FH
        s, h = zf + 0.95, zf + 2.55
        if f == board_floor:
            bc, btc = rng.choice((('sg_white', 'sg_red'), ('sg_white', 'sg_green'),
                                  ('sg_yellow', 'txt_dark')))
            R.box(M[bc], 0.5, -0.45, zf + 0.35, w - 0.05, -0.15, zf + SH_FH - 0.15)
            bw = rng.choice(BOARD_WORDS)
            make_text(f"{name} billboard", bw, font, fit_size(bw, w - 1.2, 0.75),
                      R.p((w + 0.45) / 2, -0.48, zf + SH_FH / 2), FACE_S, M[btc],
                      extrude=0.01, parent=g)
            continue
        style = rng.choice(('plain', 'plain', 'cage', 'balcony'))
        if f == floors - 1:
            style = 'hood'
        # one wide window across the bay, grey frame, 3-4 sashes
        u0, u1 = 0.85, w - 0.45
        if style == 'balcony':
            # recessed loggia: dark void, plants, white cage across the front
            R.box(M['win'], u0, 0.9, s - 0.6, u1, 0.95, h + 0.1)
            R.box(wall, u0, -0.01, zf + 0.28, u1, 0.9, zf + 0.30)
            R.box(M['shrub'], u0 + 0.1, 0.1, s - 0.6, u1 - 0.1, 0.5, s - 0.05)
            for k in range(int((u1 - u0) / 0.18)):
                uu = u0 + k * 0.18
                R.box(M['cage_white'], uu, -0.04, s - 0.6, uu + 0.025, -0.015, h + 0.1)
            R.box(M['cage_white'], u0, -0.05, h + 0.05, u1, 0.0, h + 0.12)
            continue
        R.box(M['win'], u0, -0.04, s, u1, 0.02, h)
        R.box(M['win_frame'], u0 - 0.06, -0.08, s - 0.06, u1 + 0.06, -0.04, s)
        R.box(M['win_frame'], u0 - 0.06, -0.08, h, u1 + 0.06, -0.04, h + 0.06)
        nsash = 4 if (u1 - u0) > 3.4 else 3
        for k in range(nsash + 1):
            uu = u0 + k * (u1 - u0) / nsash
            R.box(M['win_frame'], uu - 0.035, -0.08, s, uu + 0.035, -0.04, h)
        if style == 'cage':
            cm = M[rng.choice(('cage_white', 'iron'))]
            for zz in (s - 0.1, h + 0.05):
                R.box(cm, u0 - 0.1, -0.50, zz, u1 + 0.1, 0, zz + 0.05)
            for k in range(int((u1 - u0) / 0.16) + 1):
                uu = u0 - 0.05 + k * 0.16
                R.box(cm, uu, -0.50, s - 0.1, uu + 0.02, -0.48, h + 0.1)
            R.box(cm, u0 - 0.1, -0.50, h + 0.1, u1 + 0.1, 0, h + 0.13)
            if rng.random() < 0.6:
                R.box(M['shrub'], u0, -0.45, s - 0.05, u1, -0.12, s + 0.40)
        elif style == 'hood':
            hood(B, out, M[rng.choice(('hood_red', 'hood_red', 'hood_salmon'))],
                 u0 - 0.15, u1 + 0.15, h)
        if rng.random() < 0.40:                      # window AC unit
            ua = rng.uniform(u0 + 0.2, u1 - 0.9)
            R.box(M['ac'], ua, -0.35, s - 0.62, ua + 0.7, 0, s - 0.08)

    # tall vertical sign hung out at the east party wall
    if rng.random() < 0.6 and floors >= 3:
        sc, tc = rng.choice(SIGN_COLOURS)
        word = rng.choice(VSIGN_WORDS)
        zs0 = z + SH_GF + 0.7
        zs1 = zs0 + min(floors * SH_FH - 1.0, max(4.0, 1.05 * len(word) + 0.6))
        R.box(M[sc], w - 0.22, -1.35, zs0, w + 0.02, -0.15, zs1)
        for zz in (zs0 + 0.3, zs1 - 0.4):
            R.box(M['iron'], w - 0.15, -0.15, zz, w - 0.05, 0, zz + 0.1)
        vsz = fit_size(word, zs1 - zs0 - 0.4, 0.95)
        for side, basis, xo in (('E', FACE_E, w + 0.04), ('W', FACE_W, w - 0.24)):
            make_text(f"{name} vertical sign {side}", "\n".join(word), font, vsz,
                      R.p(xo, -0.75, (zs0 + zs1) / 2), basis, M[tc],
                      extrude=0.005, parent=g)

    # roof: parapet, a small set-back tin room on some, water tank
    R.box(fr, 0, -0.12, z + top + 0.28, w, 0.22, z + top + 1.0)
    R.box(wall, 0, SH_DEPTH - 0.22, z + top, w, SH_DEPTH, z + top + 1.0)
    if rng.random() < 0.35:
        sh = M[rng.choice(('sheet_blue', 'sheet_grey'))]
        R.box(sh, 0.4, 4.5, z + top, w - 0.4, SH_DEPTH - 1.2, z + top + 2.3)
        R.box(sh, 0.3, 4.3, z + top + 2.3, w - 0.3, SH_DEPTH - 1.0, z + top + 2.4)
    if rng.random() < 0.6:
        ut = rng.uniform(0.6, w - 1.6)
        R.box(M['iron'], ut, SH_DEPTH - 2.6, z + top, ut + 1.0, SH_DEPTH - 1.6, z + top + 0.6)
        R.box(M['tank'], ut + 0.05, SH_DEPTH - 2.55, z + top + 0.6, ut + 0.95,
              SH_DEPTH - 1.65, z + top + 1.8)

    if corner:
        build_flank(M, font, g, B, name, x0 if corner == 'W' else x0 + w,
                    -1 if corner == 'W' else 1, floors, wall, rng)

    ob = B.emit(g)
    ob["kind"] = "shophouse"
    ob["floors"] = floors + 1
    return ob


def build_flank(M, font, g, B, name, x, sgn, floors, wall, rng):
    """The Songren-facing side of a corner unit: arcade columns, a second
    fascia sign, framed windows and a big rooftop billboard frame."""
    F = Flank(B, x, sgn)
    z = HQ_Z0
    top = SH_GF + floors * SH_FH
    fr = M['frame']
    out = lambda t, o, zz: F.p(t, o, zz)
    for t in (SH_DEPTH / 2, SH_DEPTH - 0.6):
        F.box(wall, t - 0.3, -0.6, z, t + 0.3, 0, z + SH_GF)
    F.box(M['teal'], SH_ARC + 0.4, -SH_ARC, z, SH_DEPTH - 0.6, -SH_ARC + 0.05,
          z + SH_GF - 0.5)
    for f in range(floors + 1):
        zf = z + SH_GF + f * SH_FH
        F.box(fr, -0.02, 0.0, zf - 0.08, SH_DEPTH, 0.12, zf + 0.28)
    for f in range(floors):
        zf = z + SH_GF + f * SH_FH
        s, h = zf + 0.95, zf + 2.55
        for t0 in (1.2, 7.6):
            t1 = t0 + 5.0
            F.box(M['win'], t0, -0.02, s, t1, 0.04, h)
            for k in range(4):
                tt = t0 + k * 5.0 / 3
                F.box(M['win_frame'], tt - 0.035, 0.04, s, tt + 0.035, 0.08, h)
            if f == floors - 1:
                hood(B, out, M['hood_red'], t0 - 0.15, t1 + 0.15, h)
    sc, tc = rng.choice(SIGN_COLOURS)
    zs0, zs1 = z + SH_GF - 0.95, z + SH_GF + 0.55
    F.box(M[sc], 0.2, 0.10, zs0, SH_DEPTH, 0.40, zs1)
    word = rng.choice(SHOP_WORDS)
    make_text(f"{name} flank sign", word, font, fit_size(word, SH_DEPTH - 2, 0.9),
              F.p(SH_DEPTH / 2 + 0.1, 0.43, (zs0 + zs1) / 2), F.basis, M[tc],
              extrude=0.01, spacing=1.1, parent=g)
    # rooftop billboard facing the intersection
    zb = z + top + 1.0
    for t in (2.0, 9.0):
        F.box(M['iron'], t, -1.5, zb, t + 0.15, -1.35, zb + 5.0)
    F.box(M['sg_white'], 1.0, -1.35, zb + 1.0, 11.0, -1.15, zb + 4.6)
    make_text(f"{name} rooftop billboard", "廣告招租", font, 1.6,
              F.p(6.0, -1.12, zb + 2.8), F.basis, M['sg_red'], extrude=0.01,
              spacing=1.1, parent=g)


def build_office_nw(M, font, g):
    """Mid-rise office on the NW corner: ribbon windows over an arcade."""
    x0, x1 = -42.0, -SR_HW - SR_WALK          # east face on Songren
    d = 18.0
    floors, gf, fh = 10, 5.0, 3.4
    z = HQ_Z0
    B = MBuf("Office NW corner")
    R = Row(B, x0)
    w = x1 - x0
    top = gf + floors * fh
    tile, rib = M['tile_beige'], M['win']
    R.box(tile, 0, SH_ARC, z, w, d, z + gf)
    R.box(tile, 0, 0, z + gf, w, d, z + top)
    R.box(M['ceiling'], 0, 0, z + gf - 0.05, w, SH_ARC, z + gf)
    R.box(M['arc_floor'], 0, 0, z, w, SH_ARC, z + 0.03)
    for k in range(5):
        u = k * (w - 0.6) / 4
        R.box(tile, u, 0, z, u + 0.6, 0.7, z + gf)
    R.box(M['win'], 0.6, SH_ARC - 0.05, z, w - 0.6, SH_ARC, z + gf - 0.6)
    # ribbon windows on the south and east faces
    for f in range(floors):
        zf = z + gf + f * fh
        R.box(rib, 0.4, -0.05, zf + 0.9, w - 0.4, 0.0, zf + 2.6)
        B.box(rib, x1, FRONT_Y + 0.4, zf + 0.9, x1 + 0.05, FRONT_Y + d - 0.4, zf + 2.6)
        for k in range(int(w / 1.5) + 1):
            u = 0.4 + k * (w - 0.8) / int(w / 1.5)
            R.box(M['alu'], u - 0.03, -0.08, zf + 0.9, u + 0.03, -0.05, zf + 2.6)
        for k in range(int(d / 1.5) + 1):
            dd = 0.4 + k * (d - 0.8) / int(d / 1.5)
            B.box(M['alu'], x1 + 0.05, FRONT_Y + dd - 0.03, zf + 0.9, x1 + 0.08,
                  FRONT_Y + dd + 0.03, zf + 2.6)
    # east flank of the arcade storey: glazed shop on Songren
    B.box(M['win'], x1, FRONT_Y + SH_ARC, z, x1 + 0.05, FRONT_Y + d - 1.0, z + gf - 0.6)
    # crown and roof plant
    R.box(tile, -0.2, -0.2, z + top, w + 0.2, d + 0.2, z + top + 1.2)
    R.box(M['sheet_grey'], w * 0.3, 4.0, z + top, w * 0.75, d - 3.0, z + top + 3.5)
    # name band over the arcade
    R.box(M['sg_white'], 1.0, -0.25, z + gf - 1.1, w - 1.0, 0.0, z + gf - 0.2)
    make_text("Office NW corner sign", "商業大樓", font, 0.7,
              R.p(w / 2, -0.28, z + gf - 0.65), FACE_S, M['sg_blue'],
              extrude=0.01, spacing=1.3, parent=g)
    ob = B.emit(g)
    ob["kind"] = "office"
    ob["floors"] = floors + 1
    return ob


def build_shophouses(M, root):
    shop_materials(M)
    font = load_font()
    g = group("S3 Shophouses", root)
    rng = random.Random(5149)

    def run_row(tag, xa, xb, corner_at=None):
        x, n = xa, 1
        while xb - x > 3.6:
            w = rng.choice((4.2, 4.5, 4.5, 4.8, 5.0, 5.4))
            last = xb - x - w < 3.6
            if last:
                w = xb - x
            corner = None
            if corner_at == 'W' and n == 1:
                corner, w = 'W', 7.5
            elif corner_at == 'E' and last:
                corner = 'E'
            floors = rng.choices((3, 4, 5), weights=(1, 6, 2))[0]
            build_shophouse(M, font, g, f"Shophouse {tag} {n:02d}", x, w, floors,
                            rng, corner=corner)
            x += w
            n += 1

    run_row("NE", SR_HW + SR_WALK, X1, corner_at='W')
    build_office_nw(M, font, g)
    run_row("NW", X0, -42.0)
    return g


# ----------------------------------------------- stage 4: street furniture
# From the panos: broadleaf street trees along Songren and the HQ frontage,
# palms in the Songren median, concrete barrier blocks down the middle of
# Zhongxiao carrying ring-topped lamp posts, the yellow box-grid painted on
# Zhongxiao in front of the apparatus bays, a cluster of utility cabinets on
# the HQ corner, mast-arm signals with blue street-name signs.
#
# Trees, lamps and poles are linked duplicates of a few shared meshes, so the
# GLB carries each shape once.  Every signal lens is its own object named
# "Signal <approach> <colour>" so the sim can swap its material between
# "Signal <colour> on" and "Signal <colour> off".

MED_BAR_HW = 0.30                  # Zhongxiao median barrier half width
MED_BAR_FROM = 27.0                # barrier starts this far from the centre


class Kit:
    """bmesh scratch pad for building one shared mesh from primitives."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    def _assign(self, verts, m):
        if m not in self.mats:
            self.mats.append(m)
        idx = self.mats.index(m)
        faces = set()
        for v in verts:
            faces.update(v.link_faces)
        for f in faces:
            f.material_index = idx

    def cyl(self, m, p0, p1, r0, r1=None, seg=10):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        mx = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4()
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False,
                                    segments=seg, radius1=r0,
                                    radius2=r0 if r1 is None else r1,
                                    depth=d.length, matrix=mx)
        self._assign(res['verts'], m)

    def sphere(self, m, c, r, sub=1, sz=1.0):
        mx = Matrix.Translation(c) @ Matrix.Diagonal((1, 1, sz, 1))
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r, matrix=mx)
        self._assign(res['verts'], m)

    def box(self, m, c, size):
        mx = Matrix.Translation(c) @ Matrix.Diagonal((size[0], size[1], size[2], 1))
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=mx)
        self._assign(res['verts'], m)

    def poly(self, m, pts):
        vs = [self.bm.verts.new(p) for p in pts]
        self.bm.faces.new(vs)
        self._assign(vs, m)

    def extrude_x(self, m, profile, xa, xb):
        """Prism of a (y, z) profile from x = xa to x = xb."""
        a = [self.bm.verts.new((xa, y, z)) for y, z in profile]
        b = [self.bm.verts.new((xb, y, z)) for y, z in profile]
        k = len(profile)
        self.bm.faces.new(list(reversed(a)))
        self.bm.faces.new(b)
        for i in range(k):
            j = (i + 1) % k
            self.bm.faces.new((a[i], a[j], b[j], b[i]))
        self._assign(a + b, m)

    def mesh(self, name):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        return me


def inst(name, me, loc, rz=0.0, s=1.0, parent=None):
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (0, 0, rz)
    ob.scale = (s, s, s)
    if parent:
        ob.parent = parent
    return ob


def furn_materials(M):
    M.update({
        'bark':      mat("Tree bark", (0.16, 0.12, 0.085, 1), rough=0.95),
        'leaf':      mat("Tree foliage", (0.050, 0.140, 0.035, 1), rough=0.85),
        'leaf2':     mat("Tree foliage light", (0.090, 0.200, 0.045, 1), rough=0.85),
        'palm_bark': mat("Palm trunk", (0.30, 0.26, 0.20, 1), rough=0.90),
        'palm':      mat("Palm frond", (0.10, 0.22, 0.05, 1), rough=0.80),
        'pole':      mat("Pole galvanised", (0.50, 0.52, 0.53, 1), metallic=0.8, rough=0.45),
        'pole_dark': mat("Pole dark green", (0.10, 0.14, 0.12, 1), metallic=0.5, rough=0.5),
        'lamp_lens': mat("Lamp lens", (0.90, 0.88, 0.80, 1), rough=0.20,
                         emis=(1.0, 0.92, 0.75, 1), emis_str=0.0),
        'sig_house': mat("Signal housing", (0.03, 0.03, 0.03, 1), rough=0.50),
        'red_on':    mat("Signal red on", (0.9, 0.05, 0.03, 1), rough=0.2,
                         emis=(1.0, 0.05, 0.02, 1), emis_str=6.0),
        'red_off':   mat("Signal red off", (0.15, 0.02, 0.02, 1), rough=0.2),
        'yel_on':    mat("Signal yellow on", (0.9, 0.6, 0.05, 1), rough=0.2,
                         emis=(1.0, 0.65, 0.05, 1), emis_str=6.0),
        'yel_off':   mat("Signal yellow off", (0.15, 0.10, 0.02, 1), rough=0.2),
        'grn_on':    mat("Signal green on", (0.05, 0.9, 0.5, 1), rough=0.2,
                         emis=(0.05, 1.0, 0.55, 1), emis_str=6.0),
        'grn_off':   mat("Signal green off", (0.02, 0.12, 0.08, 1), rough=0.2),
        'name_blue': mat("Street name sign blue", (0.03, 0.15, 0.45, 1), rough=0.40),
        'barrier':   mat("Barrier concrete", (0.50, 0.49, 0.46, 1), rough=0.85),
        'hazard':    mat("Hazard yellow", (0.85, 0.65, 0.03, 1), rough=0.50),
        'cab_green': mat("Utility cabinet green", (0.12, 0.30, 0.18, 1), rough=0.55),
        'cab_grey':  mat("Utility cabinet grey", (0.45, 0.47, 0.47, 1), rough=0.55),
        'cab_wrap':  mat("Utility box wrap", (0.55, 0.62, 0.30, 1), rough=0.55),
    })


# ----------------------------------------------------------------- meshes
def mesh_broadleaf(M, seed):
    rng = random.Random(seed)
    k = Kit()
    lean = (rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4))
    top = (lean[0], lean[1], 4.6)
    k.cyl(M['bark'], (0, 0, 0), top, 0.20, 0.14, seg=8)
    leaf = M['leaf'] if seed % 2 else M['leaf2']
    for i in range(6):
        a = i * math.tau / 6 + rng.uniform(-0.3, 0.3)
        rr = rng.uniform(1.0, 2.0)
        c = (top[0] + rr * math.cos(a), top[1] + rr * math.sin(a),
             rng.uniform(5.8, 8.2))
        k.cyl(M['bark'], top, (c[0] * 0.7, c[1] * 0.7, c[2] - 0.8), 0.09, 0.05, seg=6)
        k.sphere(leaf, c, rng.uniform(1.5, 2.3), sub=1, sz=0.75)
    k.sphere(leaf, (top[0], top[1], 8.6), 1.9, sub=1, sz=0.7)
    return k.mesh(f"Tree broadleaf {seed}")


def mesh_palm(M, seed):
    rng = random.Random(seed)
    k = Kit()
    h = rng.uniform(8.5, 10.5)
    bend = (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5))
    pts = [(bend[0] * t * t, bend[1] * t * t, h * t) for t in (0, 0.35, 0.7, 1.0)]
    for i in range(3):
        k.cyl(M['palm_bark'], pts[i], pts[i + 1], 0.26 - 0.03 * i, 0.23 - 0.03 * i, seg=8)
    cx, cy, cz = pts[-1]
    k.sphere(M['palm'], (cx, cy, cz + 0.1), 0.45, sub=1)
    for f in range(12):
        a = f * math.tau / 12 + rng.uniform(-0.15, 0.15)
        ca, sa = math.cos(a), math.sin(a)
        L = rng.uniform(2.8, 3.6)
        rows = []
        for i in range(6):
            s = i / 5
            d, z = L * s, cz + 0.9 * s - 2.4 * s * s
            wdt = 0.55 * (1 - s) + 0.08
            rows.append(((cx + d * ca - wdt * sa, cy + d * sa + wdt * ca, z),
                         (cx + d * ca + wdt * sa, cy + d * sa - wdt * ca, z)))
        for i in range(5):
            k.poly(M['palm'], [rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]])
    return k.mesh(f"Tree palm {seed}")


def mesh_side_lamp(M):
    """Songren sidewalk lamp: arm along local +X, luminaire at its end."""
    k = Kit()
    k.cyl(M['pole'], (0, 0, 0), (0, 0, 10.0), 0.13, 0.08)
    k.cyl(M['pole'], (0, 0, 9.4), (2.2, 0, 9.9), 0.06)
    k.box(M['pole'], (2.4, 0, 9.92), (1.0, 0.38, 0.16))
    k.box(M['lamp_lens'], (2.4, 0, 9.82), (0.85, 0.30, 0.04))
    return k.mesh("Street lamp side-arm")


def mesh_ring_lamp(M):
    """Zhongxiao median post: twin arms over both carriageways (+-Y) and the
    big hoop near the top, in the plane of the road (XZ)."""
    k = Kit()
    k.cyl(M['pole'], (0, 0, 0), (0, 0, 11.0), 0.15, 0.09)
    for s in (1, -1):
        k.cyl(M['pole'], (0, 0, 9.8), (0, s * 2.6, 10.4), 0.06)
        k.box(M['pole'], (0, s * 2.8, 10.42), (0.38, 1.0, 0.16))
        k.box(M['lamp_lens'], (0, s * 2.8, 10.32), (0.30, 0.85, 0.04))
    n, R, zc = 24, 1.25, 9.6
    ring = [(R * math.cos(i * math.tau / n), 0, zc + R * math.sin(i * math.tau / n))
            for i in range(n)]
    for i in range(n):
        k.cyl(M['pole'], ring[i], ring[(i + 1) % n], 0.05, seg=6)
    return k.mesh("Street lamp ring post")


def mesh_signal_pole(M):
    """Mast-arm signal pole, arm along local +X (11 m)."""
    k = Kit()
    k.cyl(M['pole'], (0, 0, 0), (0, 0, 7.6), 0.19, 0.14, seg=12)
    k.cyl(M['pole'], (0, 0, 6.9), (11.0, 0, 6.9), 0.11, 0.06, seg=10)
    k.cyl(M['pole'], (0, 0, 7.5), (3.5, 0, 6.95), 0.04, seg=6)       # tie rod
    k.box(M['pole'], (0, 0, 0.15), (0.6, 0.6, 0.3))                    # base
    return k.mesh("Signal pole mast-arm")


# ------------------------------------------------------------------ build
def build_furniture(M, root):
    furn_materials(M)
    font = load_font()
    g = group("S4 Street furniture", root)
    rng = random.Random(4110)
    zw = CURB_H                                   # sidewalk level

    trees = [mesh_broadleaf(M, s) for s in (1, 2, 3)]
    palms = [mesh_palm(M, s) for s in (1, 2)]
    gt = group("S4 Trees", g)
    n = [0]

    def tree(pos, z=zw, kind='broad'):
        n[0] += 1
        me = rng.choice(trees if kind == 'broad' else palms)
        inst(f"Tree {n[0]:03d}", me, (pos[0], pos[1], z),
             rz=rng.uniform(0, math.tau), s=rng.uniform(0.85, 1.15), parent=gt)

    # Songren east sidewalk: HQ frontage, then south of the alley
    for y in range(-26, -56, -6):
        tree((SR_HW + 4.5, y + rng.uniform(-0.8, 0.8)))
    for y in range(-69, -110, -7):
        tree((SR_HW + 4.5, y))
    # Songren west sidewalk along the park
    for y in range(-26, -98, -7):
        tree((-SR_HW - 4.5, y + rng.uniform(-0.8, 0.8)))
    # Zhongxiao south sidewalk in front of the HQ, clear of the apron
    for x in range(26, 50, 6):
        tree((x, -ZX_HW - 3.5))
    for x in (76, 82, 88):
        tree((x, -ZX_HW - 3.5))
    # HQ forecourt and the park
    for p in ((26.0, -24.0), (27.0, -53.5)):
        tree(p, z=HQ_Z0)
    for i in range(14):
        tree((rng.uniform(X0 + 4, -SR_HW - SR_WALK - 3),
              rng.uniform(XY_Y1 + 5, -ZX_HW - ZX_WALK - 4)), z=HQ_Z0)
    # Songren median palms
    for lo, hi in ((AL_Y1 + 3, -MED_NOSE - 2), (Y0 + 2, AL_Y0 - 3), (MED_NOSE + 3, Y1 - 1)):
        y = lo
        while y <= hi:
            tree((0.0, y), z=0.20, kind='palm')
            y += 8.0

    # ---------------------------------------------- Zhongxiao median barrier
    k = Kit()
    prof = [(-MED_BAR_HW, 0.0), (MED_BAR_HW, 0.0), (MED_BAR_HW, 0.08), (0.12, 0.30),
            (0.10, 0.81), (-0.10, 0.81), (-0.12, 0.30), (-MED_BAR_HW, 0.08)]
    for sgn, far in ((1, X1), (-1, X0)):
        # yellow nose block facing the intersection, then 3 m concrete blocks
        k.box(M['hazard'], (sgn * (MED_BAR_FROM + 0.6), 0, 0.42), (1.2, 0.64, 0.84))
        lo, hi = sorted((sgn * (MED_BAR_FROM + 1.25), far))
        x = lo
        while x < hi - 0.5:
            k.extrude_x(M['barrier'], prof, x, min(x + 2.95, hi))
            x += 3.0
    inst("Zhongxiao median barrier", k.mesh("Zhongxiao median barrier"), (0, 0, 0),
         parent=g)

    # -------------------------------------------------------------- lamps
    side = mesh_side_lamp(M)
    ring = mesh_ring_lamp(M)
    gl = group("S4 Street lamps", g)
    nl = 0
    for y in (-36, -62, -86, 30):
        nl += 1
        inst(f"Street lamp {nl:02d}", side, (SR_HW + 0.8, y, zw), rz=math.pi, parent=gl)
    for y in (-40, -68, -94, 34):
        nl += 1
        inst(f"Street lamp {nl:02d}", side, (-SR_HW - 0.8, y, zw), rz=0.0, parent=gl)
    for x in (33.0, 61.0, 87.0, -33.0, -57.0):
        nl += 1
        inst(f"Street lamp {nl:02d}", ring, (x, 0, 0.81), parent=gl)

    # ------------------------------------------------------------ signals
    pole = mesh_signal_pole(M)
    gs = group("S4 Traffic signals", g)
    # (approach, pole position, arm direction, facing = towards the drivers,
    #  cross-street name)
    approaches = (
        ("NB", (SR_HW + 1.0, ZX_HW + 8.5), (-1, 0), (0, -1), "忠孝東路五段"),
        ("SB", (-SR_HW - 1.0, -ZX_HW - 8.5), (1, 0), (0, 1), "忠孝東路五段"),
        ("EB", (SR_HW + 9.5, -ZX_HW - 1.0), (0, 1), (-1, 0), "松仁路"),
        ("WB", (-SR_HW - 9.5, ZX_HW + 1.0), (0, -1), (1, 0), "松仁路"),
    )
    basis_for = {(0, -1): FACE_S, (0, 1): FACE_N, (-1, 0): FACE_W, (1, 0): FACE_E}
    for tag, (px, py), (ax, ay), (fx, fy), street in approaches:
        inst(f"Signal pole {tag}", pole, (px, py, zw),
             rz=math.atan2(ay, ax), parent=gs)
        # travel = -facing; the driver's left = travel rotated +90 degrees
        tx, ty = -fx, -fy
        lx, ly = -ty, tx
        for h, s in enumerate((5.0, 9.8), 1):
            cx, cy, cz = px + ax * s, py + ay * s, zw + 6.45
            hk = Kit()
            hk.box(M['sig_house'], (cx, cy, cz),
                   (abs(lx) * 1.35 + abs(fx) * 0.32, abs(ly) * 1.35 + abs(fy) * 0.32, 0.45))
            hk.cyl(M['sig_house'], (cx, cy, cz + 0.22), (cx, cy, zw + 6.9), 0.04, seg=6)
            house = inst(f"Signal head {tag} {h}", hk.mesh(f"Signal head {tag} {h}"),
                         (0, 0, 0), parent=gs)
            for colour, off, key in (("red", 0.42, 'red'), ("yellow", 0.0, 'yel'),
                                     ("green", -0.42, 'grn')):
                lit = (key == 'red') if tag in ("NB", "SB") else (key == 'grn')
                c = (cx + lx * off + fx * 0.17, cy + ly * off + fy * 0.17, cz)
                lk = Kit()
                lk.cyl(M[f"{key}_{'on' if lit else 'off'}"], c,
                       (c[0] + fx * 0.05, c[1] + fy * 0.05, c[2]), 0.14, seg=16)
                inst(f"Signal {tag} {colour}" + ("" if h == 1 else f" {h}"),
                     lk.mesh(f"Signal {tag} {colour} {h}"), (0, 0, 0), parent=gs)
        # blue cross-street name sign hung on the arm near the pole
        sx, sy, sz = px + ax * 2.2, py + ay * 2.2, zw + 6.35
        nk = Kit()
        nk.box(M['name_blue'], (sx + fx * 0.08, sy + fy * 0.08, sz),
               (abs(ax) * 2.8 + abs(fx) * 0.06, abs(ay) * 2.8 + abs(fy) * 0.06, 0.62))
        inst(f"Street name sign {tag}", nk.mesh(f"Street name sign {tag}"),
             (0, 0, 0), parent=gs)
        make_text(f"Street name sign {tag} text", street, font, 0.40,
                  (sx + fx * 0.12, sy + fy * 0.12, sz), basis_for[(fx, fy)],
                  M['white'], extrude=0.005, parent=gs)

    # ------------------------------------------------- utility cabinets
    gu = group("S4 Utility cabinets", g)
    ck = Kit()
    ck.box(M['curb'], (SR_HW + 6.6, -38.0, zw + 0.10), (1.3, 5.6, 0.20))
    for i, (yy, key, h) in enumerate(((-40.1, 'cab_grey', 1.35), (-39.0, 'cab_green', 1.25),
                                      (-37.9, 'cab_green', 1.25), (-36.8, 'cab_green', 1.25),
                                      (-35.8, 'cab_grey', 1.10))):
        ck.box(M[key], (SR_HW + 6.6, yy, zw + 0.2 + h / 2), (0.9, 1.0, h))
    cab = inst("Utility cabinets HQ corner", ck.mesh("Utility cabinets HQ corner"),
               (0, 0, 0), parent=gu)
    cab["kind"] = "electrical"
    wk = Kit()
    wk.box(M['cab_wrap'], (SR_HW + 3.6, -33.6, zw + 0.75), (0.65, 0.55, 1.5))
    wk.box(M['cab_grey'], (SR_HW + 3.6, -33.6, zw + 1.53), (0.72, 0.62, 0.06))
    box = inst("Utility box Songren", wk.mesh("Utility box Songren"), (0, 0, 0), parent=gu)
    box["kind"] = "electrical"

    # ------------------- yellow box grid on Zhongxiao in front of the bays
    build_box_grid(M, g, BAYS_X[0] - BAY_W / 2 - 3.0, BAYS_X[-1] + BAY_W / 2 + 3.0,
                   -ZX_HW + 0.3, -MED_BAR_HW - 0.35)
    return g


def build_box_grid(M, g, x0, x1, y0, y1, step=2.4, w=0.15):
    """Yellow 網狀線: a border with diagonals both ways, clipped to the box."""
    Yb = MarkBuf("Road markings yellow box grid", M['yellow'])
    z = MARK_Z + 0.002
    for xa, ya, xb, yb in ((x0, y0, x1, y0 + w), (x0, y1 - w, x1, y1),
                           (x0, y0, x0 + w, y1), (x1 - w, y0, x1, y1)):
        Yb.poly([(xa, ya), (xb, ya), (xb, yb), (xa, yb)], z)

    def seg(p, q):
        dx, dy = q[0] - p[0], q[1] - p[1]
        L = math.hypot(dx, dy)
        if L < 0.3:
            return
        nx, ny = -dy / L * w / 2, dx / L * w / 2
        Yb.poly([(p[0] + nx, p[1] + ny), (p[0] - nx, p[1] - ny),
                 (q[0] - nx, q[1] - ny), (q[0] + nx, q[1] + ny)], z)

    def clip(c, s):
        # line y = s*x + c against the box; return its two crossing points
        pts = []
        for x in (x0, x1):
            y = s * x + c
            if y0 - 1e-6 <= y <= y1 + 1e-6:
                pts.append((x, y))
        for y in (y0, y1):
            x = (y - c) * s                     # s is +-1
            if x0 - 1e-6 <= x <= x1 + 1e-6:
                pts.append((x, y))
        pts = sorted(set((round(a, 6), round(b, 6)) for a, b in pts))
        return (pts[0], pts[-1]) if len(pts) >= 2 else None

    for s in (1, -1):
        # c = y - s*x sweeps the box between these two corners
        c, c_end = (y0 - x1, y1 - x0) if s > 0 else (y0 + x0, y1 + x1)
        c += step / 2
        while c <= c_end:
            r = clip(c, s)
            if r:
                seg(*r)
            c += step
    return Yb.emit(g)


# ------------------------------------------ stage 5: backdrop and lighting
# Everything outside the 150 m window is backdrop: low-detail massing that
# only has to read from street level.
#   - a far ground plane and the two avenues continued out to the horizon
#   - a ring of generic mid-rise blocks around the window
#   - the dark mid-rise with stacked sign bands ~60 m up Songren (west side)
#     and the stepped white tower to the north-west, both seen in the panos
#   - the Xinyi planning district to the south: generic glass towers and a
#     simplified Taipei 101 at its real offset (~400 m W, ~780 m S)
# Lighting lives in the preview setup: a sky for the day renders, and a
# night pass that lights the lamp lenses, signs and windows.  The GLB is
# exported before either, so it carries daytime materials; night is a
# material switch for the sim (see README).

T101 = (-397.0, -780.0)            # Taipei 101 relative to the origin


def back_materials(M):
    M.update({
        'ground_far': mat("Far ground", (0.085, 0.086, 0.09, 1), rough=0.95),
        'bld_conc':   mat("Backdrop concrete", (0.50, 0.48, 0.45, 1), rough=0.85),
        'bld_tile':   mat("Backdrop tile warm", (0.45, 0.36, 0.28, 1), rough=0.70),
        'bld_white':  mat("Backdrop white", (0.72, 0.72, 0.70, 1), rough=0.60),
        'bld_dark':   mat("Backdrop charcoal", (0.10, 0.10, 0.11, 1), rough=0.50),
        'bld_win':    mat("Backdrop window band", (0.03, 0.04, 0.05, 1),
                          metallic=0.4, rough=0.15),
        'tower_glass': mat("Tower glass blue", (0.10, 0.20, 0.30, 1),
                           metallic=0.6, rough=0.08),
        'tower_green': mat("Tower glass green", (0.12, 0.28, 0.26, 1),
                           metallic=0.6, rough=0.08),
        't101':       mat("Taipei 101 glass", (0.16, 0.30, 0.28, 1),
                          metallic=0.6, rough=0.10),
    })


def banded_block(B, rng, x0, y0, x1, y1, h, body, win_m, fh=3.4, gf=4.5):
    """A box with a dark window band on every floor."""
    B.box(body, x0, y0, 0, x1, y1, h)
    z = gf
    while z + 2.0 < h - 1.0:
        B.box(win_m, x0 - 0.05, y0 - 0.05, z + 0.9, x1 + 0.05, y1 + 0.05, z + 2.4)
        z += fh
    B.box(body, x0 - 0.2, y0 - 0.2, h - 0.8, x1 + 0.2, y1 + 0.2, h)


def square_frustum(k, m, cx, cy, z0, z1, side0, side1):
    """Axis-aligned square frustum (create_cone with 4 segments, turned 45)."""
    mx = (Matrix.Translation((cx, cy, (z0 + z1) / 2)) @
          Matrix.Rotation(math.radians(45), 4, 'Z'))
    res = bmesh.ops.create_cone(k.bm, cap_ends=True, cap_tris=False, segments=4,
                                radius1=side0 / math.sqrt(2),
                                radius2=side1 / math.sqrt(2),
                                depth=z1 - z0, matrix=mx)
    k._assign(res['verts'], m)


def build_taipei101(M, g):
    k = Kit()
    cx, cy = T101
    gm, sm = M['t101'], M['bld_conc']
    k.box(sm, (cx + 40, cy + 10, 30), (150, 110, 60))          # mall podium
    square_frustum(k, gm, cx, cy, 0, 95, 62, 50)               # base pyramid
    z = 95.0
    for i in range(8):                                          # the 8 "bowls"
        square_frustum(k, gm, cx, cy, z, z + 30.0, 40, 47)
        k.box(sm, (cx, cy, z + 0.6), (41, 41, 1.2))
        z += 30.0
    square_frustum(k, gm, cx, cy, z, z + 30, 34, 22)            # crown
    square_frustum(k, gm, cx, cy, z + 30, z + 50, 16, 10)
    k.cyl(M['pole'], (cx, cy, z + 50), (cx, cy, 508.0), 1.6, 0.4, seg=8)
    ob = inst("Taipei 101 (simplified)", k.mesh("Taipei 101 simplified"),
              (0, 0, 0), parent=g)
    ob["kind"] = "landmark"


def build_backdrop(M, root):
    back_materials(M)
    font = load_font()
    g = group("S5 Backdrop", root)
    rng = random.Random(1015)

    # far ground just under the window, and the avenues carried on
    gk = Kit()
    gk.poly(M['ground_far'], [(-1500, -1500, -0.03), (1500, -1500, -0.03),
                              (1500, 1500, -0.03), (-1500, 1500, -0.03)])
    for x0_, y0_, x1_, y1_ in ((-SR_HW, Y1, SR_HW, 1500), (-SR_HW, -1500, SR_HW, Y0),
                               (X1, -ZX_HW, 1500, ZX_HW), (-1500, -ZX_HW, X0, ZX_HW)):
        gk.poly(M['asphalt'], [(x0_, y0_, -0.01), (x1_, y0_, -0.01),
                               (x1_, y1_, -0.01), (x0_, y1_, -0.01)])
    inst("Backdrop ground", gk.mesh("Backdrop ground"), (0, 0, 0), parent=g)

    # ring of generic blocks: 45 m cells out to ~420 m, avoiding the window
    # and the two avenue corridors; taller towards the Xinyi district (south)
    B = MBuf("Backdrop city blocks")
    bodies = [M['bld_conc'], M['bld_tile'], M['bld_white'], M['bld_conc']]
    cell = 45.0
    keep_clear = [(-34.0, 63.0), (-95.0, 62.0), (40, -540), (160, -150), (120, -420)]
    for i in range(-10, 11):
        for j in range(-10, 11):
            cx, cy = i * cell, j * cell
            if math.hypot(cx, cy) > 430:
                continue
            if X0 - 30 < cx < X1 + 30 and Y0 - 30 < cy < Y1 + 30:
                continue
            if abs(cx) < SR_HW + 20 or abs(cy) < ZX_HW + 20:
                continue
            if any(math.hypot(cx - kx, cy - ky) < 40 for kx, ky in keep_clear):
                continue
            w = rng.uniform(18, 34)
            d = rng.uniform(16, 32)
            south = max(0.0, -cy) / 400.0
            h = rng.uniform(12, 32) + south * rng.uniform(10, 70)
            ox, oy = rng.uniform(-5, 5), rng.uniform(-5, 5)
            banded_block(B, rng, cx + ox - w / 2, cy + oy - d / 2,
                         cx + ox + w / 2, cy + oy + d / 2, h,
                         rng.choice(bodies), M['bld_win'])
    B.emit(g)

    # mid-rise up Songren, west side: charcoal with stacked sign bands
    D = MBuf("Backdrop Songren mid-rise")
    x0, x1, y0, y1 = -46.0, -SR_HW - SR_WALK, Y1 + 12.0, Y1 + 34.0
    h = 5.0 + 12 * 3.4
    banded_block(D, rng, x0, y0, x1, y1, h, M['bld_dark'], M['tower_green'])
    for k, (zb, sc, word) in enumerate(((4.6, 'sg_white', "燒肉餐廳"),
                                        (7.9, 'sg_black', "美容中心"),
                                        (11.2, 'sg_white', "百貨商場"))):
        D.box(M[sc], x1, y0 + 1.0, zb, x1 + 0.4, y1 - 1.0, zb + 2.6)
        make_text(f"Backdrop mid-rise band {k + 1}", word, font, 1.5,
                  (x1 + 0.43, (y0 + y1) / 2, zb + 1.3), FACE_E,
                  M['sg_red' if sc == 'sg_white' else 'sg_yellow'],
                  extrude=0.01, spacing=1.2, parent=g)
    D.box(M['sg_white'], x1 - 1.6, y0 - 0.5, 15.0, x1 + 0.4, y0 + 0.3, h - 2.0)
    make_text("Backdrop mid-rise vertical sign", "\n".join("商業大樓"), font, 2.2,
              (x1 - 0.6, y0 - 0.53, (15.0 + h - 2.0) / 2), FACE_S, M['sg_blue'],
              extrude=0.01, parent=g)
    D.emit(g)

    # stepped white tower to the north-west: stacked boxes shifted floor-wise
    W = MBuf("Backdrop stepped tower NW")
    bx, by = -95.0, 62.0
    for f in range(14):
        z0 = f * 3.6
        off = 1.2 if (f // 2) % 2 else -1.2
        W.box(M['bld_white'], bx - 11 + off, by - 9, z0, bx + 11 + off, by + 9, z0 + 3.6)
        W.box(M['bld_win'], bx - 11.05 + off, by - 9.05, z0 + 0.9, bx + 11.05 + off,
              by + 9.05, z0 + 2.9)
    W.emit(g)

    # Xinyi district towers round Taipei 101 (generic glass slabs)
    X = MBuf("Backdrop Xinyi towers")
    for (tx, ty, w, d, h, m) in ((-250, -660, 40, 30, 180, 'tower_glass'),
                                 (-170, -720, 36, 36, 150, 'tower_green'),
                                 (-470, -620, 44, 34, 200, 'tower_glass'),
                                 (-320, -560, 38, 28, 140, 'tower_green'),
                                 (-90, -610, 34, 30, 120, 'tower_glass'),
                                 (40, -540, 30, 30, 160, 'tower_glass'),
                                 (-560, -760, 40, 40, 170, 'tower_green'),
                                 (-230, -880, 46, 30, 210, 'tower_glass'),
                                 (120, -420, 32, 28, 95, 'tower_green'),
                                 (160, -150, 30, 30, 110, 'tower_glass')):
        X.box(M[m], tx - w / 2, ty - d / 2, 0, tx + w / 2, ty + d / 2, h)
        X.box(M['bld_conc'], tx - w / 2 - 0.5, ty - d / 2 - 0.5, h,
              tx + w / 2 + 0.5, ty + d / 2 + 0.5, h + 3)
        z = 4.0
        while z < h - 2:                         # floor lines
            X.box(M['bld_conc'], tx - w / 2 - 0.1, ty - d / 2 - 0.1, z,
                  tx + w / 2 + 0.1, ty + d / 2 + 0.1, z + 0.35)
            z += 4.0
    X.emit(g)
    build_taipei101(M, g)
    return g


# ------------------------------------------------------------- night pass
def set_night(M, cam_parent=None):
    """Switch the preview scene to night: dark sky, lamps, signs, windows."""
    sc = bpy.context.scene
    nt = sc.world.node_tree
    for nd in list(nt.nodes):
        if nd.type == 'TEX_SKY':
            nt.nodes.remove(nd)
    bg = next(nd for nd in nt.nodes if nd.type == 'BACKGROUND')
    bg.inputs[0].default_value = (0.010, 0.014, 0.030, 1)
    bg.inputs[1].default_value = 1.0
    sun = bpy.data.objects.get("Sun")
    if sun:
        sun.data.energy = 0.08
        sun.data.color = (0.6, 0.7, 1.0)

    def glow(key, colour=None, strength=1.0):
        if key not in M:
            return
        b = next(nd for nd in M[key].node_tree.nodes if nd.type == 'BSDF_PRINCIPLED')
        c = colour or tuple(b.inputs["Base Color"].default_value)
        b.inputs["Emission Color"].default_value = c
        b.inputs["Emission Strength"].default_value = strength

    glow('lamp_lens', (1.0, 0.85, 0.6, 1), 40.0)
    for key in ('sg_yellow', 'sg_red', 'sg_green', 'sg_white', 'sg_blue',
                'sg_orange', 'name_blue'):
        glow(key, None, 2.5)
    glow('win', (1.0, 0.78, 0.50, 1), 0.9)
    glow('teal', (0.5, 0.9, 0.85, 1), 1.5)
    glow('curtain', (0.35, 0.55, 0.9, 1), 0.35)
    glow('bld_win', (1.0, 0.82, 0.55, 1), 0.30)
    glow('tower_glass', (0.5, 0.65, 0.9, 1), 0.5)
    glow('tower_green', (0.5, 0.85, 0.75, 1), 0.5)
    glow('t101', (0.5, 0.9, 0.8, 1), 1.2)
    glow('ceiling', (1.0, 0.92, 0.8, 1), 0.8)

    # pools of light under the street lamps (preview only, not exported)
    for ob in list(bpy.data.objects):
        if not ob.name.startswith("Street lamp ") or ob.type != 'MESH':
            continue
        heads = ([(2.4, 0, 9.6)] if "side-arm" in ob.data.name
                 else [(0, 2.8, 10.1), (0, -2.8, 10.1)])
        for i, hp in enumerate(heads):
            ld = bpy.data.lights.new(f"{ob.name} light {i}", 'SPOT')
            ld.energy = 9000
            ld.color = (1.0, 0.82, 0.58)
            ld.spot_size = math.radians(120)
            ld.spot_blend = 0.6
            ld.use_shadow = False               # 26 shadowed spots overflow EEVEE
            lo = bpy.data.objects.new(ld.name, ld)
            bpy.context.collection.objects.link(lo)
            lo.location = ob.matrix_world @ Vector(hp)
            lo.rotation_euler = (0, 0, 0)          # spots point down -Z


# ------------------------------------------------------------------ preview
def setup_preview():
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x, sc.render.resolution_y = 1600, 900
    try:
        sc.view_settings.view_transform = 'AgX'
    except TypeError:
        pass

    world = bpy.data.worlds.new("Preview sky")
    world.use_nodes = True
    nt = world.node_tree
    bg = next((nd for nd in nt.nodes if nd.type == 'BACKGROUND'), None)
    if bg is None:
        bg = nt.nodes.new('ShaderNodeBackground')
        out = next((nd for nd in nt.nodes if nd.type == 'OUTPUT_WORLD'), None) \
            or nt.nodes.new('ShaderNodeOutputWorld')
        nt.links.new(bg.outputs[0], out.inputs[0])
    bg.inputs[0].default_value = (0.55, 0.68, 0.85, 1)
    bg.inputs[1].default_value = 0.9
    if STAGE >= 5:
        # physical sky once there is a skyline to see against it
        try:
            sky = nt.nodes.new('ShaderNodeTexSky')
            sky.sky_type = 'NISHITA'
            sky.sun_elevation = math.radians(48)
            sky.sun_rotation = math.radians(145)
            sky.sun_disc = False
            nt.links.new(sky.outputs[0], bg.inputs[0])
            bg.inputs[1].default_value = 0.30
        except Exception as e:
            print("SKY fallback:", e)
    sc.world = world

    sd = bpy.data.lights.new("Sun", 'SUN')
    sd.energy = 4.2
    sd.angle = math.radians(1.5)
    sun = bpy.data.objects.new("Sun", sd)
    bpy.context.collection.objects.link(sun)
    # mid-morning sun from the south-east, matching the pano's shadows
    sun.rotation_euler = (math.radians(42), 0, math.radians(35))

    cam_d = bpy.data.cameras.new("Preview camera")
    cam_d.clip_end = 4000.0                 # the backdrop runs out past 1 km
    cam = bpy.data.objects.new("Preview camera", cam_d)
    bpy.context.collection.objects.link(cam)
    sc.camera = cam
    return cam


def aim(cam, loc, look, lens=24, ortho=None):
    cam.location = loc
    cam.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if ortho:
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = ortho
    else:
        cam.data.type = 'PERSP'
        cam.data.lens = lens


def look_heading(pos, heading_deg, dist=30.0, pitch_z=None):
    h = math.radians(heading_deg)
    x, y, z = pos
    return (x + dist * math.sin(h), y + dist * math.cos(h),
            z if pitch_z is None else pitch_z)


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDER ->", path)


# --------------------------------------------------------------------- main
BUILDERS = [
    (1, build_roads),
    (2, build_hq),
    (3, build_shophouses),
    (4, build_furniture),
    (5, build_backdrop),
]


def main():
    reset_scene()
    M = build_materials()
    root = group(SCENE_ROOT)
    for stage, fn in BUILDERS:
        if stage <= STAGE:
            fn(M, root)
    print("STAGE=", STAGE,
          "MESH_OBJECTS=", len([o for o in bpy.data.objects if o.type == 'MESH']))

    for d in ("assets", "preview", "blender"):
        os.makedirs(os.path.join(OUT_DIR, d), exist_ok=True)
    blend_path = os.path.join(OUT_DIR, "blender", "xinyi-street.blend")
    glb_path = os.path.join(OUT_DIR, "assets", "xinyi-street.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB',
                              export_apply=True, use_selection=False,
                              use_renderable=True, export_extras=True)
    print("GLB_BYTES=", os.path.getsize(glb_path))

    cam = setup_preview()
    tag = f"xinyi-street_s{STAGE}"
    prev = os.path.join(OUT_DIR, "preview")

    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = 1400
    aim(cam, (15.0, -35.0, 200.0), (15.0, -35.0, 0.0), ortho=152)
    render_to(os.path.join(prev, f"{tag}_plan.png"))
    sc.render.resolution_x, sc.render.resolution_y = 1600, 900

    aim(cam, (-55.0, -125.0, 70.0), (12.0, -28.0, 0.0), lens=28)
    render_to(os.path.join(prev, f"{tag}_aerial.png"))

    # same spot and headings as the Street View reference frames
    aim(cam, PANO, look_heading(PANO, 345, pitch_z=1.8), lens=16)
    render_to(os.path.join(prev, f"{tag}_pano_north.png"))
    aim(cam, PANO, look_heading(PANO, 195, pitch_z=1.8), lens=16)
    render_to(os.path.join(prev, f"{tag}_pano_south.png"))

    if STAGE >= 2:
        # the pano's first frame: looking at the HQ entrance, tilted up
        aim(cam, PANO, look_heading(PANO, 108, dist=20, pitch_z=9.0), lens=14)
        render_to(os.path.join(prev, f"{tag}_pano_hq.png"))
        # from across the intersection, north-west corner
        aim(cam, (-22.0, 24.0, 6.0), (48.0, -36.0, 24.0), lens=20)
        render_to(os.path.join(prev, f"{tag}_hq_nw.png"))
        # Zhongxiao-side pano 1KP1sE0eaTdTXJhZTZWxuQ, looking south-east
        zp = (47.0, -13.5, 2.45)
        aim(cam, zp, look_heading(zp, 150, dist=20, pitch_z=7.0), lens=14)
        render_to(os.path.join(prev, f"{tag}_pano_zhongxiao.png"))

    if STAGE >= 3:
        # same Zhongxiao pano, looking north across the road at the shophouses
        zp = (47.0, -13.5, 2.45)
        aim(cam, zp, look_heading(zp, 10, dist=30, pitch_z=6.0), lens=14)
        render_to(os.path.join(prev, f"{tag}_pano_north_row.png"))
        aim(cam, zp, look_heading(zp, 320, dist=30, pitch_z=8.0), lens=14)
        render_to(os.path.join(prev, f"{tag}_pano_nw_corner.png"))
        aim(cam, (105.0, -12.0, 38.0), (15.0, 30.0, 6.0), lens=24)
        render_to(os.path.join(prev, f"{tag}_aerial_north.png"))

    if STAGE >= 5:
        # from the NE corner looking south down Songren towards Taipei 101
        ne = (9.0, 31.0, 1.7)            # in the SB lanes, clear of the NB signal pole
        aim(cam, ne, look_heading(ne, 207, dist=200, pitch_z=40.0), lens=22)
        render_to(os.path.join(prev, f"{tag}_skyline_south.png"))
        aim(cam, (170.0, 150.0, 120.0), (-110.0, -330.0, 40.0), lens=24)
        render_to(os.path.join(prev, f"{tag}_aerial_wide.png"))
        # night pass
        set_night(M)
        aim(cam, (-55.0, -125.0, 70.0), (12.0, -28.0, 0.0), lens=28)
        render_to(os.path.join(prev, f"{tag}_night_aerial.png"))
        aim(cam, PANO, look_heading(PANO, 345, pitch_z=1.8), lens=16)
        render_to(os.path.join(prev, f"{tag}_night_pano_north.png"))
        zp = (47.0, -13.5, 2.45)
        aim(cam, zp, look_heading(zp, 10, dist=30, pitch_z=6.0), lens=14)
        render_to(os.path.join(prev, f"{tag}_night_north_row.png"))
        aim(cam, ne, look_heading(ne, 207, dist=200, pitch_z=40.0), lens=22)
        render_to(os.path.join(prev, f"{tag}_night_skyline_south.png"))


# Run only as the Blender entry script, so other scene builders (e.g.
# build_taipei_eoc.py) can import the helpers above without building this.
if __name__ == "__main__":
    main()
