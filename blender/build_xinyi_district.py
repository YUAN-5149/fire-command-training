# -*- coding: utf-8 -*-
"""
信義區第二階段：逐棟建物立面＋全區街道設施＋第一階段車道，建成 Blender 場景並渲染預覽。

  node scripts/export-scene-props.mjs <props.json>
  blender -b -P blender/build_xinyi_district.py -- --repo <repo> --props <props.json> [--center LON,LAT --radius M]

props.json 由網頁同一份邏輯（xinyi-facades.js、xinyi-furniture.js）輸出，Blender 端不重寫規則：
  建物：每種外觀分類一個物件，立面窗格、一樓店面與店招帶由節點依 UV（公尺）與每面的樓高屬性畫出
  小物件：冷氣、鐵窗、水塔、頂樓加蓋、直立招牌；街道設施：路燈、路樹、號誌、消防栓、公車亭、草地
輸出：
  <repo>/blender/assets/xinyi-district.glb   （Draco；不含整區時依 --center 裁切）
  <repo>/blender/preview/xinyi-district_*.png
  <repo>/blender/xinyi-district.blend
建物外觀分類依 OSM 與量體推定；窗戶不是實際救援開口，消防栓實際以消防局水源資料為準。
"""

import bpy
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_xinyi_street as X                      # materials, preview camera, render
import build_xinyi_lanes as L                       # 第一階段車道

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default

REPO = arg("--repo", os.getcwd())
PROPS = arg("--props")
# 外觀分類：(開間 m, 窗左右, 窗上下)；3 為玻璃帷幕，5、6 無窗
BAY = {0: (3.0, .17, .83, .30, .86), 1: (3.4, .12, .88, .28, .88), 2: (3.0, .10, .90, .20, .90),
       3: (1.5, .06, 1.0, .0, .86), 4: (7.2, .06, .96, .36, .82)}
ROOF = {0: (.21, .25, .22), 1: (.21, .23, .22), 2: (.20, .21, .22), 3: (.16, .18, .19), 4: (.25, .24, .20),
        5: (.27, .08, .05), 6: (.27, .28, .27)}


def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c) + (1.0,)


