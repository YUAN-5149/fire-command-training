# -*- coding: utf-8 -*-
"""
臺北市災害應變中心 (Taipei City Emergency Operation Center)
莊敬路391巷11弄2號, 信義區三張里 - building and its immediate block.

Reference: Google Maps satellite view, Google Earth 3D views from the SW, SE
and NW, Street View panos sdqgtREbuiqXtSfjqymmAA (391巷11弄, SW corner) and
1ZKh73tLCvz-JdIcN25Pxg (423巷7弄, SE plaza), and a user 360 photo taken on
the rooftop helipad - all used only as a look reference.  Nothing is traced
or textured from the imagery; dimensions are estimates from the map scale
bar and window counts, so treat it as "reads right at scene distance", not
as survey data.

What it shows:
  - a 9-storey main block in light-grey panels, paired green-tinted windows
  - the SW corner: a big dark stone corner pier carrying the land office
    names, two storeys of green curtain glass on both faces, a deep dark
    L-shaped canopy, and the centre's own name on a pier facing the alley
    (the building is shared with 地政局土地開發總隊 and 松山地政事務所)
  - on the south face: a full-height green glazed stair strip and, east of
    it, cantilevered balconies stacked over a louvred wall
  - a 5-storey wing on the east side, its entrance facing the round
    fountain island of the drop-off plaza
  - a glazed top storey under the raised helipad deck over the south half of
    the roof: teal surface, white border and H, yellow ring and corner
    marks, "TAIPEI EOC" in red, orange edge lights, dark sloped safety net,
    red-and-white mast with antennas and windsock; plant on the north half
  - around it: the big parking lot between the building and the diagonal
    391巷11弄, the yellow box grid where it meets 423巷7弄, dense walk-ups
    with coloured tin roofs across the street, 信義國中 and its track to the
    north-east, the 世貿新城 towers to the north-west, and Taipei 101 at its
    real offset (~140 m W, ~600 m N)

Run:
  blender -b -P blender/build_taipei_eoc.py -- --outdir blender

Build space: +X = east, +Y = north, +Z = up, metres, origin at the south-west
corner of the main block.  The glTF exporter maps +Y to -Z (north = forward).

Exported node names the simulation can use:
  "EOC building"            main block (extras kind = eoc, floors = 10)
  "EOC east wing"           5-storey wing (extras kind = eoc, floors = 5)
  "EOC helipad deck"        landing surface (extras kind = helipad,
                            deck_height in metres)
  "EOC helipad edge lights" edge lights (material "Helipad edge light")
  "EOC windsock"            the sock itself, pivot on the mast
  "Parked car nn"           cars in the lot (extras kind = vehicle)
"""

import bpy
import bmesh
import math
import os
import random
import sys
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_xinyi_street as X                      # shared helpers

OUT_DIR = os.getcwd()
if "--outdir" in sys.argv:
    OUT_DIR = sys.argv[sys.argv.index("--outdir") + 1]

# ------------------------------------------------------------------ layout
BW, BD = 38.0, 56.0              # main block footprint (E-W, N-S)
GF, FH, FLOORS = 4.6, 3.6, 9     # ground storey, typical storey, storeys
ROOF = GF + (FLOORS - 1) * FH    # main roof (33.4 m)
TOP_H = 3.6                      # glazed top storey under the helipad
DECK_Z = ROOF + TOP_H + 1.0      # helipad surface (~38 m)
DECK = (BW / 2, 15.0, 30.0)      # helipad centre x, y and side (south edge over the facade)
PODIUM_H = GF + FH               # two-storey corner glazing and canopy
WING = (BW, 2.0, BW + 12.0, 34.0, 5)   # east wing x0, y0, x1, y1, storeys

STREET_Y = (-16.0, -8.0)         # 莊敬路423巷7弄 (8 m paved forecourt to the facade)
JUNCTION = (-14.0, -12.0)        # meets 391巷11弄 here
ALLEY_DIR = (-0.83, 0.55)        # 391巷11弄 runs off to the north-west
ALLEY_W = 8.0
LOT_WEST = -60.0                 # west edge of the parking lot
# basement car park ramp: sunken, two-way, along the west face, going down
# northward from the west driveway (Google Earth 3D / satellite)
RAMP_X = (-7.6, -0.8)
RAMP_Y = (22.0, 44.0, 50.0)      # top of slope, foot of slope, portal wall
RAMP_DEPTH = 3.8
PLAZA_C = (60.0, 16.0)           # round fountain island
PLAZA_R = 5.0

# Taipei 101 relative to this origin
T101 = (-144.0, 603.0)

PANO_SW = (-17.0, -11.0, 2.45)    # 391巷11弄 pano sdqgtREbuiqXtSfjqymmAA
PANO_SE = (60.0, -11.0, 2.45)    # 423巷7弄 pano 1ZKh73tLCvz-JdIcN25Pxg
PANO_USER = (2.0, -13.0, 2.45)   # 423巷7弄 pano BEmILZs0HgEJ8Wfi5HwXRQ (sent by the user)


def eoc_materials(M):
    mat = X.mat
    M.update({
        'panel':      mat("EOC facade tile grey", (0.66, 0.67, 0.66, 1), rough=0.45),
        'frame_w':    mat("EOC window frame white", (0.86, 0.86, 0.84, 1), rough=0.40),
        'win_lite':   mat("EOC window glass light", (0.30, 0.40, 0.38, 1),
                          metallic=0.35, rough=0.06),
        'glass_lite': mat("EOC curtain glass light green", (0.40, 0.58, 0.52, 1),
                          metallic=0.3, rough=0.06),
        'granite':    mat("EOC granite beige", (0.50, 0.47, 0.42, 1), rough=0.40),
        'louvre_beige': mat("EOC vent louvre beige", (0.55, 0.53, 0.48, 1), rough=0.55),
        'stone':      mat("EOC pier stone grey", (0.36, 0.36, 0.36, 1), rough=0.45),
        'panel_dark': mat("EOC frame dark grey", (0.10, 0.11, 0.12, 1),
                          metallic=0.5, rough=0.45),
        'win_g':      mat("EOC window glass green", (0.07, 0.17, 0.17, 1),
                          metallic=0.45, rough=0.08),
        'glass_grn':  mat("EOC curtain glass green", (0.12, 0.34, 0.32, 1),
                          metallic=0.5, rough=0.06),
        'louvre':     mat("EOC louvre grey", (0.30, 0.31, 0.32, 1), metallic=0.6, rough=0.4),
        'paving':     mat("Plaza paving", (0.30, 0.28, 0.25, 1), rough=0.80),
        'heli':       mat("Helipad surface teal", (0.06, 0.40, 0.30, 1), rough=0.55),
        'heli_white': mat("Helipad marking white", (0.85, 0.85, 0.83, 1), rough=0.55),
        'heli_yel':   mat("Helipad marking yellow", (0.85, 0.65, 0.05, 1), rough=0.55),
        'heli_red':   mat("Helipad lettering red", (0.65, 0.06, 0.04, 1), rough=0.55),
        'heli_light': mat("Helipad edge light", (0.95, 0.45, 0.08, 1), rough=0.30,
                          emis=(1.0, 0.45, 0.05, 1), emis_str=0.0),
        'net':        mat("Helipad safety net dark", (0.06, 0.06, 0.07, 1),
                          metallic=0.4, rough=0.6),
        'mast_red':   mat("Mast red", (0.62, 0.04, 0.03, 1), rough=0.45),
        'mast_white': mat("Mast white", (0.82, 0.82, 0.80, 1), rough=0.45),
        'sock':       mat("Windsock orange", (0.85, 0.30, 0.04, 1), rough=0.70),
        'water':      mat("Fountain water", (0.05, 0.12, 0.16, 1), rough=0.05),
        'school':     mat("School tile cream", (0.62, 0.58, 0.48, 1), rough=0.70),
        'track':      mat("Running track blue", (0.10, 0.25, 0.55, 1), rough=0.80),
        'field':      mat("Sports field", (0.30, 0.38, 0.18, 1), rough=0.95),
        'lot_line':   mat("Parking bay white", (0.80, 0.80, 0.78, 1), rough=0.6),
        'bike_yel':   mat("YouBike dock yellow", (0.85, 0.62, 0.05, 1), rough=0.45),
        'hedge':      mat("Hedge", (0.05, 0.14, 0.04, 1), rough=0.9),
    })


