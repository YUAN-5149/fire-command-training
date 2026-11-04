# -*- coding: utf-8 -*-
"""
老舊立面附屬構件：從 BuildingGeneratorThreeJS（https://github.com/achrefelouafi/BuildingGeneratorThreeJS，程式 MIT）
的組件包 kit.glb 取出冷氣室外機、冷氣管線、電錶區，縮成網頁可用的小檔。
組件模型與貼圖來自 Sketchfab「Procedural Hong Kong building」（作者 uday，CC BY 4.0，
https://sketchfab.com/3d-models/procedural-hong-kong-building-528a732e84c44fd49c4726f341014a23）。

  blender -b --factory-startup -P blender/build_weathered_parts.py -- --kit <kit.glb> [--repo <repo>] [--preview <png>]

kit.glb 取自該倉庫 commit 74cb71b（public/assets/kit.glb），不進版控。輸出 dist/assets/weathered-parts.glb：
- 每個組件一個物件，extras：part（ac / acwire / meter）、variant
- 座標：公尺；+X 沿牆、+Y 向上、+Z 朝外（glTF）；原點在牆面上的底邊中點
- 貼圖圖集縮為 1024 JPEG，並把含商標、店招文字的區塊塗成中性灰（只用到牆面、金屬、管線區）
"""
import bmesh
import bpy
import os
import sys
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


REPO = arg('--repo', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KIT = arg('--kit')
PREVIEW = arg('--preview')
if not KIT:
    raise SystemExit('--kit <kit.glb> required')

# 組件包一格 = 1 樓（約 1 單位）；台北老公寓樓高約 3 m，以 2.8 倍換成公尺
UNIT = 2.8
PARTS = [
    ('ac', 'ac.001', [0, 1, 4, 5, 8, 9]),
    ('acwire', 'AC WIRE.001', [0, 1, 2, 3]),
    ('meter', 'eletricarea', [0, 1, 2]),
]
# 圖集上含商標或店招文字的區塊（以 0..1 UV，左下為原點）：塗成中性灰
MASK = [(0, .66, .34, 1), (.67, .52, .89, .73), (.83, .2, .93, .34), (.92, 0, 1, .22)]


def collect(top):
    """把一個組件（空物件下的所有網格）合成一個網格，座標以空物件為原點。"""
    inv = top.matrix_world.inverted()
    bm = bmesh.new()
    mats = []
    for o in top.children_recursive:
        if o.type != 'MESH':
            continue
        me = o.data.copy()
        me.transform(inv @ o.matrix_world)
        idx = []
        for m in me.materials:
            if m not in mats:
                mats.append(m)
            idx.append(mats.index(m))
        for p in me.polygons:
            p.material_index = idx[p.material_index] if idx else 0
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    return bm, mats


def clean_atlas():
    for img in bpy.data.images:
        if img.size[0] < 512:
            continue
        if 'Base_color' in img.name:
            img.scale(1024, 1024)
            px = list(img.pixels)
            W = H = 1024
            for u0, v0, u1, v1 in MASK:
                for j in range(int(v0 * H), int(v1 * H)):
                    for i in range(int(u0 * W), int(u1 * W)):
                        k = (j * W + i) * 4
                        px[k:k + 3] = (.42, .42, .41)
            img.pixels = px
        else:
            img.scale(1024, 1024)
        img.file_format = 'JPEG'


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=KIT)
    out = []
    for part, col, variants in PARTS:
        for v in variants:
            top = bpy.data.objects.get(f'COL[{col}][{v}]')
            if not top:
                raise SystemExit(f'missing COL[{col}][{v}]')
            bm, mats = collect(top)
            # 組件包匯入後牆面在 XY 平面、+Y 向上、-Z 朝外；轉成 Z 上、-Y 朝外（匯出後即 glTF 的 Y 上、+Z 朝外），
            # 縮放成公尺後把原點移到底邊中點、貼齊組件最靠牆的一面
            bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(3.14159265, 3, 'Z') @ Matrix.Rotation(1.57079633, 3, 'X'), verts=bm.verts)
            bmesh.ops.scale(bm, vec=(UNIT, UNIT, UNIT), verts=bm.verts)
            xs = [p.co.x for p in bm.verts]
            ys = [p.co.y for p in bm.verts]
            zs = [p.co.z for p in bm.verts]
            cx = (min(xs) + max(xs)) / 2
            wall_y = max(ys)
            bmesh.ops.translate(bm, vec=(-cx, -wall_y, -min(zs)), verts=bm.verts)
            me = bpy.data.meshes.new(f'{part}_{v}')
            bm.to_mesh(me)
            bm.free()
            for m in mats:
                me.materials.append(m)
            ob = bpy.data.objects.new(f'{part}_{v}', me)
            bpy.context.scene.collection.objects.link(ob)
            ob['part'] = part
            ob['variant'] = v
            dims = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
            print('PART', part, v, len(me.vertices), 'dims', tuple(round(d, 2) for d in dims))
            out.append(ob)
    for o in list(bpy.data.objects):
        if o not in out:
            bpy.data.objects.remove(o)
    clean_atlas()
    if PREVIEW:
        preview(out)
    for i, ob in enumerate(out):
        ob.location = (0, 0, 0)
        ob.select_set(True)
    path = os.path.join(REPO, 'dist', 'assets', 'weathered-parts.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_extras=True,
                              export_image_format='JPEG', export_jpeg_quality=82, export_attributes=False)
    print('GLB_BYTES=', os.path.getsize(path), 'VERTS=', sum(len(o.data.vertices) for o in out))


def preview(obs):
    """一字排開渲染一張檢查圖（牆面朝鏡頭）。"""
    x = 0
    for ob in obs:
        w = ob.dimensions.x
        ob.location = (x + w / 2, 0, 0)
        x += w + .4
    wall = bpy.data.meshes.new('wall')
    wall.from_pydata([(-.5, .01, -.2), (x, .01, -.2), (x, .01, 3), (-.5, .01, 3)], [], [(0, 1, 2, 3)])
    wo = bpy.data.objects.new('wall', wall)
    bpy.context.scene.collection.objects.link(wo)
    sc = bpy.context.scene
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = x + 1
    cam.location = (x / 2, -12, 1.2)
    cam.rotation_euler = (1.5708, 0, 0)
    sc.collection.objects.link(cam)
    sc.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.rotation_euler = (1.0, 0.2, -0.4)
    sun.data.energy = 3
    sc.collection.objects.link(sun)
    sc.world = bpy.data.worlds.new('w')
    sc.world.color = (.6, .6, .6)
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x, sc.render.resolution_y = 1800, 420
    sc.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(wo)
    bpy.data.objects.remove(cam)
    bpy.data.objects.remove(sun)


main()