def facade_material(style):
    """窗格節點：fy = fract(v/樓高)、bx = fract(u/開間)，窗內換玻璃；一樓店面與店招帶看 shop 屬性。"""
    name = f"Facade style {style}"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = X.mat(name, (.6, .6, .6, 1), rough=.85)
    nt = m.node_tree
    N, Lk = nt.nodes, nt.links
    bsdf = next(n for n in N if n.type == 'BSDF_PRINCIPLED')
    col = N.new('ShaderNodeVertexColor'); col.layer_name = 'Col'
    if style not in BAY:
        Lk.new(col.outputs[0], bsdf.inputs['Base Color'])
        return m
    uv = N.new('ShaderNodeUVMap'); uv.uv_map = 'Facade'
    sep = N.new('ShaderNodeSeparateXYZ'); Lk.new(uv.outputs[0], sep.inputs[0])
    fh = N.new('ShaderNodeAttribute'); fh.attribute_type = 'GEOMETRY'; fh.attribute_name = 'floorh'
    shop = N.new('ShaderNodeAttribute'); shop.attribute_type = 'GEOMETRY'; shop.attribute_name = 'shop'

    def op(kind, a, b=None, clamp=False):
        n = N.new('ShaderNodeMath'); n.operation = kind; n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                Lk.new(v, n.inputs[i])
        return n.outputs[0]
    u, v, floor_h = sep.outputs[0], sep.outputs[1], fh.outputs['Fac']
    bay, x0, x1, y0, y1 = BAY[style]
    fy = op('FRACT', op('DIVIDE', v, floor_h))
    bx = op('FRACT', op('DIVIDE', u, bay))
    above = op('GREATER_THAN', v, floor_h)
    win = op('MULTIPLY', op('MULTIPLY', op('GREATER_THAN', bx, x0), op('LESS_THAN', bx, x1)),
             op('MULTIPLY', op('GREATER_THAN', fy, y0), op('LESS_THAN', fy, y1)))
    win = op('MULTIPLY', win, above)
    ground_v = op('DIVIDE', v, floor_h)
    is_shop = op('GREATER_THAN', shop.outputs['Fac'], .5)
    front = op('MULTIPLY', op('MULTIPLY', op('GREATER_THAN', ground_v, .06), op('LESS_THAN', ground_v, .72)), is_shop)
    band = op('MULTIPLY', op('MULTIPLY', op('GREATER_THAN', ground_v, .74), op('LESS_THAN', ground_v, .95)), is_shop)
    glass_mask = op('ADD', win, front, clamp=True)
    # 玻璃色：依窗格亂數深淺；店招：依店面段亂數取色
    noise = N.new('ShaderNodeTexWhiteNoise'); noise.noise_dimensions = '2D'
    comb = N.new('ShaderNodeCombineXYZ')
    Lk.new(op('FLOOR', op('DIVIDE', u, bay)), comb.inputs[0]); Lk.new(op('FLOOR', op('DIVIDE', v, floor_h)), comb.inputs[1])
    Lk.new(comb.outputs[0], noise.inputs['Vector'])
    gramp = N.new('ShaderNodeValToRGB')
    gramp.color_ramp.elements[0].color = (.015, .025, .035, 1); gramp.color_ramp.elements[1].color = (.09, .13, .16, 1)
    Lk.new(noise.outputs['Value'], gramp.inputs[0])
    snoise = N.new('ShaderNodeTexWhiteNoise'); snoise.noise_dimensions = '1D'
    Lk.new(op('FLOOR', op('DIVIDE', u, 4.5)), snoise.inputs['W'])
    sramp = N.new('ShaderNodeValToRGB'); sramp.color_ramp.interpolation = 'CONSTANT'
    cols = [(.7, .02, .02, 1), (.9, .55, .02, 1), (.9, .9, .85, 1), (.02, .12, .5, 1), (.01, .3, .08, 1)]
    sramp.color_ramp.elements[0].color = cols[0]; sramp.color_ramp.elements[1].position = .2; sramp.color_ramp.elements[1].color = cols[1]
    for i, c in enumerate(cols[2:]):
        e = sramp.color_ramp.elements.new(.4 + i * .2); e.color = c
    Lk.new(snoise.outputs['Value'], sramp.inputs[0])
    # 騎樓陰影：店面那層牆色壓暗
    dark = N.new('ShaderNodeMix'); dark.data_type = 'RGBA'; dark.blend_type = 'MULTIPLY'
    Lk.new(op('MULTIPLY', is_shop, op('LESS_THAN', ground_v, 1.0)), dark.inputs[0])
    Lk.new(col.outputs[0], dark.inputs[6]); dark.inputs[7].default_value = (.55, .55, .55, 1)
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    Lk.new(glass_mask, mix.inputs[0]); Lk.new(dark.outputs[2], mix.inputs[6]); Lk.new(gramp.outputs[0], mix.inputs[7])
    mix2 = N.new('ShaderNodeMix'); mix2.data_type = 'RGBA'
    Lk.new(band, mix2.inputs[0]); Lk.new(mix.outputs[2], mix2.inputs[6]); Lk.new(sramp.outputs[0], mix2.inputs[7])
    Lk.new(mix2.outputs[2], bsdf.inputs['Base Color'])
    rough = N.new('ShaderNodeMapRange'); rough.inputs['To Min'].default_value = .85; rough.inputs['To Max'].default_value = .12
    Lk.new(glass_mask, rough.inputs['Value']); Lk.new(rough.outputs[0], bsdf.inputs['Roughness'])
    return m


def colour_material(name, rough=.6, metal=0.0, alpha=1.0):
    m = X.mat(name, (.6, .6, .6, 1), rough=rough, metallic=metal)
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    col = nt.nodes.new('ShaderNodeVertexColor'); col.layer_name = 'Col'
    nt.links.new(col.outputs[0], bsdf.inputs['Base Color'])
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except AttributeError:
            m.blend_method = 'BLEND'
    return m


def mesh_with_attrs(name, verts, faces, corner_cols, mats, face_mats, parent, uvs=None, face_attrs=None):
    ob = X.new_obj(name, verts, faces, mats, face_mats, parent=parent)
    me = ob.data
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for i, c in enumerate(corner_cols):
        ca.data[i].color = c
    if uvs is not None:
        uvl = me.uv_layers.new(name='Facade')
        for i, t in enumerate(uvs):
            uvl.data[i].uv = t
    for key, values in (face_attrs or {}).items():
        at = me.attributes.new(key, 'FLOAT', 'FACE')
        at.data.foreach_set('value', values)
    return ob