def eoc_window(B, M, face, a, z0, plane, w=1.7, h=1.25):
    """Small white-framed window with a 2x2 sash grid, centred at `a`, sill z0.
    Light green-grey reflective glass, as on the street-view facade."""
    s = {'S': -1, 'N': 1, 'W': -1, 'E': 1}[face]
    fr, t = M['frame_w'], 0.07
    a0, a1, z1 = a - w / 2, a + w / 2, z0 + h

    def bx(m, u0, n0, zz0, u1, n1, zz1):
        if face in 'SN':
            B.box(m, u0, min(plane + s * n0, plane + s * n1), zz0,
                  u1, max(plane + s * n0, plane + s * n1), zz1)
        else:
            B.box(m, min(plane + s * n0, plane + s * n1), u0, zz0,
                  max(plane + s * n0, plane + s * n1), u1, zz1)
    bx(M['win_lite'], a0, -0.06, z0, a1, 0.02, z1)
    bx(fr, a0 - t, 0.0, z0 - t, a1 + t, 0.06, z0)            # sill
    bx(fr, a0 - t, 0.0, z1, a1 + t, 0.06, z1 + t)            # head
    bx(fr, a0 - t, 0.0, z0, a0, 0.06, z1)                    # jambs
    bx(fr, a1, 0.0, z0, a1 + t, 0.06, z1)
    bx(fr, a - 0.03, 0.0, z0, a + 0.03, 0.05, z1)            # mullion
    bx(fr, a0, 0.0, z0 + h * 0.55, a1, 0.05, z0 + h * 0.55 + 0.05)   # transom


def paired_windows(B, M, face, a, z0, z1, plane):
    """One window per 3.6 m bay (kept under the old name for the wing)."""
    eoc_window(B, M, face, a, z0, plane)


def storey_z(f):
    return 0.0 if f == 0 else GF + (f - 1) * FH


# south face, west to east (street view BEmILZs0HgEJ8Wfi5HwXRQ)
SW_STEP = (11.5, 14.0)           # SW block one storey lower: x extent, y extent
LOGGIA = (11.5, 16.5)            # recessed balcony stack
GRANITE = (12.0, 17.5)           # granite block with the directory
ARCH = (18.5, 24.5, 3.6)         # arched steel canopy: x0, x1, depth
STRIP = (25.0, 27.0)             # green glass stair strip
WEDGE = (32.5, 36.5)             # small balconies with sloped soffits
VENT = (40.5, 43.5, -3.4, -0.4)  # louvred vent tower near the curb


