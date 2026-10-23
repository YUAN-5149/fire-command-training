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
import taipei_facade as TF                          # 臨街精細立面、屋頂鐵皮加蓋
import random

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


def override_material(o):
    """逐街精修建物：依窗距、窗寬高比、玻璃色畫窗格；底層 arcade 為拱廊陰影、lobby 為玻璃大廳；
    variant 2 為玻璃帷幕（豎框 4%、層間帶 14%）。樓高用每面的 floorh 屬性。"""
    name = f"Facade {o['name']}"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = X.mat(name, (.6, .6, .6, 1), rough=.8)
    nt = m.node_tree
    N, Lk = nt.nodes, nt.links
    bsdf = next(n for n in N if n.type == 'BSDF_PRINCIPLED')
    col = N.new('ShaderNodeVertexColor'); col.layer_name = 'Col'
    uv = N.new('ShaderNodeUVMap'); uv.uv_map = 'Facade'
    sep = N.new('ShaderNodeSeparateXYZ'); Lk.new(uv.outputs[0], sep.inputs[0])
    fh = N.new('ShaderNodeAttribute'); fh.attribute_type = 'GEOMETRY'; fh.attribute_name = 'floorh'

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
    pod = o['podium']['h'] if o.get('podium') else 0.0
    kind = o['podium']['kind'] if o.get('podium') else ''
    curtain = o.get('variant') == 2
    bay = o['bay']
    ww, wh = o['win']
    vp = op('SUBTRACT', v, pod)
    fy = op('FRACT', op('DIVIDE', vp, floor_h))
    bx = op('FRACT', op('DIVIDE', u, bay))
    above = op('GREATER_THAN', v, pod)
    if curtain:
        win = op('MULTIPLY', op('GREATER_THAN', bx, .04), op('LESS_THAN', fy, .86))
    elif o.get('variant') == 3:
        # 穿孔金屬板：窄長玻璃縫（整層高）
        win = op('MULTIPLY', op('GREATER_THAN', bx, .5 - ww / 2), op('LESS_THAN', bx, .5 + ww / 2))
    elif o.get('variant') == 4:
        # 預鑄混凝土方格：每格一窗，上下置中
        win = op('MULTIPLY', op('MULTIPLY', op('GREATER_THAN', bx, .5 - ww / 2), op('LESS_THAN', bx, .5 + ww / 2)),
                 op('MULTIPLY', op('GREATER_THAN', fy, .5 - wh / 2), op('LESS_THAN', fy, .5 + wh / 2)))
    else:
        win = op('MULTIPLY', op('MULTIPLY', op('GREATER_THAN', bx, .5 - ww / 2), op('LESS_THAN', bx, .5 + ww / 2)),
                 op('MULTIPLY', op('GREATER_THAN', fy, .2), op('LESS_THAN', fy, .2 + wh)))
    win = op('MULTIPLY', win, above)
    below = op('LESS_THAN', v, pod)
    if kind == 'arcade':
        recess = op('MULTIPLY', op('MULTIPLY', op('GREATER_THAN', bx, .14), op('LESS_THAN', bx, .86)),
                    op('LESS_THAN', v, pod * .78))
        lobby = op('MULTIPLY', recess, 0.0)
    else:
        recess = op('MULTIPLY', below, 0.0)
        lobby = op('MULTIPLY', below, op('LESS_THAN', v, max(pod - .7, 0)))
    glass_mask = op('ADD', win, lobby, clamp=True)
    g = srgb(o['glass'])
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = tuple(c * .7 for c in g[:3]) + (1,)
    ramp.color_ramp.elements[1].color = tuple(min(1, c * 1.35) for c in g[:3]) + (1,)
    noise = N.new('ShaderNodeTexWhiteNoise'); noise.noise_dimensions = '2D'
    comb = N.new('ShaderNodeCombineXYZ')
    Lk.new(op('FLOOR', op('DIVIDE', u, bay)), comb.inputs[0]); Lk.new(op('FLOOR', op('DIVIDE', vp, floor_h)), comb.inputs[1])
    Lk.new(comb.outputs[0], noise.inputs['Vector']); Lk.new(noise.outputs['Value'], ramp.inputs[0])
    dark = N.new('ShaderNodeMix'); dark.data_type = 'RGBA'; dark.blend_type = 'MULTIPLY'
    Lk.new(recess, dark.inputs[0]); Lk.new(col.outputs[0], dark.inputs[6]); dark.inputs[7].default_value = (.3, .3, .3, 1)
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    Lk.new(glass_mask, mix.inputs[0]); Lk.new(dark.outputs[2], mix.inputs[6]); Lk.new(ramp.outputs[0], mix.inputs[7])
    Lk.new(mix.outputs[2], bsdf.inputs['Base Color'])
    rough = N.new('ShaderNodeMapRange'); rough.inputs['To Min'].default_value = .8; rough.inputs['To Max'].default_value = .1
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


