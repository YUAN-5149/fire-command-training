# -*- coding: utf-8 -*-
"""
信義區逐車道路面（第一階段）：把 dist/assets/lanes-xinyi.json（scripts/build-lanes.mjs 用
osm2streets 由 OSM 產生）建成 Blender 網格：車道、路肩、人行道、自行車道、路口、
中線、車道線、箭頭、停止線，每類一個物件、一種材質。

  blender -b -P blender/build_xinyi_lanes.py -- --repo <repo> [--center LON,LAT --radius M]

不帶 --center 時建整個信義範圍（約 1 x 1.7 km）；帶 --center/--radius 時只建該圓內
（分區渲染用）。輸出：
  <repo>/assets/xinyi-lanes.glb            （Draco 壓縮）
  <repo>/preview/xinyi-lanes_*.png         （整區、消防局路口、應變中心）
  <repo>/blender/xinyi-lanes.blend

座標：資料為 x 東、z 南（公尺，原點 XINYI_ORIGIN 121.5654, 25.0338）；Blender 用
x 東、y 北，所以 y = -z。路面平鋪在 z≈0（不含地形起伏），人行道略高以表現路緣。
寬度與標線依 OSM 標記推定，非實測。
"""

import bpy
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_xinyi_street as X                      # materials, preview camera, render

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default

REPO = arg("--repo", os.getcwd())
ORIGIN = (121.5654, 25.0338)
LAT_M = 110574.0
LON_M = 111320.0 * math.cos(math.radians(ORIGIN[1]))

# 每類：(顏色, 離地高度 m, 粗糙度)
STYLE = {
    'Driving': ((0.045, 0.048, 0.052, 1), 0.00, 0.92), 'Bus': ((0.30, 0.09, 0.07, 1), 0.002, 0.9),
    'Shoulder': ((0.08, 0.085, 0.09, 1), 0.00, 0.92), 'Construction': ((0.20, 0.16, 0.08, 1), 0.0, 0.9),
    'Biking': ((0.10, 0.20, 0.09, 1), 0.004, 0.9), 'SharedUse': ((0.30, 0.29, 0.20, 1), 0.10, 0.85),
    'Sidewalk': ((0.36, 0.33, 0.29, 1), 0.10, 0.85), 'Footway': ((0.42, 0.38, 0.32, 1), 0.10, 0.85),
    'intersection': ((0.042, 0.045, 0.049, 1), -0.002, 0.92), 'corner': ((0.36, 0.33, 0.29, 1), 0.10, 0.85),
    'center': ((0.80, 0.55, 0.04, 1), 0.012, 0.6), 'separator': ((0.85, 0.85, 0.83, 1), 0.012, 0.6),
    'arrow': ((0.85, 0.85, 0.83, 1), 0.013, 0.6), 'stop': ((0.85, 0.85, 0.83, 1), 0.013, 0.6),
    'buffer': ((0.85, 0.85, 0.83, 1), 0.012, 0.6), 'bike': ((0.85, 0.85, 0.83, 1), 0.012, 0.6),
}


def to_local(lon, lat):
    return (lon - ORIGIN[0]) * LON_M, (lat - ORIGIN[1]) * LAT_M      # x east, y north


def build(data, centre=None, radius=None):
    groups = dict(data['lanes'])
    groups['intersection'] = data['intersections']
    groups['corner'] = data['corners']
    groups.update(data['markings'])
    root = X.group("Xinyi lanes (osm2streets)")
    total = 0
    for kind, rings in groups.items():
        if not rings:
            continue
        colour, lift, rough = STYLE.get(kind, ((0.3, 0.3, 0.3, 1), 0.0, 0.9))
        m = X.mat(f"Lane {kind}", colour, rough=rough)
        verts, faces = [], []
        for r in rings:
            pts = [(r[i], -r[i + 1]) for i in range(0, len(r), 2)]
            if centre:
                cx = sum(p[0] for p in pts) / len(pts)
                cy = sum(p[1] for p in pts) / len(pts)
                if math.hypot(cx - centre[0], cy - centre[1]) > radius:
                    continue
            i0 = len(verts)
            verts += [(x, y, lift) for x, y in pts]
            # 環向統一成逆時針（Blender 法線朝上）
            area = sum(pts[k][0] * pts[(k + 1) % len(pts)][1] - pts[(k + 1) % len(pts)][0] * pts[k][1]
                       for k in range(len(pts)))
            idx = list(range(i0, i0 + len(pts)))
            faces.append(tuple(idx if area > 0 else idx[::-1]))
        if not faces:
            continue
        ob = X.new_obj(f"Lanes {kind}", verts, faces, [m], parent=root)
        ob["kind"] = "lane" if kind[0].isupper() else ("junction" if kind in ('intersection', 'corner') else "marking")
        total += len(faces)
    return root, total


def main():
    X.reset_scene()
    X.build_materials()
    data = json.load(open(os.path.join(REPO, "dist", "assets", "lanes-xinyi.json"), encoding="utf-8"))
    centre = radius = None
    if arg("--center"):
        lon, lat = (float(v) for v in arg("--center").split(","))
        centre, radius = to_local(lon, lat), float(arg("--radius", "300"))
    root, n = build(data, centre, radius)
    print("LANE_FACES=", n)
    # 地面：灰綠色大平面，讓路面有對比
    ground = X.mat("Lane ground", (0.05, 0.06, 0.05, 1), rough=1.0)
    X.new_obj("Lanes ground", [(-1200, -1200, -0.06), (1200, -1200, -0.06), (1200, 1200, -0.06), (-1200, 1200, -0.06)],
              [(0, 1, 2, 3)], [ground], parent=root)

    for d in ("assets", "preview", "blender"):
        os.makedirs(os.path.join(REPO, d), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(REPO, "blender", "xinyi-lanes.blend"))
    glb = os.path.join(REPO, "assets", "xinyi-lanes.glb")
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True, export_extras=True,
                              export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=6)
    print("GLB_BYTES=", os.path.getsize(glb))

    X.STAGE = 5
    cam = X.setup_preview()
    prev = os.path.join(REPO, "preview")
    hq = to_local(121.5687101, 25.0411021)           # 松仁路 x 忠孝東路五段
    eoc = to_local(121.5661, 25.0290)                # 臺北市災害應變中心
    shots = [("hq_junction", (hq[0] - 70, hq[1] - 90, 110), (hq[0], hq[1], 0), 30),
             ("eoc", (eoc[0] - 90, eoc[1] - 110, 140), (eoc[0], eoc[1], 0), 30)]
    if not centre:
        shots.append(("overview", (60, -560, 520), (60, -120, 0), 22))
    for name, loc, look, lens in shots:
        X.aim(cam, loc, look, lens=lens)
        cam.data.clip_end = 5000
        X.render_to(os.path.join(prev, f"xinyi-lanes_{name}.png"))


# 只在直接執行時建場景；build_xinyi_district.py 會匯入 build()。
if __name__ == "__main__":
    main()
