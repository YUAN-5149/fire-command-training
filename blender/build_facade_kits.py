# -*- coding: utf-8 -*-
"""
逐街精修建物的「立面構件」：用 building_tools（https://github.com/ranjian0/building_tools，MIT）
在 Blender 程序化產生每一格窗的凸出構件（窗框、玻璃分割、窗台、簷板、陽台），
網頁街景漫遊與 Blender 區域模型都以實例沿臨街牆逐格擺放，補足著色器畫不出的立體感。

  blender -b --factory-startup -P blender/build_facade_kits.py -- --btools <building_tools 外掛的上層目錄> [--repo <repo>]

building_tools 取 v1.0.13 發佈 zip（https://github.com/ranjian0/building_tools/releases），解壓後
傳入含 building_tools/ 的目錄；外掛只在建模時使用，不進版控。

每筆精修資料（building-overrides-xinyi.json 的 buildings[]）一個構件，依外觀：
  variant 1 古典石材   窗框＋上下分割、窗台、窗楣（窗位 fy 0.2 起，與網頁著色器一致）
  variant 2 玻璃帷幕   整格玻璃的豎框與橫框（鋁框凸出 12 cm）
  variant 3 穿孔金屬板 窄長玻璃縫的框
  variant 4 預鑄方格   深凸的方框（窗洞四周的預鑄框，凸出 25 cm）
  style 1 住宅大樓（無 variant）窗框＋陽台樓板與玻璃欄杆（窗距 3.4 m，與網頁住宅窗格一致）
構件原點在格子的牆面中心（底邊中點），+X 沿牆、+Y 向上、+Z 朝外（glTF 座標）；寬 bay、高 KIT_FH，
網頁依實際樓高縮放 Y。輸出 dist/assets/facade-kits.glb，物件 extras：kit（精修名稱）、bay、fh、variant。
"""
import bmesh
import bpy
import json
import os
import sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


REPO = arg('--repo', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BTOOLS = arg('--btools')
if not BTOOLS:
    raise SystemExit('--btools <dir containing building_tools/> required')
sys.path.insert(0, BTOOLS)
import building_tools  # noqa: E402
building_tools.register()
from building_tools.btools.building.window.window_props import WindowProperty  # noqa: E402
from building_tools.btools.building.window import window_ops  # noqa: E402
from building_tools.btools.utils import get_selected_face_dimensions  # noqa: E402

KIT_FH = 3.6          # 構件建模的樓高；網頁依實際樓高縮放
RES_BAY = 3.4         # 住宅大樓窗距（xinyi-facades.js 住宅分類）
bpy.types.Scene.kit_win = bpy.props.PointerProperty(type=WindowProperty)


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c) + (1.0,)