def detailed(b):
    """逐街精修過的老公寓與住宅大樓：臨街牆改用 taipei_facade 的實際幾何。"""
    return b.get('refined') and b['style'] in (0, 1)


def build_buildings(buildings, root, keep):
    # 一般建物依外觀分類合成一個物件；逐街精修建物（override）各自一個物件與材質
    by_style = {}
    for b in buildings:
        if keep(b):
            o = b.get('override')
            key = ('o', o['name']) if o and o.get('variant') else ('s', b['style'])
            by_style.setdefault(key, []).append(b)
    total = 0
    for (kind, key), items in sorted(by_style.items(), key=lambda kv: (kv[0][0], str(kv[0][1]))):
        style = items[0]['style']
        verts, faces, cols, uvs, fm, fh, shop = [], [], [], [], [], [], []
        roof_mat = X.mat(f"Roof style {style}", ROOF[style] + (1,), rough=.9)
        for b in items:
            c = srgb(b['colour'])
            for wl in b['walls']:
                x0, y0, x1, y1, z0, h = wl[:6]
                if detailed(b) and len(wl) > 6 and wl[6]:
                    continue                   # 由精細立面取代
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
        facade = override_material(items[0]['override']) if kind == 'o' else facade_material(style)
        ob = mesh_with_attrs(f"Buildings {key}" if kind == 'o' else f"Buildings style {style}", verts, faces, cols,
                             [facade, roof_mat], fm, root, uvs=uvs, face_attrs={'floorh': fh, 'shop': shop})
        ob["kind"] = "building"; ob["style"] = style
        if kind == 'o':
            ob["name_zh"] = key
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


# 立面構件（dist/assets/facade-kits.glb，blender/build_facade_kits.py 以 building_tools 產生）：
# 依 export-scene-props.mjs 的 kits 擺放（與網頁 facade-kits.js 同一份規則），每個構件合併成一個網格。
def build_kits(kits, root, keep_xy):
    import numpy as np
    path = os.path.join(REPO, "dist", "assets", "facade-kits.glb")
    if not kits or not os.path.exists(path):
        return 0
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    imported = [o for o in bpy.data.objects if o not in before]
    src = {o.get('kit'): o for o in imported if o.type == 'MESH' and o.get('kit')}
    total = 0
    for name, items in kits.items():
        ob = src.get(name)
        items = [it for it in items if keep_xy(it[5], it[6])]
        if ob is None or not items:
            continue
        me = ob.data
        # glTF 匯入後：構件 X 沿牆、Z 向上、-Y 朝外
        co = np.array([v.co[:] for v in me.vertices])
        polys = [list(p.vertices) for p in me.polygons]
        mats = [p.material_index for p in me.polygons]
        verts, faces, mi = [], [], []
        for tx, ty, nx, ny, sy, x, y, z in items:
            # 世界 = 沿牆*lx + 外法線*(-ly) + 向上*lz*sy
            w = (np.outer(co[:, 0], (tx, ty, 0)) + np.outer(-co[:, 1], (nx, ny, 0))
                 + np.outer(co[:, 2] * sy, (0, 0, 1)) + (x, y, z))
            off = len(verts)
            verts.extend(map(tuple, w))
            faces.extend([[i + off for i in f] for f in polys])
            mi.extend(mats)
        m2 = bpy.data.meshes.new(f"Kits {name}")
        m2.from_pydata(verts, [], faces)
        for mt in me.materials:
            m2.materials.append(mt)
        m2.polygons.foreach_set('material_index', mi)
        m2.update()
        o2 = bpy.data.objects.new(f"Kits {name}", m2)
        bpy.context.scene.collection.objects.link(o2)
        o2.parent = root
        total += len(items)
    for o in imported:
        bpy.data.objects.remove(o, do_unlink=True)
    return total


