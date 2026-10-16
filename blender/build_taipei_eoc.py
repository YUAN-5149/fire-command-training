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
DECK = (BW / 2, 16.0, 30.0)      # helipad centre x, y and side
PODIUM_H = GF + FH               # two-storey corner glazing and canopy
WING = (BW, 2.0, BW + 12.0, 34.0, 5)   # east wing x0, y0, x1, y1, storeys

STREET_Y = (-12.0, -4.0)         # 莊敬路423巷7弄
JUNCTION = (-14.0, -8.0)         # meets 391巷11弄 here
ALLEY_DIR = (-0.83, 0.55)        # 391巷11弄 runs off to the north-west
ALLEY_W = 8.0
LOT_WEST = -60.0                 # west edge of the parking lot
PLAZA_C = (60.0, 16.0)           # round fountain island
PLAZA_R = 5.0

# Taipei 101 relative to this origin
T101 = (-144.0, 603.0)

PANO_SW = (-17.0, -7.0, 2.45)    # 391巷11弄 pano sdqgtREbuiqXtSfjqymmAA
PANO_SE = (60.0, -7.0, 2.45)     # 423巷7弄 pano 1ZKh73tLCvz-JdIcN25Pxg


def eoc_materials(M):
    mat = X.mat
    M.update({
        'panel':      mat("EOC facade panel grey", (0.60, 0.60, 0.58, 1), rough=0.55),
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


def paired_windows(B, M, face, a, z0, z1, plane):
    """Two narrow windows side by side, centred on a 3.6 m bay at `a`."""
    for off in (-0.65, 0.65):
        c = a + off
        if face in ('S', 'N'):
            s = -1 if face == 'S' else 1
            B.box(M['win_g'], c - 0.5, plane - 0.03 * s, z0, c + 0.5, plane + 0.05 * s, z1)
            B.box(M['panel_dark'], c - 0.56, plane, z0 - 0.08, c + 0.56,
                  plane + 0.09 * s, z0)
        else:
            s = -1 if face == 'W' else 1
            B.box(M['win_g'], plane - 0.03 * s, c - 0.5, z0, plane + 0.05 * s, c + 0.5, z1)
            B.box(M['panel_dark'], plane, c - 0.56, z0 - 0.08, plane + 0.09 * s,
                  c + 0.56, z0)


def storey_z(f):
    return 0.0 if f == 0 else GF + (f - 1) * FH


# --------------------------------------------------------------- building
def build_building(M, g, font):
    B = X.MBuf("EOC building")
    P, D, St = M['panel'], M['panel_dark'], M['stone']
    B.box(P, 0, 0, 0, BW, BD, ROOF)
    B.box(P, -0.15, -0.15, ROOF, BW + 0.15, BD + 0.15, ROOF + 1.1)        # parapet
    B.box(St, -0.10, -0.10, 0, BW + 0.10, BD + 0.10, 0.6)                  # plinth
    for f in range(2, FLOORS):
        z = storey_z(f)
        B.box(P, -0.06, -0.06, z - 0.12, BW + 0.06, BD + 0.06, z + 0.12)   # floor line

    strip = (16.5, 18.5)                      # south stair strip
    balc = (24.0, 31.5)                       # south balcony stack
    corner_s, corner_w = 12.0, 14.0           # extent of the corner glazing
    for f in range(FLOORS):
        z = storey_z(f)
        s, h = (z + 1.1, z + 3.6) if f == 0 else (z + 0.95, z + 2.75)
        podium = f < 2
        for a in [x + 1.8 for x in range(0, int(BW - 1), 4)]:
            if podium and a < corner_s + 1.5:
                continue
            if strip[0] - 1.2 < a < strip[1] + 1.2 or balc[0] - 0.4 < a < balc[1] + 0.4:
                continue
            paired_windows(B, M, 'S', a, s, h, 0.0)
            paired_windows(B, M, 'N', a, s, h, BD)
        for a in [y + 1.8 for y in range(0, int(BD - 1), 4)]:
            if not (podium and a < corner_w + 1.5):
                paired_windows(B, M, 'W', a, s, h, 0.0)
            if not (f < WING[4] and WING[1] - 1 < a < WING[3] + 1):
                paired_windows(B, M, 'E', a, s, h, BW)

    # full-height green stair strip on the south face
    B.box(M['glass_grn'], strip[0], -0.10, 0.8, strip[1], 0.02, ROOF - 0.3)
    for z in range(2, int(ROOF), 2):
        B.box(D, strip[0], -0.14, z, strip[1], -0.10, z + 0.07)

    # ---- SW corner: dark stone pier, green curtain glass on both faces,
    # deep L canopy, the names in gilt
    B.box(St, -0.4, -0.4, 0, 2.4, 2.4, PODIUM_H + 0.2)                      # pier
    B.box(M['glass_grn'], 2.4, -0.12, 0.6, corner_s, 0.02, PODIUM_H - 0.4)
    B.box(M['glass_grn'], -0.12, 2.4, 0.6, 0.02, corner_w, PODIUM_H - 0.4)
    for k in range(7):
        x = 2.4 + k * (corner_s - 2.4) / 6
        B.box(D, x - 0.05, -0.18, 0.6, x + 0.05, -0.12, PODIUM_H - 0.4)
        y = 2.4 + k * (corner_w - 2.4) / 6
        B.box(D, -0.18, y - 0.05, 0.6, -0.12, y + 0.05, PODIUM_H - 0.4)
    for z in (2.8, GF + 0.1, GF + 2.0):
        B.box(D, 2.4, -0.18, z, corner_s, -0.12, z + 0.08)
        B.box(D, -0.18, 2.4, z, -0.12, corner_w, z + 0.08)
    B.box(St, -0.35, corner_w, 0, 0.0, corner_w + 1.6, PODIUM_H - 0.4)      # name pier
    ov = 3.2
    B.box(D, -ov, -ov, PODIUM_H, corner_s + 3.0, 0.0, PODIUM_H + 0.8)
    B.box(D, -ov, 0.0, PODIUM_H, 0.0, corner_w + 3.0, PODIUM_H + 0.8)
    for x0, y0, x1, y1 in ((-ov - 0.1, -ov - 0.1, corner_s + 3.1, -ov + 0.3),
                           (-ov - 0.1, -ov - 0.1, -ov + 0.3, corner_w + 3.1)):
        B.box(D, x0, y0, PODIUM_H + 0.8, x1, y1, PODIUM_H + 1.1)
    X.make_text("EOC name plate", "\n".join("臺北市災害應變中心"), font, 0.5,
                (-0.39, corner_w + 0.8, PODIUM_H / 2), X.FACE_W, M['gold'],
                extrude=0.01, parent=g)
    X.make_text("EOC corner plate land development", "\n".join("臺北市政府地政局土地開發總隊"),
                font, 0.36, (-0.44, 1.0, PODIUM_H / 2 + 0.2), X.FACE_W, M['gold'],
                extrude=0.01, parent=g)
    X.make_text("EOC corner plate land office", "\n".join("臺北市松山地政事務所"),
                font, 0.4, (1.0, -0.44, PODIUM_H / 2 + 0.2), X.FACE_S, M['gold'],
                extrude=0.01, parent=g)

    # ---- balcony stack over a louvred wall, east part of the south face
    for f in range(2, FLOORS):
        z = storey_z(f)
        B.box(D, balc[0], -1.9, z - 0.25, balc[1], 0.0, z)
        B.box(P, balc[0], -1.9, z, balc[1], -1.7, z + 1.1)
        B.box(P, balc[0], -1.9, z, balc[0] + 0.2, 0.0, z + 1.1)
        B.box(P, balc[1] - 0.2, -1.9, z, balc[1], 0.0, z + 1.1)
        B.box(M['win_g'], balc[0] + 0.6, -0.05, z + 0.1, balc[1] - 0.6, 0.02, z + 2.9)
    for k in range(14):
        z = 0.6 + k * 0.3
        B.box(M['louvre'], balc[0], -0.9, z, balc[1], -0.75, z + 0.15)
    for x in (balc[0], balc[1] - 0.25):
        B.box(D, x, -0.9, 0, x + 0.25, 0, PODIUM_H)

    ob = B.emit(g)
    ob["kind"] = "eoc"
    ob["floors"] = FLOORS + 1
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
    R.box(M['glass_grn'], t0, u0, ROOF, t1, u1, ROOF + TOP_H)
    for k in range(9):
        x = t0 + k * (t1 - t0) / 8
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


def build_site(M, g, font):
    rng = random.Random(1110)
    zw = X.CURB_H
    S = X.MBuf("EOC site ground")
    S.box(M['ground_far'], -2000, -2000, -0.12, 2000, 2000, -0.08)
    S.box(M['plot'], -150, -120, -0.05, 200, 200, 0.0)
    # 423巷7弄 with its yellow centre line and the sidewalk on the EOC side
    S.box(M['asphalt'], -150, STREET_Y[0], 0.0, 200, STREET_Y[1], 0.01)
    yc = (STREET_Y[0] + STREET_Y[1]) / 2
    S.box(M['yellow'], -150, yc - 0.06, 0.01, 200, yc + 0.06, 0.016)
    S.box(M['walk'], JUNCTION[0] + 4, STREET_Y[1], 0.0, 200, 0.0, zw)
    S.box(M['curb_red'], JUNCTION[0] + 4, STREET_Y[1], 0.0, 200, STREET_Y[1] + 0.2, zw + 0.01)
    S.box(M['walk'], -150, STREET_Y[0] - 3.0, 0.0, 200, STREET_Y[0], zw)
    # west driveway, hedge, east plaza, north service yard
    S.box(M['paving'], -9.0, 0.0, 0.0, 0.0, BD + 2, zw)
    S.box(M['hedge'], -9.6, 2.0, zw, -9.0, BD, zw + 1.1)
    S.box(M['paving'], BW, 0.0, 0.0, 78.0, 44.0, zw)
    S.box(M['paving'], 0.0, BD, 0.0, BW + 12, BD + 6, zw)
    S.emit(g)

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
    spots = [(x, -2.0) for x in range(42, 78, 6)]
    spots += [(x, 42.0) for x in range(44, 78, 7)]
    spots += [(76.0, y) for y in range(4, 40, 7)]
    spots += [(-9.3, y) for y in range(-1, int(BD), 10)]
    spots += [(x, BD + 4.0) for x in range(2, 48, 8)]
    for i, (x, y) in enumerate(spots, 1):
        X.inst(f"EOC tree {i:02d}", rng.choice(trees), (x, y, zw),
               rz=rng.uniform(0, math.tau), s=rng.uniform(0.6, 0.78), parent=gt)

    yb = X.Kit()
    for i in range(12):
        x = 44.0 + i * 1.0
        yb.box(M['bike_yel'], (x, -2.8, zw + 0.45), (0.18, 0.25, 0.9))
        yb.box(M['pole'], (x, -2.8, zw + 0.05), (0.5, 1.0, 0.1))
    X.inst("YouBike station", yb.mesh("YouBike station"), (0, 0, 0), parent=g)

    # neighbours
    N = X.MBuf("EOC neighbours")
    tins = ('sheet_blue', 'sheet_grey', 'mast_white', 'sg_green', 'sg_red', 'sg_orange')
    # dense walk-ups across 423巷7弄, coloured tin roofs on top
    for y0 in (STREET_Y[0] - 17.0, STREET_Y[0] - 40.0):
        x = -140.0
        while x < 190.0:
            w = rng.uniform(7, 13)
            h = rng.choice((12.5, 12.5, 15.8, 15.8, 19.1))
            X.banded_block(N, rng, x, y0, x + w - 0.3, y0 + 14.0, h,
                           rng.choice((M['bld_conc'], M['bld_tile'], M['bld_white'])),
                           M['bld_win'], fh=3.3, gf=3.6)
            N.box(M[rng.choice(tins)], x + 0.3, y0 + 1.5, h, x + w - 0.6, y0 + 13.0,
                  h + rng.uniform(2.0, 2.8))
            x += w
    # 世貿新城 towers to the north-west, across the alley
    for (x0, y0, w, d, h) in ((-100, 70, 20, 16, 46), (-75, 95, 20, 16, 46),
                              (-110, 105, 20, 16, 52), (-62, 125, 22, 16, 40)):
        X.banded_block(N, rng, x0, y0, x0 + w, y0 + d, h, M['bld_tile'], M['bld_win'],
                       fh=3.2)
    # walk-ups south-west of the alley
    for (x0, y0, w, d, h) in ((-50, -1, 14, 10, 15.8), (-72, 12, 14, 12, 19.1),
                              (-94, 26, 14, 12, 15.8)):
        X.banded_block(N, rng, x0, y0, x0 + w, y0 + d, h, M['bld_conc'], M['bld_win'],
                       fh=3.3, gf=3.6)
    # 信義國中: classroom blocks to the north-east, 4 storeys
    for (x0, y0, x1, y1) in ((52, 50, 110, 62), (52, 62, 64, 110), (98, 62, 110, 96),
                             (20, 70, 46, 82)):
        X.banded_block(N, rng, x0, y0, x1, y1, 15.5, M['school'], M['bld_win'],
                       fh=3.6, gf=3.8)
    N.emit(g)
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
                              export_extras=True)
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


if __name__ == "__main__":
    main()