def build_buildings(buildings, root, keep):
    by_style = {}
    for b in buildings:
        if keep(b):
            by_style.setdefault(b['style'], []).append(b)
    total = 0
    for style, items in sorted(by_style.items()):
        verts, faces, cols, uvs, fm, fh, shop = [], [], [], [], [], [], []
        roof_mat = X.mat(f"Roof style {style}", ROOF[style] + (1,), rough=.9)
        for b in items:
            c = srgb(b['colour'])
            for x0, y0, x1, y1, z0, h in b['walls']:
                w = math.hypot(x1 - x0, y1 - y0)
                if w < .05 or h < .05:
                    continue
                i = len(verts)
                verts += [(x0, y0, z0), (x1, y1, z0), (x1, y1, z0 + h), (x0, y0, z0 + h)]
                faces.append((i, i + 1, i + 2, i + 3))
                cols += [c] * 4
                uvs += [(0, 0), (w, 0), (w, h), (0, h)]
                fm.append(0); fh.append(b['floorH']); shop.append(float(b['shop']))
            r = b['roofs']
            for k in range(0, len(r), 9):
                i = len(verts)
                verts += [(r[k], r[k + 1], r[k + 2] + .04), (r[k + 3], r[k + 4], r[k + 5] + .04), (r[k + 6], r[k + 7], r[k + 8] + .04)]
                faces.append((i, i + 1, i + 2))
                cols += [c] * 3
                uvs += [(0, 0)] * 3
                fm.append(1); fh.append(3.0); shop.append(0.0)
        ob = mesh_with_attrs(f"Buildings style {style}", verts, faces, cols, [facade_material(style), roof_mat], fm, root,
                             uvs=uvs, face_attrs={'floorh': fh, 'shop': shop})
        ob["kind"] = "building"; ob["style"] = style
        total += len(items)
    return total


def box_verts(x, y, z, ry, sx, sy, sz, sides=4):
    """與 three.js 相同：ry 繞上軸；本地 x 沿牆、z 向外；底面在 z。sides>4 為柱體（近似）。"""
    ex, ey = math.cos(ry), math.sin(ry)          # three (cos, -sin) 轉 Blender y 北
    nx, ny = math.sin(ry), -math.cos(ry)
    if sides == 4:
        ring = [(-.5, -.5), (.5, -.5), (.5, .5), (-.5, .5)]
    else:
        ring = [(.5 * math.cos(2 * math.pi * k / sides), .5 * math.sin(2 * math.pi * k / sides)) for k in range(sides)]
    pts = [(x + ex * a * sx + nx * b * sz, y + ey * a * sx + ny * b * sz) for a, b in ring]
    n = len(pts)
    v = [(px, py, z) for px, py in pts] + [(px, py, z + sy) for px, py in pts]
    f = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(k, (k + 1) % n, n + (k + 1) % n, n + k) for k in range(n)]
    return v, f


SPEC = {  # kind: (材質, 預設色, 邊數, 粗糙度, 金屬度, 透明度)
    'ac': ('AC unit', '#e4e2da', 4, .6, 0, 1), 'grille': ('Iron grille', '#a3a69e', 4, .8, .2, .85),
    'tank': ('Water tank', '#c8ccd0', 10, .3, .6, 1), 'shed': ('Rooftop shed', '#9aa2a4', 4, .7, .3, 1),
    'sign': ('Shop sign', '#d7262b', 4, .5, 0, 1),
    'pole': ('Lamp pole', '#6e7477', 8, .6, .3, 1), 'head': ('Lamp head', '#d9dedc', 4, .5, 0, 1),
    'trunk': ('Tree trunk', '#665544', 8, .9, 0, 1), 'crown': ('Tree crown', '#4a6950', 10, .9, 0, 1),
    'sigPole': ('Signal pole', '#8c9597', 8, .5, .4, 1), 'sigArm': ('Signal arm', '#8c9597', 4, .5, .4, 1),
    'sigBox': ('Signal box', '#1d2022', 4, .6, 0, 1), 'sigLamp': ('Signal lamp', '#2a2d2f', 4, .4, 0, 1),
    'hydrant': ('Fire hydrant', '#c8211b', 10, .5, 0, 1), 'hydBase': ('Hydrant base', '#8e1813', 10, .6, 0, 1), 'hydOutlet': ('Hydrant outlet', '#c8211b', 4, .5, 0, 1),
    'hydCap': ('Hydrant cap', '#f2c230', 10, .5, 0, 1),
    'hydMark': ('Hydrant marking', '#f2c230', 4, .8, 0, 1), 'shelter': ('Bus shelter roof', '#596066', 4, .6, 0, 1),
    'glass': ('Bus shelter glass', '#9fb6c0', 4, .15, 0, .45), 'busSign': ('Bus stop sign', '#2563b8', 8, .5, 0, 1),
}