# 行道樹：與網頁 xinyi-trees.js 相同的三種樹形（樟樹、榕樹、台灣欒樹），每種一個網格，
# 各棵樹以連結資料的物件放置（隨機旋轉、縮放）。葉團為凹凸的二十面體球，上亮下暗；
# 材質用噪聲紋理加葉面明暗與凹凸。
TREE_KINDS = {
    'camphor':    dict(trunkH=2.4, trunkR=(.13, .22), crown=(5.2, 2.4, 1.5), lumps=8, lumpR=(1.4, 2.0), leaf='#6a9a55', bark='#463a2e'),
    'banyan':     dict(trunkH=2.2, trunkR=(.16, .28), crown=(4.7, 3.3, 1.2), lumps=9, lumpR=(1.3, 1.9), leaf='#58884a', bark='#544839'),
    'goldenrain': dict(trunkH=3.0, trunkR=(.11, .18), crown=(6.2, 1.7, 2.2), lumps=7, lumpR=(1.1, 1.6), leaf='#88a95a', bark='#3f362c'),
}


def tree_mesh(kind):
    import bmesh
    import random
    from mathutils import Vector, Matrix, noise
    k = TREE_KINDS[kind]
    rnd = random.Random(list(TREE_KINDS).index(kind) * 977 + 13)
    bm = bmesh.new()
    col = bm.loops.layers.color.new('Col')
    leaf, bark = srgb(k['leaf']), srgb(k['bark'])

    def paint(faces, fn):
        for f in faces:
            for lp in f.loops:
                lp[col] = fn(lp.vert.co)

    def cone(r0, r1, length, base, direction, seg=8):
        d = Vector(direction).normalized()
        rot = Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
        res = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r0, depth=length,
                                    matrix=Matrix.Translation(Vector(base) + d * length / 2) @ rot)
        verts = res['verts']
        return list({f for v in verts for f in v.link_faces})
    bark_col = lambda co: tuple(min(1, c * 1.8 * (.85 + .15 * math.sin(co.z * 9 + co.x * 13))) for c in bark[:3]) + (1,)  # AgX 下樹皮偏黑，提亮
    paint(cone(k['trunkR'][0], k['trunkR'][1], k['trunkH'] + .6, (0, 0, 0), (0, 0, 1), 9), bark_col)
    cy, rx, ry = k['crown']
    centres = []
    for i in range(k['lumps']):
        a = i / k['lumps'] * math.pi * 2 + rnd.random() * .6
        rad = .35 + rnd.random() * .65
        centres.append((math.cos(a) * rx * rad, math.sin(a) * rx * rad, cy + (rnd.random() - .4) * ry * 1.2,
                        k['lumpR'][0] + rnd.random() * (k['lumpR'][1] - k['lumpR'][0])))
    centres.append((0, 0, cy + ry * .55, k['lumpR'][1] * 1.05))
    for i in range(3):
        cx, cyy, cz, _ = centres[i * 2 % len(centres)]
        frm = Vector((0, 0, k['trunkH'] * .85))
        to = Vector((cx * .7, cyy * .7, cz - .6))
        paint(cone(k['trunkR'][0] * .45, k['trunkR'][0] * .85, (to - frm).length, frm, to - frm, 6), bark_col)
    lo, hi = cy - ry - 1.5, cy + ry + 2
    for j, (cx, cyy, cz, R) in enumerate(centres):
        res = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0, matrix=Matrix.Identity(4))
        seed = Vector((j * 1.7, list(TREE_KINDS).index(kind) * 3.0, 0))
        for v in res['verts']:
            d = v.co.copy()
            f = R * (1 + .22 * noise.noise(d * 1.6 + seed) + .08 * noise.noise(d * 4.0 + seed))
            v.co = Vector((cx + d.x * f, cyy + d.y * f, cz + d.z * f * .82))
        shade = .88 + rnd.random() * .2

        def leaf_col(co, shade=shade):
            h = min(1, max(0, (co.z - lo) / (hi - lo)))
            out = min(1, math.hypot(co.x, co.y) / (rx + 1.5))
            v = (.78 + .42 * h) * (.9 + .2 * out) * shade
            return tuple(min(1, c * v) for c in leaf[:3]) + (1,)
        paint({f for v in res['verts'] for f in v.link_faces}, leaf_col)
    me = bpy.data.meshes.new(f"Tree {kind}")
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    return me