def build_building(M, g, font):
    B = X.MBuf("EOC building")
    P, D, St = M['panel'], M['panel_dark'], M['stone']
    rng = random.Random(391)
    sx, sy = SW_STEP
    low = ROOF - FH
    # massing: SW block one storey lower than the rest
    B.box(P, sx, 0, 0, BW, BD, ROOF)
    B.box(P, 0, sy, 0, sx, BD, ROOF)
    B.box(P, 0, 0, 0, sx, sy, low)
    B.box(P, sx - 0.15, -0.15, ROOF, BW + 0.15, BD + 0.15, ROOF + 1.1)       # parapets
    B.box(P, -0.15, sy - 0.15, ROOF, sx, BD + 0.15, ROOF + 1.1)
    B.box(P, -0.15, -0.15, low, sx, sy, low + 1.1)
    B.box(M['granite'], -0.10, -0.10, 0, BW + 0.10, BD + 0.10, 0.5)          # plinth

    def top_at(face, a):
        if face == 'S' and a < sx:
            return low
        if face == 'W' and a < sy:
            return low
        return ROOF

    # windows on every face, one per bay, a few bays left blank
    skip_s = [(LOGGIA[0] - 0.6, LOGGIA[1] + 0.6), (STRIP[0] - 1.0, STRIP[1] + 1.0),
              (WEDGE[0] - 0.2, WEDGE[1] + 0.2)]
    for f in range(1, FLOORS):
        z = storey_z(f)
        for face, plane, length in (('S', 0.0, BW), ('N', BD, BW), ('W', 0.0, BD), ('E', BW, BD)):
            n = int(length // 3.6)
            for i in range(n):
                a = (i + 0.5) * length / n
                if z + 2.6 > top_at(face, a):
                    continue
                if f < 2 and ((face == 'S' and a < sx) or (face == 'W' and a < sy)):
                    continue                            # two-storey glazing there
                if face == 'S' and any(u0 < a < u1 for u0, u1 in skip_s):
                    continue
                if face == 'E' and f < WING[4] and WING[1] - 1 < a < WING[3] + 1:
                    continue
                if rng.random() < 0.18:
                    continue
                eoc_window(B, M, face, a, z + 1.05, plane)

    # ---- SW corner: two storeys of light-green curtain glass on both faces
    # under a thin, deep L canopy; a round dark column at the corner
    gz0, gz1 = 0.5, PODIUM_H - 0.3
    B.box(M['glass_lite'], 0.8, -0.05, gz0, sx, 0.02, gz1)
    B.box(M['glass_lite'], -0.05, 0.8, gz0, 0.02, sy, gz1)
    for k in range(8):
        x = 0.8 + k * (sx - 0.8) / 7
        B.box(M['alu'], x - 0.04, -0.12, gz0, x + 0.04, -0.05, gz1)
        y = 0.8 + k * (sy - 0.8) / 7
        B.box(M['alu'], -0.12, y - 0.04, gz0, -0.05, y + 0.04, gz1)
    for z in (1.6, 3.0, GF + 0.2, GF + 1.6, GF + 3.0):                   # green bands
        B.box(M['alu'], 0.8, -0.12, z, sx, -0.05, z + 0.08)
        B.box(M['alu'], -0.12, 0.8, z, -0.05, sy, z + 0.08)
    B.box(D, -0.3, -0.3, gz1, sx, 0.02, PODIUM_H)                       # head band
    B.box(D, -0.3, 0.02, gz1, 0.02, sy, PODIUM_H)
    # granite piers on the west face carrying the names
    for y0, y1 in ((4.4, 5.8), (9.2, 10.6), (sy, sy + 1.6)):
        B.box(St, -0.35, y0, 0, 0.0, y1, PODIUM_H - 0.3)
    ov = 3.4
    B.box(D, -ov, -ov, PODIUM_H + 0.15, sx + 2.5, 0.0, PODIUM_H + 0.45)    # canopy slab
    B.box(D, -ov, 0.0, PODIUM_H + 0.15, 0.0, sy + 2.5, PODIUM_H + 0.45)
    B.box(P, -ov + 0.1, -ov + 0.1, PODIUM_H + 0.1, sx + 2.4, 0.0, PODIUM_H + 0.15)   # soffit
    B.box(P, -ov + 0.1, 0.0, PODIUM_H + 0.1, -0.1, sy + 2.4, PODIUM_H + 0.15)
    for x0, y0, x1, y1 in ((-ov - 0.05, -ov - 0.05, sx + 2.55, -ov + 0.2),
                           (-ov - 0.05, -ov - 0.05, -ov + 0.2, sy + 2.55)):
        B.box(D, x0, y0, PODIUM_H - 0.2, x1, y1, PODIUM_H + 0.5)          # fascia
    k = X.Kit()
    k.cyl(D, (-0.6, -0.6, 0.0), (-0.6, -0.6, PODIUM_H + 0.15), 0.55, seg=24)
    X.inst("EOC corner column", k.mesh("EOC corner column"), (0, 0, 0), parent=g)
    X.make_text("EOC name plate", "\n".join("臺北市災害應變中心"), font, 0.5,
                (-0.39, sy + 0.8, PODIUM_H / 2), X.FACE_W, M['gold'],
                extrude=0.01, parent=g)
    X.make_text("EOC plate land development", "\n".join("臺北市政府地政局土地開發總隊"),
                font, 0.36, (-0.39, 5.1, PODIUM_H / 2), X.FACE_W, M['gold'],
                extrude=0.01, parent=g)
    X.make_text("EOC plate land office", "\n".join("臺北市松山地政事務所"),
                font, 0.42, (-0.39, 9.9, PODIUM_H / 2), X.FACE_W, M['gold'],
                extrude=0.01, parent=g)

    # ---- recessed loggias stacked up the south face, white solid parapets
    l0, l1 = LOGGIA
    for f in range(2, FLOORS):
        z = storey_z(f)
        B.box(M['win'], l0 + 0.3, -0.02, z + 0.1, l1 - 0.3, 0.03, z + FH - 0.5)
        B.box(P, l0, -1.3, z - 0.25, l1, 0.0, z + 0.05)                   # slab
        B.box(M['frame_w'], l0, -1.3, z + 0.05, l1, -1.15, z + 1.0)       # parapet
        B.box(M['alu'], l0, -1.32, z + 1.0, l1, -1.12, z + 1.06)          # rail
        for x in (l0, l1 - 0.2):
            B.box(P, x, -1.3, z + 0.05, x + 0.2, 0.0, z + 1.0)
    # wider first-floor balcony over the granite block
    B.box(P, l0 - 0.5, -1.8, GF - 0.25, l1 + 1.0, 0.0, GF + 0.05)
    B.box(M['frame_w'], l0 - 0.5, -1.8, GF + 0.05, l1 + 1.0, -1.65, GF + 1.0)
    for x in [l0 - 0.4 + i * 0.25 for i in range(int((l1 - l0 + 1.4) / 0.25))]:
        B.box(M['alu'], x, -1.78, GF + 1.0, x + 0.03, -1.75, GF + 1.25)

    # ---- granite block with the directory under a low canopy
    g0, g1 = GRANITE
    B.box(M['granite'], g0, -1.0, 0, g1, 0.0, 3.6)
    for i in range(3):
        x = g0 + 1.0 + i * 1.3
        B.box(D, x, -1.04, 1.0, x + 0.9, -1.0, 2.4)                      # directory plates
    B.box(M['win'], g1 + 0.1, -0.05, 0, ARCH[0] - 0.2, 0.02, 3.0)         # recessed door

    # ---- white arched steel canopy over the side door
    x0, x1, depth = ARCH
    xc, half = (x0 + x1) / 2, (x1 - x0) / 2
    rise, spring = 1.5, 2.8
    rad = (half ** 2 + rise ** 2) / (2 * rise)
    zc = spring + rise - rad
    seg = 12
    th0 = math.asin(half / rad)
    pts = [(xc + rad * math.sin(-th0 + 2 * th0 * i / seg),
            zc + rad * math.cos(-th0 + 2 * th0 * i / seg)) for i in range(seg + 1)]
    ka = X.Kit()
    for i in range(seg):
        (xa, za), (xb, zb) = pts[i], pts[i + 1]
        ka.poly(M['glass_lite'], [(xa, 0.0, za), (xb, 0.0, zb), (xb, -depth, zb), (xa, -depth, za)])
        for y in (-0.2, -depth / 2, -depth + 0.1):
            ka.cyl(M['frame_w'], (xa, y, za), (xb, y, zb), 0.06, seg=6)
    for y in (-depth / 2, -depth + 0.1):                                  # radial struts
        for i in range(0, seg + 1, 3):
            ka.cyl(M['frame_w'], (xc, y, spring - 0.2), (pts[i][0], y, pts[i][1]), 0.04, seg=6)
    for x in (x0 + 0.1, x1 - 0.1):
        ka.cyl(M['frame_w'], (x, -depth + 0.1, 0.0), (x, -depth + 0.1, spring), 0.08, seg=8)
    X.inst("EOC arched canopy", ka.mesh("EOC arched canopy"), (0, 0, 0), parent=g)

    # ---- green glass stair strip, two panes wide, 2F to the roof
    s0, s1 = STRIP
    B.box(M['glass_lite'], s0, -0.08, GF, s1, 0.02, ROOF - 0.4)
    xm = (s0 + s1) / 2
    B.box(M['frame_w'], xm - 0.03, -0.12, GF, xm + 0.03, -0.08, ROOF - 0.4)
    z = GF
    while z < ROOF - 0.5:
        B.box(M['frame_w'], s0, -0.12, z, s1, -0.08, z + 0.05)
        z += 0.9
    for x in (s0, s1 - 0.08):
        B.box(M['frame_w'], x, -0.12, GF, x + 0.08, -0.08, ROOF - 0.4)

    # ---- small balconies with sloped (wedge) soffits at the east end
    w0, w1 = WEDGE
    for f in range(1, FLOORS):
        z = storey_z(f)
        B.box(P, w0, -1.2, z - 0.1, w1, 0.0, z + 0.05)
        B.box(M['frame_w'], w0, -1.2, z + 0.05, w1, -1.05, z + 1.0)
        B.box(M['win'], w0 + 0.4, -0.02, z + 0.1, w1 - 0.4, 0.03, z + 2.4)
        B.raw(P, [(w0, 0.0, z - 0.1), (w1, 0.0, z - 0.1), (w1, -1.2, z - 0.1), (w0, -1.2, z - 0.1),
                  (w0, 0.0, z - 1.1), (w1, 0.0, z - 1.1)],
              [(0, 1, 2, 3), (4, 5, 1, 0), (3, 2, 5, 4), (0, 3, 4), (1, 5, 2)])

    ob = B.emit(g)
    ob["kind"] = "eoc"
    ob["floors"] = FLOORS + 1

    # ---- louvred vent tower near the curb, east of the building
    v = X.MBuf("EOC vent tower")
    vx0, vx1, vy0, vy1 = VENT
    v.box(M['granite'], vx0, vy0, 0, vx1, vy1, 0.6)
    v.box(D, vx0 + 0.15, vy0 + 0.15, 0.6, vx1 - 0.15, vy1 - 0.15, 4.0)
    for i in range(16):
        zz = 0.7 + i * 0.21
        v.box(M['louvre_beige'], vx0, vy0, zz, vx1, vy1, zz + 0.12)
    v.box(M['granite'], vx0 - 0.1, vy0 - 0.1, 4.0, vx1 + 0.1, vy1 + 0.1, 4.25)
    v.emit(g)
    return ob


def build_wing(M, g, font):
    x0, y0, x1, y1, n = WING
    W = X.MBuf("EOC east wing")
    P, D = M['panel'], M['panel_dark']
    top = GF + (n - 1) * FH
    W.box(P, x0, y0, 0, x1, y1, top)
    W.box(P, x0, y0 - 0.15, top, x1 + 0.15, y1 + 0.15, top + 1.0)
    for f in range(n):
        z = storey_z(f)
        s, h = (z + 1.1, z + 3.6) if f == 0 else (z + 0.95, z + 2.75)
        for a in [y + 1.8 for y in range(int(y0), int(y1 - 1), 4)]:
            if f == 0 and 14.0 < a < 22.0:
                continue
            paired_windows(W, M, 'E', a, s, h, x1)
        for a in (x0 + 2.6, x0 + 6.2, x0 + 9.8):
            paired_windows(W, M, 'S', a, s, h, y0)
            paired_windows(W, M, 'N', a, s, h, y1)
    # entrance facing the fountain island: glass doors, canopy, red sign
    W.box(M['win_g'], x1 - 0.02, 14.5, 0, x1 + 0.08, 21.5, 3.4)
    for y in (14.5, 16.25, 18.0, 19.75, 21.5):
        W.box(M['alu'], x1 + 0.08, y - 0.04, 0, x1 + 0.12, y + 0.04, 3.4)
    W.box(D, x1, 13.5, 3.6, x1 + 3.0, 22.5, 3.9)
    W.box(M['sg_red'], x1 + 0.02, 15.0, 4.0, x1 + 0.12, 21.0, 4.6)
    ob = W.emit(g)
    ob["kind"] = "eoc"
    ob["floors"] = n


# ----------------------------------------------------------- roof, helipad
def build_roof(M, g, font):
    R = X.MBuf("EOC top storey")
    D = M['panel_dark']
    hx, hy, side = DECK
    t0, t1 = hx - side / 2 + 1.5, hx + side / 2 - 1.5
    u0, u1 = hy - side / 2 + 1.5, hy + side / 2 - 1.5
    # glazed top storey on the main roof only (the SW block is a storey lower,
    # the deck cantilevers over it)
    sx, sy = SW_STEP
    R.box(M['glass_grn'], t0, sy, ROOF, t1, u1, ROOF + TOP_H)
    R.box(M['glass_grn'], sx + 0.5, u0, ROOF, t1, sy, ROOF + TOP_H)
    for k in range(9):
        x = t0 + k * (t1 - t0) / 8
        if x > sx + 0.5:
            R.box(D, x - 0.08, u0 - 0.1, ROOF, x + 0.08, u0, ROOF + TOP_H)
        R.box(D, x - 0.08, u1, ROOF, x + 0.08, u1 + 0.1, ROOF + TOP_H)
    R.box(D, hx - side / 2, hy - side / 2, DECK_Z - 0.6, hx + side / 2, hy + side / 2,
          DECK_Z - 0.05)
    # plant on the north half: AHUs, cooling towers, a stair/lift core
    rng = random.Random(77)
    R.box(M['panel'], 3.0, 33.0, ROOF, 9.0, 39.0, DECK_Z)                 # core
    for i in range(7):
        x = rng.uniform(11, 31)
        y = rng.uniform(35, 52)
        w, d, h = rng.uniform(2, 5), rng.uniform(2, 4), rng.uniform(1.4, 3.0)
        R.box(M[rng.choice(('panel', 'louvre', 'ac'))], x, y, ROOF, x + w, y + d, ROOF + h)
    R.emit(g)

    # landing surface and markings (one object, so the sim can find it)
    k = X.Kit()
    z = DECK_Z
    k.box(M['heli'], (hx, hy, z - 0.03), (side, side, 0.06))
    a = side / 2 - 1.5
    for (x0, y0, x1, y1) in ((-a, -a, a, -a + 0.5), (-a, a - 0.5, a, a),
                             (-a, -a, -a + 0.5, a), (a - 0.5, -a, a, a)):
        k.box(M['heli_white'], (hx + (x0 + x1) / 2, hy + (y0 + y1) / 2, z + 0.005),
              (x1 - x0, y1 - y0, 0.01))
    c = a - 1.6                                # yellow corner ticks
    for sx in (-1, 1):
        for sy in (-1, 1):
            k.box(M['heli_yel'], (hx + sx * (c - 1.0), hy + sy * c, z + 0.006), (2.4, 0.35, 0.01))
            k.box(M['heli_yel'], (hx + sx * c, hy + sy * (c - 1.0), z + 0.006), (0.35, 2.4, 0.01))
    seg, R1, R2 = 48, 6.5, 6.0                 # yellow touchdown ring
    for i in range(seg):
        a0, a1 = i * math.tau / seg, (i + 1) * math.tau / seg
        k.poly(M['heli_yel'], [(hx + R2 * math.cos(a0), hy + R2 * math.sin(a0), z + 0.007),
                               (hx + R1 * math.cos(a0), hy + R1 * math.sin(a0), z + 0.007),
                               (hx + R1 * math.cos(a1), hy + R1 * math.sin(a1), z + 0.007),
                               (hx + R2 * math.cos(a1), hy + R2 * math.sin(a1), z + 0.007)])
    for x0, x1, y0, y1 in ((-2.2, -1.4, -3.0, 3.0), (1.4, 2.2, -3.0, 3.0),
                           (-1.4, 1.4, -0.4, 0.4)):                  # the H
        k.box(M['heli_white'], (hx + (x0 + x1) / 2, hy + (y0 + y1) / 2, z + 0.008),
              (x1 - x0, y1 - y0, 0.012))
    deck = X.inst("EOC helipad deck", k.mesh("EOC helipad deck"), (0, 0, 0), parent=g)
    deck["kind"] = "helipad"
    deck["deck_height"] = round(DECK_Z, 2)
    for nm, yy, basis in (("north", hy + a - 2.6, X.FLAT),
                          ("south", hy - a + 2.6, Matrix(((-1, 0, 0), (0, -1, 0), (0, 0, 1))))):
        X.make_text(f"EOC helipad lettering {nm}", "TAIPEI EOC", font, 1.5,
                    (hx, yy, z + 0.012), basis, M['heli_red'], extrude=0.0,
                    spacing=1.1, parent=g)

    # dark sloped safety net round the deck
    n = X.Kit()
    s2, out, drop = side / 2, 1.6, 0.9
    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    inner = [(hx + sx * s2, hy + sy * s2, z - 0.05) for sx, sy in corners]
    outer = [(hx + sx * (s2 + out), hy + sy * (s2 + out), z - drop) for sx, sy in corners]
    for i in range(4):
        j = (i + 1) % 4
        n.poly(M['net'], [inner[i], inner[j], outer[j], outer[i]])
    X.inst("EOC helipad safety net", n.mesh("EOC helipad safety net"), (0, 0, 0), parent=g)

    lk = X.Kit()
    cnt = int(side // 3.0)
    for i in range(cnt + 1):
        t = -s2 + 0.3 + i * (side - 0.6) / cnt
        for (x, y) in ((hx + t, hy - s2 + 0.3), (hx + t, hy + s2 - 0.3),
                       (hx - s2 + 0.3, hy + t), (hx + s2 - 0.3, hy + t)):
            lk.box(M['heli_light'], (x, y, z + 0.12), (0.30, 0.30, 0.24))
    X.inst("EOC helipad edge lights", lk.mesh("EOC helipad edge lights"), (0, 0, 0),
           parent=g)

    # red-and-white mast just off the north-east corner of the deck
    mk = X.Kit()
    mx, my = hx + s2 - 2.0, hy + s2 + 2.0
    for i in range(10):
        mk.cyl(M['mast_red' if i % 2 == 0 else 'mast_white'],
               (mx, my, ROOF + i * 1.1), (mx, my, ROOF + (i + 1) * 1.1), 0.22, 0.18, seg=10)
    top = ROOF + 11.0
    mk.box(M['mast_white'], (mx, my, top - 1.2), (1.4, 0.2, 0.2))
    for dx in (-0.6, 0.6):
        mk.cyl(M['mast_white'], (mx + dx, my, top - 1.1), (mx + dx, my, top + 2.0), 0.05, seg=6)
    mk.box(M['panel'], (mx + 0.9, my, top - 3.0), (0.4, 0.6, 1.2))
    X.inst("EOC mast", mk.mesh("EOC mast"), (0, 0, 0), parent=g)
    sk = X.Kit()
    sk.cyl(M['sock'], (0, 0, 0), (2.4, 0, -0.5), 0.45, 0.15, seg=12)
    sock = X.inst("EOC windsock", sk.mesh("EOC windsock"), (mx, my, top - 0.4), parent=g)
    sock.rotation_euler = (0, 0, math.radians(200))


# ------------------------------------------------------------------- site
def car_mesh(M, colour, name):
    k = X.Kit()
    k.box(M[colour], (0, 0, 0.55), (1.8, 4.4, 0.7))
    k.box(M[colour], (0, -0.2, 1.15), (1.6, 2.4, 0.55))
    k.box(M['win'], (0, -0.2, 1.16), (1.62, 2.2, 0.45))
    for x in (-0.82, 0.82):
        for y in (-1.4, 1.4):
            k.cyl(M['sig_house'], (x - 0.12, y, 0.33), (x + 0.12, y, 0.33), 0.33, seg=10)
    return k.mesh(name)


def holed_box(B, m, rect, z0, z1, hole):
    """A flat slab over rect with a rectangular hole cut out (four boxes)."""
    x0, y0, x1, y1 = rect
    hx0, hy0, hx1, hy1 = hole
    B.box(m, x0, y0, z0, x1, hy0, z1)
    B.box(m, x0, hy1, z0, x1, y1, z1)
    B.box(m, x0, hy0, z0, hx0, hy1, z1)
    B.box(m, hx1, hy0, z0, x1, hy1, z1)


def build_ramp(M, g):
    """Sunken two-way ramp to the basement car park along the west face."""
    k = X.Kit()
    x0, x1 = RAMP_X
    y0, y1, y2 = RAMP_Y
    d = -RAMP_DEPTH
    zw = X.CURB_H
    # ramp floor: slope, then a level landing in front of the portal
    k.poly(M['asphalt'], [(x0, y0, zw), (x1, y0, zw), (x1, y1, d), (x0, y1, d)])
    k.poly(M['asphalt'], [(x0, y1, d), (x1, y1, d), (x1, y2, d), (x0, y2, d)])
    xc = (x0 + x1) / 2

    def on_slope(y):
        return zw + (d - zw) * min(max((y - y0) / (y1 - y0), 0.0), 1.0) + 0.02
    # dashed centre line and two painted arrows (down east lane, up west lane)
    for t in range(12):
        ya, yb = y0 + 2 + t * 4.0, y0 + 4 + t * 4.0
        if yb > y2 - 1:
            break
        k.poly(M['yellow'], [(xc - 0.06, ya, on_slope(ya)), (xc + 0.06, ya, on_slope(ya)),
                             (xc + 0.06, yb, on_slope(yb)), (xc - 0.06, yb, on_slope(yb))])
    for (ax, yy, sgn) in ((xc + 1.6, y0 + 9.0, 1), (xc - 1.6, y0 + 13.0, -1)):
        z = on_slope(yy)
        tip, base = yy + sgn * 1.4, yy - sgn * 1.4
        k.poly(M['white'], [(ax - 0.15, base, on_slope(base)), (ax + 0.15, base, on_slope(base)),
                            (ax + 0.15, yy, z), (ax - 0.15, yy, z)])
        k.poly(M['white'], [(ax - 0.55, yy, z), (ax + 0.55, yy, z), (ax, tip, on_slope(tip))])
    # retaining walls with a 1.1 m parapet, and the portal wall at the end
    top = zw + 1.1
    for (wx0, wx1) in ((x0 - 0.3, x0), (x1, x1 + 0.3)):
        k.box(M['stone'], ((wx0 + wx1) / 2, (y0 + y2) / 2, (d + top) / 2),
              (wx1 - wx0, y2 - y0, top - d))
    k.box(M['stone'], (xc, y2 + 0.2, (d + top) / 2), (x1 - x0 + 0.6, 0.4, top - d))
    k.box(M['win'], (xc, y2 - 0.01, d + 1.4), (x1 - x0 - 0.8, 0.04, 2.8))       # dark portal
    k.box(M['panel_dark'], (xc, y2 - 0.3, d + 3.0), (x1 - x0, 0.6, 0.4))        # header beam
    k.box(M['sg_yellow'], (xc, y2 - 0.62, d + 3.0), (2.6, 0.04, 0.32))         # clearance bar
    for xx in (x0 + 0.05, x1 - 0.05):                                          # handrails
        k.box(M['alu'], (xx, (y0 + y2) / 2, top + 0.05), (0.06, y2 - y0, 0.06))
    for yy in range(int(y0) + 6, int(y2), 6):                                  # wall lamps
        k.box(M['sg_white'], (x1 - 0.02, yy, on_slope(yy) + 2.2), (0.06, 0.8, 0.12))
    ob = X.inst("EOC basement ramp", k.mesh("EOC basement ramp"), (0, 0, 0), parent=g)
    ob["kind"] = "ramp"
    ob["depth"] = RAMP_DEPTH


# ------------------------------------------------------------- neighbours
class FaceFrame:
    """Boxes in a facade-local frame: u along the face from its left corner
    (seen from outside), n outward, z up."""

    def __init__(self, B, rect, side):
        self.B, (self.x0, self.y0, self.x1, self.y1), self.side = B, rect, side
        self.length = (self.x1 - self.x0) if side in 'SN' else (self.y1 - self.y0)

    def p(self, u, n):
        if self.side == 'S':
            return self.x0 + u, self.y0 - n
        if self.side == 'N':
            return self.x1 - u, self.y1 + n
        if self.side == 'W':
            return self.x0 - n, self.y1 - u
        return self.x1 + n, self.y0 + u

    def box(self, m, u0, n0, z0, u1, n1, z1):
        ax, ay = self.p(u0, n0)
        bx, by = self.p(u1, n1)
        self.B.box(m, min(ax, bx), min(ay, by), z0, max(ax, bx), max(ay, by), z1)


def apartment_block(M, g, name, rect, floors, rng, body=None, gf=3.8, fh=3.0,
                    balconies=True, shops=True, detail=True):
    """Taiwanese mid-rise apartment: tiled walls, framed windows, balconies
    with white cages, window AC units, rooftop stair room and water tanks."""
    B = X.MBuf(name)
    x0, y0, x1, y1 = rect
    body = body or M[rng.choice(('tile_cream', 'tile_beige', 'tile_white', 'bld_tile'))]
    top = gf + (floors - 1) * fh
    B.box(body, x0, y0, 0, x1, y1, top)
    B.box(M['frame'], x0 - 0.12, y0 - 0.12, top, x1 + 0.12, y1 + 0.12, top + 1.0)
    for side in 'SNWE':
        F = FaceFrame(B, rect, side)
        bays = max(1, int(F.length // 3.6))
        bw = F.length / bays
        long_face = F.length >= 12
        for f in range(1, floors):
            z = gf + (f - 1) * fh
            F.box(M['frame'], -0.05, 0.0, z - 0.1, F.length + 0.05, 0.1, z + 0.12)
            for i in range(bays):
                u0, u1 = i * bw + 0.5, (i + 1) * bw - 0.5
                if not long_face and i % 2:
                    continue
                if balconies and long_face and side in 'SN' and (i + f) % 3 == 0:
                    F.box(M['frame'], u0 - 0.2, 0.0, z - 0.05, u1 + 0.2, 1.2, z + 0.12)
                    F.box(M['win'], u0, -0.05, z + 0.12, u1, 0.02, z + 2.5)
                    step = 0.3 if detail else u1 - u0
                    for k in range(int((u1 - u0) / step) + 1):
                        uu = u0 + k * step
                        F.box(M['cage_white'], uu, 1.12, z + 0.12, uu + 0.03, 1.15, z + 2.4)
                    F.box(M['cage_white'], u0 - 0.2, 0.0, z + 2.4, u1 + 0.2, 1.2, z + 2.46)
                    continue
                s, h = z + 0.9, z + 2.3
                F.box(M['win'], u0, -0.04, s, u1, 0.03, h)
                F.box(M['win_frame'], u0 - 0.06, 0.0, s - 0.07, u1 + 0.06, 0.08, s)
                if not detail:
                    continue
                F.box(M['win_frame'], (u0 + u1) / 2 - 0.03, 0.03, s, (u0 + u1) / 2 + 0.03, 0.07, h)
                r = rng.random()
                if r < 0.35:                                   # iron window cage
                    cm = M[rng.choice(('cage_white', 'iron'))]
                    F.box(cm, u0 - 0.08, 0.0, h + 0.05, u1 + 0.08, 0.45, h + 0.1)
                    for k in range(int((u1 - u0) / 0.3) + 1):
                        uu = u0 + k * 0.3
                        F.box(cm, uu, 0.42, s - 0.1, uu + 0.025, 0.45, h + 0.05)
                elif r < 0.6:                                  # window AC unit
                    ua = rng.uniform(u0, max(u0 + 0.1, u1 - 0.8))
                    F.box(M['ac'], ua, 0.0, s - 0.6, ua + 0.75, 0.38, s - 0.05)
        # ground storey: shopfronts and shutters on the long faces
        if shops and long_face:
            for i in range(bays):
                u0, u1 = i * bw + 0.3, (i + 1) * bw - 0.3
                kind = rng.choice(('shutter', 'glass', 'glass'))
                F.box(M['shutter' if kind == 'shutter' else 'win'], u0, -0.03, 0.0, u1, 0.03,
                      gf - 0.9)
                if rng.random() < 0.6:
                    sc, _ = rng.choice(X.SIGN_COLOURS)
                    F.box(M[sc], u0, 0.0, gf - 0.85, u1, 0.25, gf - 0.1)
    # roof: stair room, water tanks, sometimes a tin shed
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    B.box(body, cx - 2.0, cy - 1.8, top, cx + 2.0, cy + 1.8, top + 2.8)
    for t in range(rng.randint(1, 3)):
        tx = rng.uniform(x0 + 1, x1 - 2)
        ty = rng.uniform(y0 + 1, y1 - 2)
        B.box(M['tank'], tx, ty, top + 0.4, tx + 1.0, ty + 1.0, top + 1.8)
    if rng.random() < 0.5:
        sh = M[rng.choice(('sheet_blue', 'sheet_grey', 'sheet_blue'))]
        sx = rng.uniform(x0 + 0.3, max(x0 + 0.4, x1 - 6))
        B.box(sh, sx, y0 + 0.3, top, min(x1 - 0.3, sx + rng.uniform(4, 9)), y1 - 0.3, top + 2.4)
    ob = B.emit(g)
    ob["kind"] = "apartment"
    ob["floors"] = floors
    return ob


def school_block(M, g, name, rect, floors, corridor_side, rng):
    """Classroom block: open corridor with a parapet on one long face,
    windows on the other."""
    B = X.MBuf(name)
    x0, y0, x1, y1 = rect
    body = M['school']
    fh = 3.6
    top = floors * fh
    B.box(body, x0, y0, 0, x1, y1, top)
    B.box(M['frame'], x0 - 0.1, y0 - 0.1, top, x1 + 0.1, y1 + 0.1, top + 1.0)
    F = FaceFrame(B, rect, corridor_side)
    for f in range(floors):
        z = f * fh
        F.box(M['frame'], 0, 0, z + fh - 0.25, F.length, 2.4, z + fh)        # slab
        F.box(body, 0, 2.2, z + fh, F.length, 2.4, z + fh + 1.1)             # parapet
        for u in range(0, int(F.length) + 1, 4):
            F.box(M['frame'], u, 2.1, z, u + 0.4, 2.4, z + fh)
        for u in range(1, int(F.length) - 2, 4):
            F.box(M['win'], u + 0.4, -0.03, z + 1.0, u + 3.0, 0.02, z + 2.6)
            F.box(M['shutter'], u + 3.1, -0.03, z, u + 3.7, 0.02, z + 2.4)    # door
    back = {'S': 'N', 'N': 'S', 'E': 'W', 'W': 'E'}[corridor_side]
    F = FaceFrame(B, rect, back)
    for f in range(floors):
        z = f * fh
        for u in range(1, int(F.length) - 2, 4):
            F.box(M['win'], u, -0.03, z + 1.0, u + 3.2, 0.03, z + 2.8)
            F.box(M['win_frame'], u - 0.05, 0.0, z + 0.94, u + 3.25, 0.08, z + 1.0)
    ob = B.emit(g)
    ob["kind"] = "school"
    ob["floors"] = floors
    return ob


def shop_row(M, font, parent, name, origin, heading, length, rng, floors=(2, 3, 3, 4)):
    """A row of arcaded shophouses from the street builder, placed in its own
    rotated frame: local +x runs along the street, the fronts face local -y."""
    # make_text keeps world coordinates, so build in an untransformed frame
    # and move the frame into place afterwards; signs are flat to save size
    grp = X.group(name, parent)
    X.FRONT_Y = 0.0
    make_text = X.make_text
    X.make_text = lambda *a, **kw: make_text(*a, **{**kw, 'extrude': 0.0})
    try:
        u, i = 0.0, 1
        while u < length - 4.0:
            w = rng.uniform(4.6, 8.0)
            X.build_shophouse(M, font, grp, f"{name} {i:02d}", u, w, rng.choice(floors), rng)
            u += w
            i += 1
    finally:
        X.make_text = make_text
    grp.location = (origin[0], origin[1], 0.0)
    grp.rotation_euler = (0.0, 0.0, math.radians(heading))
    return grp


def build_neighbours(M, g, font, rng):
    jx, jy = JUNCTION
    dx, dy = ALLEY_DIR
    nx, ny = dy, -dx
    hw = ALLEY_W / 2
    gn = X.group("EOC neighbours", g)
    # shophouses across 423巷7弄, fronts facing north onto the street
    front = STREET_Y[0] - 3.0
    shop_row(M, font, gn, "Shophouse 423 south", (190.0, front), 180.0, 330.0, rng)
    # the block behind them: older walk-ups, mostly roofs and backs
    x = -140.0
    while x < 190.0:
        w = rng.uniform(9, 15)
        apartment_block(M, gn, f"Walk-up south {int(x + 200):03d}",
                        (x, front - 46.0, x + w - 0.4, front - 32.0),
                        rng.choice((4, 5, 5, 6)), rng, shops=False, detail=False)
        x += w
    # shophouses on the SW side of 391巷11弄, facing north-east onto the alley:
    # the row frame runs up the alley (NW), so local -y (the fronts) is NE
    off = hw + 2.6
    start, length = 16.0, 110.0
    o = (jx - nx * off + dx * start, jy - ny * off + dy * start)
    shop_row(M, font, gn, "Shophouse alley SW", o, math.degrees(math.atan2(dy, dx)),
             length, rng, floors=(3, 4, 4, 5))
    # mid-rise apartments on the NE side of the alley, beyond the parking lot
    t0 = (LOT_WEST - jx) / dx + 4.0
    for t in (t0, t0 + 18.0, t0 + 36.0):
        cx = jx + nx * (hw + 9.0) + dx * (t + 7.0)
        cy = jy + ny * (hw + 9.0) + dy * (t + 7.0)
        apartment_block(M, gn, f"Apartment alley NE {int(t):03d}",
                        (cx - 7.5, cy - 6.0, cx + 7.5, cy + 6.0), rng.choice((7, 8)), rng)
    # 世貿新城 towers north of the parking lot
    for i, (x0, y0, w, d, fl) in enumerate(((-58, 70, 34, 15, 13), (-20, 74, 30, 15, 12),
                                            (-100, 64, 30, 15, 14), (-70, 100, 34, 15, 15)), 1):
        apartment_block(M, gn, f"World Trade Garden tower {i}", (x0, y0, x0 + w, y0 + d),
                        fl, rng, body=M['bld_tile'], shops=False, detail=i < 3)
    # 三張里活動中心 behind the EOC
    apartment_block(M, gn, "Sanzhang community centre", (6.0, BD + 8.0, 34.0, BD + 22.0), 3,
                    rng, body=M['tile_white'], balconies=False, shops=False)
    # 信義國中 classroom blocks round the court, corridors facing in
    for i, (rect, side) in enumerate((((52, 52, 112, 62), 'N'), ((52, 62, 62, 112), 'E'),
                                      ((102, 62, 112, 96), 'W'), ((14, 92, 46, 102), 'S')), 1):
        school_block(M, gn, f"Xinyi JHS block {i}", rect, 4, side, rng)
    # park strip east of the plaza: grass and dense trees
    P = X.MBuf("EOC park east")
    P.box(M['field'], 78.0, -1.0, 0.0, 100.0, 48.0, X.CURB_H + 0.05)
    P.emit(g)
    trees = [X.mesh_broadleaf(M, s) for s in (7, 8, 9)]
    gt = X.group("EOC park trees", g)
    for i in range(34):
        X.inst(f"Park tree {i:02d}", rng.choice(trees),
               (rng.uniform(80, 98), rng.uniform(1, 46), X.CURB_H + 0.05),
               rz=rng.uniform(0, math.tau), s=rng.uniform(0.75, 1.05), parent=gt)


def build_site(M, g, font):
    rng = random.Random(1110)
    zw = X.CURB_H
    S = X.MBuf("EOC site ground")
    hole = (RAMP_X[0] - 0.4, RAMP_Y[0], RAMP_X[1] + 0.4, RAMP_Y[2] + 0.4)
    holed_box(S, M['ground_far'], (-2000, -2000, 2000, 2000), -0.12, -0.08, hole)
    holed_box(S, M['plot'], (-150, -120, 200, 200), -0.05, 0.0, hole)
    # 423巷7弄 with its yellow centre line and the sidewalk on the EOC side
    S.box(M['asphalt'], -150, STREET_Y[0], 0.0, 200, STREET_Y[1], 0.01)
    yc = (STREET_Y[0] + STREET_Y[1]) / 2
    S.box(M['yellow'], -150, yc - 0.06, 0.01, 200, yc + 0.06, 0.016)
    S.box(M['walk'], JUNCTION[0] + 4, STREET_Y[1], 0.0, 200, 0.0, zw)
    S.box(M['curb_red'], JUNCTION[0] + 4, STREET_Y[1], 0.0, 200, STREET_Y[1] + 0.2, zw + 0.01)
    S.box(M['walk'], -150, STREET_Y[0] - 3.0, 0.0, 200, STREET_Y[0], zw)
    # west driveway, hedge, east plaza, north service yard
    holed_box(S, M['paving'], (-9.0, 0.0, 0.0, BD + 2), 0.0, zw, hole)
    S.box(M['hedge'], -9.6, 2.0, zw, -9.0, BD, zw + 1.1)
    S.box(M['paving'], BW, 0.0, 0.0, 78.0, 44.0, zw)
    S.box(M['paving'], 0.0, BD, 0.0, BW + 12, BD + 6, zw)
    S.emit(g)
    build_ramp(M, g)

    # 391巷11弄 running off north-west from the junction, and the parking lot
    k = X.Kit()
    jx, jy = JUNCTION
    dx, dy = ALLEY_DIR
    nx, ny = dy, -dx                           # unit normal, pointing north-east
    L, hw = 160.0, ALLEY_W / 2

    def strip(m, half, z):
        k.poly(m, [(jx - nx * half, jy - ny * half, z), (jx + nx * half, jy + ny * half, z),
                   (jx + nx * half + dx * L, jy + ny * half + dy * L, z),
                   (jx - nx * half + dx * L, jy - ny * half + dy * L, z)])
    strip(M['asphalt'], hw, 0.012)
    strip(M['yellow'], 0.06, 0.018)
    # the lot: bounded by the hedge, the alley's north-east kerb and LOT_WEST
    ex, ey = jx + nx * (hw + 3.0), jy + ny * (hw + 3.0)

    def kerb_y(x):                             # alley NE kerb, y at a given x
        return ey + (x - ex) / dx * dy
    k.poly(M['asphalt'], [(ex, ey, 0.02), (-10.0, ey, 0.02), (-10.0, BD + 4, 0.02),
                          (LOT_WEST, BD + 4, 0.02), (LOT_WEST, kerb_y(LOT_WEST), 0.02)])
    X.inst("EOC alley and parking lot", k.mesh("EOC alley and parking lot"), (0, 0, 0), parent=g)
    X.build_box_grid(M, g, jx - 6, jx + 6, STREET_Y[0] + 0.3, STREET_Y[1] - 0.3, step=2.0)

    # parked cars in rows across the lot
    cars = [car_mesh(M, c, f"Parked car {c}") for c in
            ('sg_white', 'sg_white', 'sg_black', 'cab_grey', 'sg_red', 'sg_blue')]
    gc = X.group("EOC parked cars", g)
    lines = X.MBuf("EOC parking bays")
    n = 0
    for row_x in (-16.0, -24.0, -32.0, -40.0, -48.0, -56.0):
        y = 4.0
        while y < BD:
            if kerb_y(row_x - 2.6) > y - 1.2:      # still south of the kerb line
                y += 2.5
                continue
            lines.box(M['lot_line'], row_x - 2.6, y - 1.25, 0.02, row_x + 2.6, y - 1.13, 0.03)
            if rng.random() < 0.8:
                n += 1
                ob = X.inst(f"Parked car {n:02d}", rng.choice(cars),
                            (row_x, y, 0.02), rz=math.radians(90 + rng.choice((0, 180))),
                            parent=gc)
                ob["kind"] = "vehicle"
            y += 2.5
    lines.emit(g)

    # round fountain island on the drop-off plaza
    fx, fy = PLAZA_C
    wk = X.Kit()
    wk.cyl(M['mast_white'], (fx, fy, zw), (fx, fy, zw + 0.55), PLAZA_R, seg=40)
    wk.cyl(M['water'], (fx, fy, zw), (fx, fy, zw + 0.6), PLAZA_R - 0.35, seg=40)
    wk.cyl(M['mast_white'], (fx, fy, zw), (fx, fy, zw + 1.0), 1.0, 0.8, seg=20)
    X.inst("EOC fountain", wk.mesh("EOC fountain"), (0, 0, 0), parent=g)

    # trees
    trees = [X.mesh_broadleaf(M, s) for s in (4, 5, 6)]
    gt = X.group("EOC trees", g)
    curb = STREET_Y[1] + 0.9
    spots = [(x, curb) for x in range(2, 78, 7)]
    spots += [(x, 42.0) for x in range(44, 78, 7)]
    spots += [(76.0, y) for y in range(4, 40, 7)]
    spots += [(-9.3, y) for y in range(-1, int(BD), 10)]
    spots += [(x, BD + 4.0) for x in range(2, 48, 8)]
    for i, (x, y) in enumerate(spots, 1):
        X.inst(f"EOC tree {i:02d}", rng.choice(trees), (x, y, zw),
               rz=rng.uniform(0, math.tau), s=rng.uniform(0.6, 0.78), parent=gt)

    yb = X.Kit()
    for i in range(12):
        x = 26.0 + i * 1.1
        yb.box(M['bike_yel'], (x, curb + 0.9, zw + 0.45), (0.18, 0.25, 0.9))
        yb.box(M['pole'], (x, curb + 0.9, zw + 0.05), (0.5, 1.0, 0.1))
    X.inst("YouBike station", yb.mesh("YouBike station"), (0, 0, 0), parent=g)

    # street lamps along the curb, arms over the road
    lamp = X.mesh_side_lamp(M)
    gl = X.group("EOC street lamps", g)
    for i, x in enumerate(range(-4, 80, 24), 1):
        X.inst(f"Street lamp {i:02d}", lamp, (x + 3.5, STREET_Y[1] + 0.5, zw),
               rz=math.radians(-90), s=0.85, parent=gl)
    # box hedges in front of the corner glazing, low shrub beds further east
    H = X.MBuf("EOC hedges")
    H.box(M['granite'], 1.0, -2.6, zw, SW_STEP[0], -1.3, zw + 0.45)
    H.box(M['hedge'], 1.1, -2.5, zw + 0.45, SW_STEP[0] - 0.1, -1.4, zw + 1.15)
    H.box(M['hedge'], -2.6, 1.0, zw, -1.4, SW_STEP[1] - 1.0, zw + 1.0)
    for x0, x1 in ((ARCH[1] + 0.5, STRIP[0] + 4.0), (STRIP[0] + 5.0, BW - 1.0)):
        H.box(M['granite'], x0, -1.8, zw, x1, -0.4, zw + 0.3)
        H.box(M['hedge'], x0 + 0.1, -1.7, zw + 0.3, x1 - 0.1, -0.5, zw + 0.75)
    H.emit(g)

    # SW-side sidewalk of the alley, where the shophouse row stands
    k2 = X.Kit()
    h0, h1 = hw, hw + 2.6
    k2.poly(M['walk'], [(jx - nx * h0, jy - ny * h0, zw), (jx - nx * h1, jy - ny * h1, zw),
                        (jx - nx * h1 + dx * L, jy - ny * h1 + dy * L, zw),
                        (jx - nx * h0 + dx * L, jy - ny * h0 + dy * L, zw)])
    X.inst("Alley SW sidewalk", k2.mesh("Alley SW sidewalk"), (0, 0, 0), parent=g)
    build_neighbours(M, g, font, rng)
    # the school track and field
    tk = X.Kit()
    cx, cy, a, b = 140.0, 100.0, 40.0, 24.0
    seg = 48

    def p(r, t):
        return (cx + (a - 10 + r) * math.cos(t), cy + (b - 10 + r) * math.sin(t))
    for i in range(seg):
        a0, a1 = i * math.tau / seg, (i + 1) * math.tau / seg
        q = [p(10, a0), p(10, a1), p(0, a1), p(0, a0)]
        tk.poly(M['track'], [(x, y, 0.03) for x, y in q])
        tk.poly(M['field'], [(cx, cy, 0.035), (*p(0, a0), 0.035), (*p(0, a1), 0.035)])
    X.inst("Xinyi JHS track", tk.mesh("Xinyi JHS track"), (0, 0, 0), parent=g)


def main():
    X.reset_scene()
    M = X.build_materials()
    for fn in (X.hq_materials, X.shop_materials, X.furn_materials,
               X.back_materials, eoc_materials):
        fn(M)
    font = X.load_font()
    root = X.group("Taipei EOC")
    build_building(M, root, font)
    build_wing(M, root, font)
    build_roof(M, root, font)
    build_site(M, root, font)
    gb = X.group("EOC backdrop", root)
    X.T101 = T101
    X.build_taipei101(M, gb)
    print("MESH_OBJECTS=", len([o for o in bpy.data.objects if o.type == 'MESH']))

    for d in ("assets", "preview", "blender"):
        os.makedirs(os.path.join(OUT_DIR, d), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, "blender", "taipei-eoc.blend"))
    glb = os.path.join(OUT_DIR, "assets", "taipei-eoc.glb")
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True,
                              use_selection=False, use_renderable=True,
                              export_extras=True,
                              export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=14,
                              export_draco_normal_quantization=10,
                              export_draco_texcoord_quantization=10)
    print("GLB_BYTES=", os.path.getsize(glb))

    X.STAGE = 5                                   # physical sky in the previews
    cam = X.setup_preview()
    prev = os.path.join(OUT_DIR, "preview")
    tag = "taipei-eoc"
    aim, look, render = X.aim, X.look_heading, X.render_to

    aim(cam, PANO_SW, look(PANO_SW, 30, dist=40, pitch_z=16.0), lens=14)
    render(os.path.join(prev, f"{tag}_pano_sw.png"))
    aim(cam, PANO_SE, look(PANO_SE, 330, dist=40, pitch_z=12.0), lens=14)
    render(os.path.join(prev, f"{tag}_pano_se.png"))
    # obliques like the Google Earth reference views
    aim(cam, (-75.0, -90.0, 95.0), (22.0, 26.0, 12.0), lens=26)
    render(os.path.join(prev, f"{tag}_aerial_sw.png"))
    aim(cam, (110.0, -80.0, 85.0), (24.0, 24.0, 12.0), lens=26)
    render(os.path.join(prev, f"{tag}_aerial_se.png"))
    hx, hy, _ = DECK
    aim(cam, (hx - 24.0, hy + 46.0, DECK_Z + 20.0), (hx, hy, DECK_Z), lens=22)
    render(os.path.join(prev, f"{tag}_helipad.png"))
    aim(cam, (-14.0, 10.0, 7.0), (-4.0, RAMP_Y[2], -1.5), lens=20)
    render(os.path.join(prev, f"{tag}_ramp.png"))
    aim(cam, PANO_USER, look(PANO_USER, 15, dist=40, pitch_z=20.0), lens=14)
    render(os.path.join(prev, f"{tag}_pano_user_n.png"))
    aim(cam, PANO_USER, look(PANO_USER, 45, dist=40, pitch_z=6.0), lens=16)
    render(os.path.join(prev, f"{tag}_pano_user_ne.png"))


if __name__ == "__main__":
    main()
