# -*- coding: utf-8 -*-
"""
臺北街屋精細立面（Blender）：給 build_xinyi_district.py 用。

對逐街精修過、且為老公寓（style 0）或住宅大樓（style 1）的臨街牆，改用實際幾何：
  一樓店面：騎樓柱、樑、天花、內退店面（鐵捲門／玻璃店面）、騎樓地坪、店招（中文店名）
  上層：每開間的窗洞內凹、鋁窗框與中梃、窗台、樓板飾帶；老公寓鐵窗（立柱、橫桿、直條、雨遮）、
        冷氣機（含托架與前格柵）；住宅大樓隔間陽台
  女兒牆與壓頂；直立招牌（燈箱外框＋雙面直排中文字）
屋頂鐵皮加蓋：依衛星影像，老公寓屋頂多被鐵皮屋覆蓋（灰、白、藍綠、紅褐），以屋頂三角形內縮後擠出。

所有構件都是沿牆的方向盒（a 沿牆、d 往外、z 向上），UV 以公尺計，磁磚、鐵捲門、浪板照實際尺寸貼。
外觀依街景目測，尺寸非實測；窗戶、鐵窗位置為示意，不是實際救援開口。
"""

import math
import random

import bpy

SHOPS = ["機車行", "便利商店", "藥局", "早餐店", "牙醫診所", "麵店", "水電行", "髮廊", "五金行", "眼鏡行",
         "中醫診所", "自助餐", "飲料店", "洗衣店", "房屋仲介", "鎖店", "文具行", "麵包店", "小吃店", "電器行",
         "診所", "火鍋", "便當", "補習班", "鐘錶行", "茶行", "影印", "通訊行"]
SIGN_COLOURS = ["#c8231e", "#f2c230", "#f5f5f0", "#1f4fa8", "#1f8a4c", "#e86a1c", "#b0185a", "#222222"]
IRON = ["#dcdcd6", "#dcdcd6", "#d0d3cf", "#7a5a44", "#6b4b38", "#3f5a4a"]
ROOF_METAL = ["#c9cdd0", "#e6e6e2", "#b8bcbe", "#5f9ea0", "#9c4a3c", "#7e8a92", "#d9d4c0", "#4f7fa8"]


def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c) + (1.0,)


# ------------------------------------------------------------------ materials
def _bsdf(m):
    nt = m.node_tree
    b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b is None:
        b = nt.nodes.new('ShaderNodeBsdfPrincipled')
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) or nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(b.outputs[0], out.inputs[0])
    return b


def _mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m, None
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, _bsdf(m)