def tree_material():
    if "Street tree" in bpy.data.materials:
        return bpy.data.materials["Street tree"]
    m = X.mat("Street tree", (.5, .5, .5, 1), rough=.85)
    nt = m.node_tree
    N, Lk = nt.nodes, nt.links
    bsdf = next(n for n in N if n.type == 'BSDF_PRINCIPLED')
    col = N.new('ShaderNodeVertexColor'); col.layer_name = 'Col'
    tex = N.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = 6.0; tex.inputs['Detail'].default_value = 6.0
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = .3; ramp.color_ramp.elements[0].color = (.55, .55, .55, 1)
    ramp.color_ramp.elements[1].position = .75; ramp.color_ramp.elements[1].color = (1.15, 1.15, 1.15, 1)
    Lk.new(tex.outputs['Fac'], ramp.inputs[0])
    mul = N.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1.0
    Lk.new(col.outputs[0], mul.inputs[6]); Lk.new(ramp.outputs[0], mul.inputs[7])
    Lk.new(mul.outputs[2], bsdf.inputs['Base Color'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .6
    tex2 = N.new('ShaderNodeTexNoise'); tex2.inputs['Scale'].default_value = 14.0
    Lk.new(tex2.outputs['Fac'], bump.inputs['Height']); Lk.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def build_trees(items, root, keep_xy):
    """items：[x, y, z, ry, s, s, s, kind]（export-scene-props.mjs 的 furniture.tree）。"""
    meshes, mat = {}, tree_material()
    grp = X.group("Street trees", root)
    n = 0
    for x, y, z, ry, sx, sy, sz, kind in items:
        if not keep_xy(x, y):
            continue
        if kind not in meshes:
            meshes[kind] = tree_mesh(kind)
            meshes[kind].materials.append(mat)
        ob = bpy.data.objects.new(f"Tree {kind} {n}", meshes[kind])
        bpy.context.collection.objects.link(ob)
        ob.parent = grp
        ob.location = (x, y, z - .05)
        ob.rotation_euler = (0, 0, ry)
        ob.scale = (sx, sx, sx)
        n += 1
    return n


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
    # 屋頂鐵皮加蓋（衛星影像：老公寓屋頂多被鐵皮屋覆蓋）與臨街精細立面
    M = TF.materials()
    rng = random.Random(20261022)
    roof_buf, face_buf, texts, shed_boxes, detail_walls = TF.OBuf(), TF.OBuf(), [], [], []
    for b in scene['buildings']:
        if not keep_b(b):
            continue
        xs = [w[0] for w in b['walls']]
        ys = [w[1] for w in b['walls']]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        if b['style'] == 0 and rng.random() < .85:
            h = TF.roof_shed(roof_buf, b, rng, M)
            if h:
                shed_boxes.append((min(xs), min(ys), max(xs), max(ys), h))
        if detailed(b):
            for wl in b['walls']:
                if len(wl) > 6 and wl[6]:
                    F = TF.Frame(wl[0], wl[1], wl[2], wl[3], wl[4], cx, cy)
                    if F.W < 3:
                        continue
                    TF.street_wall(face_buf, F, wl[5], b['floorH'], b['style'], b['shop'], b['colour'], rng, M, texts)
                    detail_walls.append((wl[0], wl[1], wl[2], wl[3]))
    if roof_buf.f:
        roof_buf.emit("Rooftop sheet-metal sheds", root)
    detail_root = X.group("Street facades (detailed)", root)
    if face_buf.f:
        face_buf.emit("Street facades", detail_root)
    TF.make_texts(texts, X.load_font(), detail_root)
    print("DETAIL_WALLS=", len(detail_walls), "SIGN_TEXTS=", len(texts), "ROOF_SHEDS=", len(shed_boxes))

    # 舊的方塊小物件：鐵皮屋改由屋頂加蓋取代；精細牆旁的冷氣、鐵窗、招牌改由精細立面取代；水塔墊高到加蓋頂
    def near_detail(x, y):
        for x0, y0, x1, y1 in detail_walls:
            dx, dy = x1 - x0, y1 - y0
            t = max(0, min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy or 1)))
            if math.hypot(x - x0 - dx * t, y - y0 - dy * t) < 1.6:
                return True
        return False
    props = dict(scene['props'])
    props.pop('shed', None)
    for k in ('ac', 'grille', 'sign'):
        props[k] = [p for p in props.get(k, []) if not near_detail(p[0], p[1])]
    tanks = []
    for t in props.get('tank', []):
        t = list(t)
        for x0, y0, x1, y1, h in shed_boxes:
            if x0 <= t[0] <= x1 and y0 <= t[1] <= y1:
                t[2] += h
                break
        tanks.append(t)
    props['tank'] = tanks
    np_ = build_instances(props, root, keep_xy)
    nf = build_instances(scene['furniture'], root, keep_xy)
    nt = build_trees(scene['furniture'].get('tree', []), root, keep_xy)
    print("KITS=", build_kits(scene.get('kits', {}), root, keep_xy))
    print("TREES=", nt)
    build_green(scene['green'], root, keep_xy)
    ground = X.mat("Lane ground", (0.05, 0.06, 0.05, 1), rough=1.0)
    X.new_obj("Ground", [(-1200, -1200, -0.06), (1200, -1200, -0.06), (1200, 1200, -0.06), (-1200, 1200, -0.06)],
              [(0, 1, 2, 3)], [ground], parent=root)
    print("BUILDINGS=", nb, "PROP_FACES=", np_, "FURNITURE_FACES=", nf, "LANE_FACES=", n_lanes)

    out_assets = os.path.join(REPO, "blender", "assets")
    out_prev = os.path.join(REPO, "blender", "preview")
    for d in (out_assets, out_prev):
        os.makedirs(d, exist_ok=True)
    if not arg("--no-save"):
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(REPO, "blender", "xinyi-district.blend"))
    glb = os.path.join(out_assets, "xinyi-district.glb")
    if not arg("--no-glb"):
      bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True, export_extras=True,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
      print("GLB_BYTES=", os.path.getsize(glb))

    X.STAGE = 5
    cam = X.setup_preview()
    # 畫質：EEVEE 光線追蹤反射、軟陰影與環境遮蔽（版本不支援的設定略過）
    sc = bpy.context.scene
    for attr, val in (('use_raytracing', True), ('use_shadows', True), ('shadow_ray_count', 2), ('shadow_step_count', 8),
                      ('use_gtao', True), ('gtao_distance', 1.5), ('taa_render_samples', 64)):
        try:
            setattr(sc.eevee, attr, val)
        except (AttributeError, TypeError):
            pass
    hq = L.to_local(121.5687101, 25.0411021)
    eoc = L.to_local(121.5661, 25.0290)
    shots = [
        ("hq_junction", (hq[0] - 28, hq[1] - 30, 9), (hq[0] + 10, hq[1] + 8, 5), 22),
        ("eoc_blocks", (eoc[0] - 40, eoc[1] - 200, 45), (eoc[0], eoc[1] - 90, 10), 26),
        ("alley_street", (46.0, -614.0, 2.0), (26.0, -594.0, 6.0), 18),
        ("songren_n", (322.0, 712.0, 2.5), (250.0, 650.0, 16.0), 20),
        ("songren_trees", (318.0, 650.0, 2.0), (330.0, 740.0, 6.0), 20),
        ("songren_s2", (318.0, 625.0, 14.0), (300.0, 420.0, 30.0), 18),
        ("songren_s3", (300.0, -70.0, 8.0), (300.0, 120.0, 30.0), 18),
        ("songren_s4", (300.0, -110.0, 10.0), (298.0, -330.0, 22.0), 18),
        ("songren_s5", (304.0, -645.0, 2.2), (296.0, -590.0, 7.0), 16),
        ("songren_s5_west", (296.0, -628.0, 1.7), (276.0, -612.0, 5.5), 18),
        ("songren_s5_east", (300.0, -650.0, 1.7), (320.0, -630.0, 5.5), 18),
        ("songren_s5_roofs", (330.0, -700.0, 70.0), (300.0, -600.0, 0.0), 24),
        ("songzhi_n", (14.0, 250.0, 2.5), (20.0, 520.0, 40.0), 18),
        ("songzhi_cityhall", (14.0, 380.0, 1.8), (-40.0, 405.0, 14.0), 20),
        ("songzhi_s2_east", (14.0, 55.0, 1.8), (60.0, 55.0, 14.0), 20),
        ("songzhi_s2_west", (16.0, 40.0, 1.8), (-40.0, 25.0, 30.0), 18),
        ("songzhi_s3_east", (2.0, -112.0, 1.8), (40.0, -135.0, 14.0), 20),
        ("songzhi_s3_tower", (2.0, -160.0, 1.8), (45.0, -182.0, 30.0), 18),
        ("songzhi_s4_east", (-3.0, -310.0, 1.8), (40.0, -290.0, 16.0), 20),
        ("songzhi_s4_west", (2.0, -295.0, 1.8), (-45.0, -320.0, 22.0), 18),
        ("songzhi_s5_west", (-2.0, -425.0, 1.8), (-40.0, -445.0, 16.0), 20),
        ("songzhi_s5_south", (-1.0, -405.0, 2.2), (-30.0, -500.0, 12.0), 20),
        ("songshou_hyatt", (-285.0, 240.0, 1.8), (-280.0, 175.0, 30.0), 18),
        ("songshou_a9", (110.0, 236.0, 1.8), (160.0, 280.0, 12.0), 20),
        ("shifu_ticc", (-188.0, 20.0, 1.8), (-250.0, 50.0, 16.0), 18),
        ("shifu_cityhall_gate", (-185.0, 400.0, 1.8), (-130.0, 412.0, 12.0), 20),
        ("xinyi5_manhattan", (-430.0, -95.0, 1.8), (-470.0, -125.0, 30.0), 18),
        ("xinyi5_hongxi", (-180.0, -95.0, 1.8), (-235.0, -128.0, 25.0), 18),
    ]
    only = arg("--only")
    if only:
        shots = [s_ for s_ in shots if s_[0] in only.split(",")]
    if not centre:
        shots.append(("overview", (60, -900, 620), (60, -250, 0), 24))
    for name, loc, look, lens in shots:
        X.aim(cam, loc, look, lens=lens)
        cam.data.clip_end = 5000
        X.render_to(os.path.join(out_prev, f"xinyi-district_{name}.png"))


if __name__ == "__main__":
    main()