def build_instances(groups, root, keep_xy):
    n_total = 0
    for kind, items in groups.items():
        if not items or kind not in SPEC:
            continue
        mname, default, sides, rough, metal, alpha = SPEC[kind]
        m = colour_material(mname, rough, metal, alpha)
        verts, faces, cols = [], [], []
        for x, y, z, ry, sx, sy, sz, c in items:
            if not keep_xy(x, y):
                continue
            v, f = box_verts(x, y, z, ry, sx, sy, sz, sides)
            i = len(verts)
            verts += v
            faces += [tuple(i + k for k in ff) for ff in f]
            cc = srgb(c or default)
            cols += [cc] * sum(len(ff) for ff in f)
        if not faces:
            continue
        ob = mesh_with_attrs(f"Props {kind}", verts, faces, cols, [m], None, root)
        ob["kind"] = kind
        n_total += len(faces)
    return n_total


def build_green(rings, root, keep_xy):
    m = X.mat("Park lawn", (.070, .150, .040, 1), rough=.95)
    verts, faces = [], []
    for r in rings:
        pts = [(r[i], r[i + 1]) for i in range(0, len(r), 2)]
        cx, cy = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
        if not keep_xy(cx, cy):
            continue
        area = sum(pts[k][0] * pts[(k + 1) % len(pts)][1] - pts[(k + 1) % len(pts)][0] * pts[k][1] for k in range(len(pts)))
        i = len(verts)
        verts += [(x, y, .03) for x, y in pts]
        idx = list(range(i, i + len(pts)))
        faces.append(tuple(idx if area > 0 else idx[::-1]))
    if faces:
        X.new_obj("Green", verts, faces, [m], parent=root)


def main():
    if not PROPS:
        raise SystemExit("--props <json> required (node scripts/export-scene-props.mjs <json>)")
    X.reset_scene()
    X.build_materials()
    lanes = json.load(open(os.path.join(REPO, "dist", "assets", "lanes-xinyi.json"), encoding="utf-8"))
    scene = json.load(open(PROPS, encoding="utf-8"))
    centre = radius = None
    if arg("--center"):
        lon, lat = (float(v) for v in arg("--center").split(","))
        centre, radius = L.to_local(lon, lat), float(arg("--radius", "300"))
    keep_xy = (lambda x, y: True) if not centre else (lambda x, y: math.hypot(x - centre[0], y - centre[1]) <= radius)

    def keep_b(b):
        w = b['walls']
        return keep_xy(sum(v[0] for v in w) / len(w), sum(v[1] for v in w) / len(w))

    root = X.group("Xinyi district (phase 2)")
    lane_root, n_lanes = L.build(lanes, centre, radius)
    lane_root.parent = root
    nb = build_buildings(scene['buildings'], root, keep_b)
    np_ = build_instances(scene['props'], root, keep_xy)
    nf = build_instances(scene['furniture'], root, keep_xy)
    build_green(scene['green'], root, keep_xy)
    ground = X.mat("Lane ground", (0.05, 0.06, 0.05, 1), rough=1.0)
    X.new_obj("Ground", [(-1200, -1200, -0.06), (1200, -1200, -0.06), (1200, 1200, -0.06), (-1200, 1200, -0.06)],
              [(0, 1, 2, 3)], [ground], parent=root)
    print("BUILDINGS=", nb, "PROP_FACES=", np_, "FURNITURE_FACES=", nf, "LANE_FACES=", n_lanes)

    out_assets = os.path.join(REPO, "blender", "assets")
    out_prev = os.path.join(REPO, "blender", "preview")
    for d in (out_assets, out_prev):
        os.makedirs(d, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(REPO, "blender", "xinyi-district.blend"))
    glb = os.path.join(out_assets, "xinyi-district.glb")
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True, export_extras=True,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    print("GLB_BYTES=", os.path.getsize(glb))

    X.STAGE = 5
    cam = X.setup_preview()
    hq = L.to_local(121.5687101, 25.0411021)
    eoc = L.to_local(121.5661, 25.0290)
    shots = [
        ("hq_junction", (hq[0] - 28, hq[1] - 30, 9), (hq[0] + 10, hq[1] + 8, 5), 22),
        ("eoc_blocks", (eoc[0] - 40, eoc[1] - 200, 45), (eoc[0], eoc[1] - 90, 10), 26),
        ("alley_street", (46.0, -614.0, 2.0), (26.0, -594.0, 6.0), 18),
    ]
    if not centre:
        shots.append(("overview", (60, -900, 620), (60, -250, 0), 24))
    for name, loc, look, lens in shots:
        X.aim(cam, loc, look, lens=lens)
        cam.data.clip_end = 5000
        X.render_to(os.path.join(out_prev, f"xinyi-district_{name}.png"))


if __name__ == "__main__":
    main()