def materials():
    """建一次、回傳 {名稱: 材質}；有 Col 頂點色的材質以頂點色為主色。"""
    out = {}

    def colour_node(nt):
        c = nt.nodes.new('ShaderNodeVertexColor'); c.layer_name = 'Col'
        return c

    def uvxyz(nt):
        uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
        return uv

    # 二丁掛磁磚：24×6.5 cm，灰縫 6 mm，磚色隨機深淺，再疊大範圍污漬
    m, b = _mat("TP tile")
    if b:
        nt, L = m.node_tree, m.node_tree.links
        col, uv = colour_node(nt), uvxyz(nt)
        br = nt.nodes.new('ShaderNodeTexBrick')
        br.inputs['Scale'].default_value = 1.0
        br.inputs['Mortar Size'].default_value = .006
        br.inputs['Brick Width'].default_value = .24
        br.inputs['Row Height'].default_value = .065
        br.inputs['Mortar'].default_value = (.62, .6, .56, 1)
        L.new(uv.outputs[0], br.inputs['Vector'])
        dark = nt.nodes.new('ShaderNodeMix'); dark.data_type = 'RGBA'; dark.blend_type = 'MULTIPLY'; dark.inputs[0].default_value = 1
        L.new(col.outputs[0], dark.inputs[6]); dark.inputs[7].default_value = (.86, .86, .86, 1)
        L.new(col.outputs[0], br.inputs['Color1']); L.new(dark.outputs[2], br.inputs['Color2'])
        dirt = nt.nodes.new('ShaderNodeTexNoise'); dirt.inputs['Scale'].default_value = .35; dirt.inputs['Detail'].default_value = 4
        L.new(uv.outputs[0], dirt.inputs['Vector'])
        dr = nt.nodes.new('ShaderNodeValToRGB')
        dr.color_ramp.elements[0].position = .35; dr.color_ramp.elements[0].color = (.72, .7, .66, 1)
        dr.color_ramp.elements[1].position = .7; dr.color_ramp.elements[1].color = (1, 1, 1, 1)
        L.new(dirt.outputs['Fac'], dr.inputs[0])
        mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1
        L.new(br.outputs['Color'], mul.inputs[6]); L.new(dr.outputs[0], mul.inputs[7])
        L.new(mul.outputs[2], b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = .78
        bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .35; bump.inputs['Distance'].default_value = .004
        L.new(br.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    out['tile'] = m

    def plain(key, name, colour, rough=.6, metal=0., use_col=False, emit=None, alpha=1.):
        m, b = _mat(name)
        if b:
            if use_col:
                c = colour_node(m.node_tree)
                m.node_tree.links.new(c.outputs[0], b.inputs['Base Color'])
            else:
                b.inputs['Base Color'].default_value = srgb(colour)
            b.inputs['Roughness'].default_value = rough
            b.inputs['Metallic'].default_value = metal
            if emit:
                b.inputs['Emission Color'].default_value = srgb(emit[0])
                b.inputs['Emission Strength'].default_value = emit[1]
            if alpha < 1:
                b.inputs['Alpha'].default_value = alpha
                try:
                    m.surface_render_method = 'BLENDED'
                except AttributeError:
                    pass
        out[key] = m
    plain('trim', "TP trim", '#c9c5bc', .7)
    plain('glass', "TP window glass", '#1d2a33', .08, .2)
    plain('frame', "TP aluminium", '#b9bcbd', .35, .8)
    plain('iron', "TP iron grille", '#ffffff', .55, .5, use_col=True)
    plain('ac', "TP AC unit", '#e8e6df', .45)
    plain('acgrille', "TP AC grille", '#3a3d3f', .6, .3)
    plain('shopglass', "TP shop glass", '#5b6a70', .1, .1, emit=('#ffe2b0', .6))
    plain('ceiling', "TP arcade ceiling", '#a9a7a0', .9)
    plain('floor', "TP arcade floor", '#8b857a', .8)
    plain('sign', "TP sign", '#ffffff', .4, use_col=True)
    plain('signtext', "TP sign text", '#ffffff', .4, emit=('#ffffff', 1.2))
    plain('signtextdark', "TP sign text dark", '#151515', .5)
    plain('dark', "TP dark recess", '#2b2c2d', .9)

    # 鐵捲門與鐵皮屋浪板：波紋凹凸，顏色取頂點色
    for key, name, scale in (('shutter', "TP rolling shutter", 18.0), ('roofmetal', "TP corrugated roof", 7.0)):
        m, b = _mat(name)
        if b:
            nt, L = m.node_tree, m.node_tree.links
            col, uv = colour_node(nt), uvxyz(nt)
            L.new(col.outputs[0], b.inputs['Base Color'])
            wave = nt.nodes.new('ShaderNodeTexWave'); wave.wave_type = 'BANDS'
            wave.bands_direction = 'Y' if key == 'shutter' else 'X'
            wave.inputs['Scale'].default_value = scale
            L.new(uv.outputs[0], wave.inputs['Vector'])
            bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .5
            L.new(wave.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
            b.inputs['Roughness'].default_value = .45
            b.inputs['Metallic'].default_value = .55
        out[key] = m
    return out


# ------------------------------------------------------------------ geometry
class Frame:
    """牆面座標：原點在牆左下（a=0, d=0, z=base），u 沿牆、n 往外。"""

    def __init__(self, x0, y0, x1, y1, base, cx, cy):
        dx, dy = x1 - x0, y1 - y0
        self.W = math.hypot(dx, dy)
        self.u = (dx / self.W, dy / self.W)
        n = (dy / self.W, -dx / self.W)
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        if (mx - cx) * n[0] + (my - cy) * n[1] < 0:      # 朝建物中心就反向
            n = (-n[0], -n[1])
        self.n = n
        self.o = (x0, y0, base)

    def p(self, a, d, z):
        return (self.o[0] + self.u[0] * a + self.n[0] * d, self.o[1] + self.u[1] * a + self.n[1] * d, self.o[2] + z)


class OBuf:
    """沿牆方向盒：每個面依法線取 (a,z)、(d,z) 或 (a,d) 當 UV（公尺），可帶頂點色。"""

    def __init__(self):
        self.v, self.f, self.fm, self.uv, self.col, self.mats = [], [], [], [], [], []

    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def box(self, F, m, a0, a1, d0, d1, z0, z1, colour=(1, 1, 1, 1)):
        if a1 - a0 < 1e-4 or d1 - d0 < 1e-4 or z1 - z0 < 1e-4:
            return
        mi = self._mi(m)
        L = [(a0, d0, z0), (a1, d0, z0), (a1, d1, z0), (a0, d1, z0), (a0, d0, z1), (a1, d0, z1), (a1, d1, z1), (a0, d1, z1)]
        i = len(self.v)
        self.v += [F.p(*q) for q in L]
        faces = [((0, 3, 2, 1), 'ad'), ((4, 5, 6, 7), 'ad'), ((0, 1, 5, 4), 'az'), ((2, 3, 7, 6), 'az'),
                 ((1, 2, 6, 5), 'dz'), ((3, 0, 4, 7), 'dz')]
        for idx, plane in faces:
            self.f.append(tuple(i + k for k in idx))
            self.fm.append(mi)
            for k in idx:
                a, d, z = L[k]
                self.uv.append((a, z) if plane == 'az' else (d, z) if plane == 'dz' else (a, d))
                self.col.append(colour)

    def prism(self, m, tri, z0, z1, colour):
        """三角柱（屋頂鐵皮屋用）：tri 為三個 (x, y)。"""
        mi = self._mi(m)
        i = len(self.v)
        self.v += [(x, y, z0) for x, y in tri] + [(x, y, z1) for x, y in tri]
        faces = [(2, 1, 0), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]
        for idx in faces:
            self.f.append(tuple(i + k for k in idx))
            self.fm.append(mi)
            for k in idx:
                x, y, z = self.v[i + k]
                self.uv.append((x + y * .3, z) if len(idx) == 4 else (x, y))
                self.col.append(colour)

    def emit(self, name, parent):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        for m in self.mats:
            me.materials.append(m)
        for i, poly in enumerate(me.polygons):
            poly.material_index = self.fm[i]
        # 先建好兩層再一次寫入：新增屬性層會重配角點資料，交錯寫會寫到舊記憶體
        me.uv_layers.new(name='UVMap')
        me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        me.uv_layers['UVMap'].data.foreach_set('uv', [c for t in self.uv for c in t])
        me.color_attributes['Col'].data.foreach_set('color', [c for t in self.col for c in t])
        me.validate()
        ob = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(ob)
        ob.parent = parent
        return ob


# ------------------------------------------------------------------ facades
def street_wall(buf, F, H, fh, style, shop, colour, rng, M, texts):
    """一面臨街牆的精細立面。H 牆高、fh 樓高；texts 收集要放的文字 (內容, 位置, 方向基底, 大小, 材質)。"""
    W = F.W
    tile = srgb(colour)
    nb = max(1, round(W / 3.3))
    bw = W / nb
    floors = max(1, int(H / fh + .01))
    pw = min(.4, bw * .14)
    top = floors * fh
    # 樓板飾帶與女兒牆
    for f in range(1, floors):
        buf.box(F, M['trim'], 0, W, 0, .07, f * fh - .07, f * fh + .07)
    buf.box(F, M['tile'], 0, W, -.2, .02, top, top + 1.0, tile)
    buf.box(F, M['trim'], -.02, W + .02, -.25, .08, top + 1.0, top + 1.08)
    if top < H - .3:                       # 樓層數取整後剩下的牆
        buf.box(F, M['tile'], 0, W, -.25, 0, top, H, tile)

    # ---- 一樓
    if shop:
        AD = 3.0
        for k in range(nb + 1):            # 騎樓柱
            x = min(max(k * bw, .3), W - .3)
            buf.box(F, M['tile'], x - .3, x + .3, -.6, 0, 0, fh, tile)
        buf.box(F, M['tile'], 0, W, -.6, 0, fh - .65, fh, tile)               # 前樑
        buf.box(F, M['ceiling'], 0, W, -AD, -.6, fh - .55, fh - .45)          # 騎樓天花
        buf.box(F, M['tile'], 0, W, -AD - .2, -AD, fh - 1.0, fh - .45, tile)  # 店面上方牆
        buf.box(F, M['floor'], 0, W, -AD, 0, 0, .12)                          # 騎樓地坪
        for k in range(nb):
            x0, x1 = k * bw + .3, (k + 1) * bw - .3
            if rng.random() < .35:         # 鐵捲門（拉下）
                g = rng.choice(["#9aa0a3", "#b8bcbe", "#7d8488"])
                buf.box(F, M['shutter'], x0, x1, -AD - .05, -AD, .12, fh - 1.0, srgb(g))
            else:                          # 玻璃店面
                buf.box(F, M['dark'], x0, x1, -AD - .3, -AD - .25, .12, fh - 1.0)
                buf.box(F, M['shopglass'], x0 + .08, x1 - .08, -AD - .06, -AD - .04, .2, fh - 1.08)
                for xx in (x0, x1 - .06, (x0 + x1) / 2 - .03):
                    buf.box(F, M['frame'], xx, xx + .06, -AD - .06, -AD, .12, fh - 1.0)
                buf.box(F, M['frame'], x0, x1, -AD - .06, -AD, fh - 1.06, fh - 1.0)
            # 店招：掛在前樑外側
            sc = rng.choice(SIGN_COLOURS)
            buf.box(F, M['sign'], x0 - .2, x1 + .2, 0, .22, fh - 1.25, fh - .05, srgb(sc))
            name = rng.choice(SHOPS)
            light = sc not in ("#f5f5f0", "#f2c230")
            size = min(.62, (x1 - x0 + .2) / max(2, len(name)) * .9)
            texts.append((name, F.p((x0 + x1) / 2, .235, fh - .65), (F, 'front'), size,
                          M['signtext'] if light else M['signtextdark']))
    else:
        for k in range(nb):                # 住家一樓：車庫鐵捲門與門
            x = k * bw
            buf.box(F, M['tile'], x, x + pw, -.25, 0, 0, fh, tile)
            buf.box(F, M['tile'], x + bw - pw, x + bw, -.25, 0, 0, fh, tile)
            buf.box(F, M['tile'], x + pw, x + bw - pw, -.25, 0, 2.5, fh, tile)
            buf.box(F, M['shutter'], x + pw, x + bw - pw, -.2, -.15, 0, 2.5, srgb("#a3a8aa"))

    # ---- 上層
    for f in range(1, floors):
        z0 = f * fh
        sill, head = .9, fh - .45
        for k in range(nb):
            x = k * bw
            balcony = style == 1 and k % 2 == 1
            buf.box(F, M['tile'], x, x + pw, -.25, 0, z0, z0 + fh, tile)
            buf.box(F, M['tile'], x + bw - pw, x + bw, -.25, 0, z0, z0 + fh, tile)
            buf.box(F, M['tile'], x + pw, x + bw - pw, -.25, 0, z0 + head, z0 + fh, tile)
            ox0, ox1 = x + pw, x + bw - pw
            if balcony:                    # 陽台：樓板外推、矮牆、落地門
                buf.box(F, M['trim'], ox0 - .1, ox1 + .1, 0, 1.0, z0, z0 + .15)
                buf.box(F, M['tile'], ox0 - .1, ox1 + .1, .9, 1.0, z0 + .15, z0 + 1.05, tile)
                buf.box(F, M['tile'], ox0 - .1, ox0, 0, .9, z0 + .15, z0 + 1.05, tile)
                buf.box(F, M['tile'], ox1, ox1 + .1, 0, .9, z0 + .15, z0 + 1.05, tile)
                buf.box(F, M['glass'], ox0, ox1, -.2, -.18, z0, z0 + head)
                for xx in (ox0, (ox0 + ox1) / 2 - .025, ox1 - .05):
                    buf.box(F, M['frame'], xx, xx + .05, -.2, -.14, z0, z0 + head)
                continue
            buf.box(F, M['tile'], ox0, ox1, -.25, 0, z0, z0 + sill, tile)
            buf.box(F, M['trim'], ox0 - .06, ox1 + .06, 0, .09, z0 + sill - .06, z0 + sill)   # 窗台
            buf.box(F, M['glass'], ox0, ox1, -.2, -.18, z0 + sill, z0 + head)
            for a0, a1, b0, b1 in ((ox0, ox0 + .05, sill, head), (ox1 - .05, ox1, sill, head),
                                   ((ox0 + ox1) / 2 - .025, (ox0 + ox1) / 2 + .025, sill, head),
                                   (ox0, ox1, sill, sill + .05), (ox0, ox1, head - .05, head)):
                buf.box(F, M['frame'], a0, a1, -.2, -.13, z0 + b0, z0 + b1)
            # 老公寓鐵窗
            if style == 0 and rng.random() < .68:
                ic = srgb(rng.choice(IRON))
                d1 = .42 + rng.random() * .12
                zb, zt = z0 + sill - .12, z0 + head + .12
                for a in (ox0 - .08, ox1 + .05):
                    buf.box(F, M['iron'], a, a + .03, 0, d1, zb, zt, ic)
                    buf.box(F, M['iron'], a, a + .03, d1 - .03, d1, zb, zt, ic)
                for zz in (zb, zt - .03, (zb + zt) / 2):
                    buf.box(F, M['iron'], ox0 - .08, ox1 + .08, d1 - .03, d1, zz, zz + .03, ic)
                    buf.box(F, M['iron'], ox0 - .08, ox0 - .05, 0, d1, zz, zz + .03, ic)
                    buf.box(F, M['iron'], ox1 + .05, ox1 + .08, 0, d1, zz, zz + .03, ic)
                a = ox0 - .05
                while a < ox1 + .05:
                    buf.box(F, M['iron'], a, a + .016, d1 - .02, d1 - .004, zb, zt, ic)
                    a += .13
                buf.box(F, M['roofmetal'], ox0 - .2, ox1 + .2, 0, d1 + .18, zt + .05, zt + .09, srgb(rng.choice(ROOF_METAL)))
            # 冷氣機：窗下或鐵窗下
            if rng.random() < .38:
                ac = (ox0 + ox1) / 2 + (rng.random() - .5) * (ox1 - ox0 - .9)
                za = z0 + sill - .75
                buf.box(F, M['ac'], ac - .4, ac + .4, .04, .32, za, za + .52)
                buf.box(F, M['acgrille'], ac - .36, ac + .16, .32, .335, za + .06, za + .46)
                for s in (-.3, .3):
                    buf.box(F, M['frame'], ac + s - .02, ac + s + .02, 0, .34, za - .05, za)

    # ---- 直立招牌（店面才有）
    if shop and floors > 1:
        for k in range(1, nb):
            if rng.random() > .55:
                continue
            x = k * bw
            L = min(H - fh - .8, 2.2 + rng.random() * 2.2)
            if L < 1.5:
                continue
            z0 = fh + .4
            sc = rng.choice(SIGN_COLOURS)
            buf.box(F, M['frame'], x - .1, x + .1, .2, 1.0, z0 - .05, z0 + L + .05)
            buf.box(F, M['sign'], x - .085, x + .085, .23, .97, z0, z0 + L, srgb(sc))
            name = rng.choice(SHOPS)
            light = sc not in ("#f5f5f0", "#f2c230")
            chars = name[:max(2, int(L / .62))]
            for side in (1, -1):
                texts.append(("\n".join(chars), F.p(x + side * .1, .6, z0 + L / 2), (F, 'side%d' % side), .5,
                              M['signtext'] if light else M['signtextdark']))


def roof_shed(buf, b, rng, M):
    """老公寓頂樓鐵皮加蓋：最高屋頂三角形往中心內縮 6%，擠出 2.4–3.0 m，回傳加蓋高度（無則 0）。"""
    r = b['roofs']
    if len(r) < 9:
        return 0.0
    tris = [[(r[k], r[k + 1], r[k + 2]), (r[k + 3], r[k + 4], r[k + 5]), (r[k + 6], r[k + 7], r[k + 8])] for k in range(0, len(r), 9)]
    zt = max(p[2] for t in tris for p in t)
    tris = [t for t in tris if min(p[2] for p in t) > zt - .5]
    xs = [p[0] for t in tris for p in t]
    ys = [p[1] for t in tris for p in t]
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    h = 2.4 + rng.random() * .6
    colour = srgb(rng.choice(ROOF_METAL))
    for t in tris:
        tri = [(cx + (x - cx) * .94, cy + (y - cy) * .94) for x, y, _ in t]
        buf.prism(M['roofmetal'], tri, zt + .02, zt + h, colour)
    return h


def make_texts(texts, font, parent):
    """店招文字：front 面向街外；side±1 直排字在直立招牌兩面。"""
    from mathutils import Matrix, Vector
    for i, (body, loc, (F, orient), size, mat) in enumerate(texts):
        u = Vector((F.u[0], F.u[1], 0))
        n = Vector((F.n[0], F.n[1], 0))
        z = Vector((0, 0, 1))
        if orient == 'front':
            x, nz = u, n                   # 字的 x 沿牆、法線朝外
        elif orient == 'side1':
            x, nz = -n, u
        else:
            x, nz = n, -u
        basis = Matrix((x, z, x.cross(z))).transposed()
        if (basis.col[2] - nz).length > .1:        # 確保文字正面朝外
            basis = Matrix((-x, z, (-x).cross(z))).transposed()
        cu = bpy.data.curves.new(f"Sign text {i}", 'FONT')
        cu.body = body
        if font:
            cu.font = font
        cu.size = size
        cu.extrude = .005
        cu.align_x = 'CENTER'
        cu.align_y = 'CENTER'
        cu.space_line = .85
        ob = bpy.data.objects.new(f"Sign text {i}", cu)
        bpy.context.collection.objects.link(ob)
        ob.data.materials.append(mat)
        ob.matrix_world = Matrix.Translation(Vector(loc)) @ basis.to_4x4()
        ob.parent = parent
        ob.matrix_parent_inverse = parent.matrix_world.inverted()