def material(name, colour, rough=.6, metal=0.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(colour)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Alpha'].default_value = alpha
    if alpha < 1:
        m.surface_render_method = 'BLENDED'
    return m


def kit_spec(e):
    """窗洞在格子裡的位置（以格寬、樓高的比例）與框的厚度、凸出量。"""
    v = e.get('variant', 0)
    ww, wh = e.get('win', [0, 0])
    if v == 1:
        return dict(w=ww, h=wh, cy=.2 + wh / 2, frame=.12, depth=.08, panes=(1, 2), sill=True, head=True)
    if v == 2:
        return dict(w=.96, h=.86, cy=.43, cx=.02, frame=.05, depth=.12, panes=(1, 2))
    if v == 3:
        return dict(w=ww, h=.96, cy=.5, frame=.06, depth=.1, panes=(1, 1))
    if v == 4:
        return dict(w=ww, h=wh, cy=.5, frame=.14, depth=.25, panes=(1, 1))
    return dict(w=.76, h=.6, cy=.58, frame=.07, depth=.06, panes=(2, 1), balcony=True)


def frame_colour(e):
    v = e.get('variant', 0)
    c = [int(e['colour'][i:i + 2], 16) for i in (1, 3, 5)]
    k = {1: 1.15, 4: .88}.get(v)
    if k:
        return '#%02x%02x%02x' % tuple(max(0, min(255, int(x * k))) for x in c)
    return {2: '#3a4046', 3: '#2e3236'}.get(v, e['colour'])


def box(bm, x0, x1, y0, y1, z0, z1):
    """牆面座標（x 沿牆、z 向上、y 朝外為負）的方塊。"""
    vs = [bm.verts.new((x, y, z)) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
    for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([vs[i] for i in f])


def build_kit(idx, e):
    bay = e.get('bay') or RES_BAY
    s = kit_spec(e)
    # 一片牆面：寬 bay、高 KIT_FH，法線 -Y（Blender），building_tools 在這片牆上開窗
    me = bpy.data.meshes.new(f'kit_{idx:02d}')
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in ((-bay / 2, 0, 0), (bay / 2, 0, 0), (bay / 2, 0, KIT_FH), (-bay / 2, 0, KIT_FH))]
    bm.faces.new(vs)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(f'kit_{idx:02d}', me)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    w = bpy.context.scene.kit_win
    w.init(get_selected_face_dimensions(bpy.context))
    w.frame_thickness = s['frame']
    w.frame_depth = -s['depth']        # 負值：窗框凸出牆面（網頁牆面不透明，內凹的構件會被遮住）
    w.window_depth = 0.0
    w.fill_type = 'GLASS_PANES'
    w.glass_fill.pane_count_x, w.glass_fill.pane_count_y = s['panes']
    w.glass_fill.pane_margin = .035
    w.glass_fill.pane_depth = .03
    w.size_offset.size = (s['w'] * bay, s['h'] * KIT_FH)
    w.size_offset.offset = (s.get('cx', 0) * bay, (s['cy'] - .5) * KIT_FH)
    if window_ops.build(bpy.context, w) != {'FINISHED'}:
        raise SystemExit(f'building_tools window failed for {e["name"]}')
    bpy.ops.object.mode_set(mode='OBJECT')

    # 只留凸出的框與玻璃分割；牆面與玻璃面由網頁著色器畫（同平面會閃爍）
    keep = {g.index for g in ob.bt_materials if g.name in ('frame', 'window_panes', 'window_bars')}
    bm = bmesh.new()
    bm.from_mesh(me)
    layer = bm.faces.layers.int.get('.bt_material_group_index')
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[layer] not in keep], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    x0, x1 = -s['w'] * bay / 2 + s.get('cx', 0) * bay, s['w'] * bay / 2 + s.get('cx', 0) * bay
    z0, z1 = (s['cy'] - s['h'] / 2) * KIT_FH, (s['cy'] + s['h'] / 2) * KIT_FH
    extra = []
    if s.get('sill'):      # 窗台：比窗寬 20 cm、凸出 16 cm
        box(bm, x0 - .1, x1 + .1, -.16, 0, z0 - .1, z0)
    if s.get('head'):      # 窗楣：細簷板
        box(bm, x0 - .14, x1 + .14, -.12, 0, z1 + .08, z1 + .2)
    if s.get('balcony'):   # 陽台樓板＋玻璃欄杆（欄杆另一個材質）
        box(bm, -bay * .45, bay * .45, -1.1, 0, 0, .15)
        extra = [(-bay * .45, bay * .45, -1.1, -1.06, .15, 1.15)]
    bm.to_mesh(me)
    bm.free()
    me.materials.clear()
    me.materials.append(material(f'Kit frame {idx:02d}', frame_colour(e), rough=.45 if e.get('variant') in (2, 3) else .75,
                                 metal=.6 if e.get('variant') in (2, 3) else 0))
    for p in me.polygons:
        p.material_index = 0
    if extra:
        me.materials.append(material('Kit railing glass', '#9fb6bf', rough=.08, alpha=.45))
        bm = bmesh.new()
        bm.from_mesh(me)
        n0 = len(bm.faces)
        for b_ in extra:
            box(bm, *b_)
        bm.faces.ensure_lookup_table()
        for f in bm.faces[n0:]:
            f.material_index = 1
        bm.to_mesh(me)
        bm.free()
    # Blender（+Z 上、-Y 朝外）→ glTF（+Y 上、+Z 朝外）由匯出器轉換
    ob['kit'] = e['name']
    ob['bay'] = bay
    ob['fh'] = KIT_FH
    ob['variant'] = e.get('variant', 0)
    ob.location = (idx * 6.0, 0, 0)   # 預覽時排開；網頁以 extras 定位，不用 location
    ob.select_set(False)
    return ob, len(me.vertices)


def kit_entries(data):
    for st in data['streets']:
        for e in st['buildings']:
            if e.get('variant') or e.get('style') == 1:
                yield e


def main():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    data = json.load(open(os.path.join(REPO, 'dist', 'assets', 'building-overrides-xinyi.json'), encoding='utf-8'))
    total = 0
    obs = []
    for i, e in enumerate(kit_entries(data)):
        ob, n = build_kit(i, e)
        obs.append(ob)
        total += n
    print('KITS=', len(obs), 'VERTS=', total)
    for ob in obs:
        ob.location = (0, 0, 0)
        ob.select_set(True)
    building_tools.unregister()          # 外掛的 bt_materials 屬性不要匯出到 extras
    out = os.path.join(REPO, 'dist', 'assets', 'facade-kits.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_extras=True,
                              export_apply=True, export_attributes=False)
    print('GLB_BYTES=', os.path.getsize(out))


main()
