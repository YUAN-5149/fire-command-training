# -*- coding: utf-8 -*-
"""Taipei City Fire Department disaster survey car (臺北市 災情勘查車),
on a Mitsubishi Outlander (4th generation) body.

Built in the idiom of the water tanker (../water-tanker/build_water_tanker.py)
and the aerial ladder before it: the same helper library (boxes, rods,
boolean carving, Weld, decals, empties, studio) and the same conventions
(nose to -X, driver on -Y, Z up, metres, tyres standing on z = 0).

What is new for a passenger-car body:

  * the shell is two lofts - a lower body (superellipse rings, filleted at
    nose and tail) and a greenhouse (tumblehome rings over the beltline);
  * everything that sits ON the curved skin - glass, blackout, lamps, grille,
    stripes, emblem, lettering - is placed by ray casting onto the shell
    (`conform`, `stick`), not by hand-computed surface formulas.  The tanker
    could place parts on flat slabs; an SUV skin is curved everywhere and a
    hand-written surface model would drift from the mesh actually built.

Reference
    臺北市政府消防局「消防車輛大觀 - 災情勘查車」: 車長約 4.71 m、車寬約 2.19 m、
    車高約 1.98 m；通訊設備、絞盤、災情監視，可作臨時搶救指揮站。
    Mitsubishi Outlander (2022-, 4th gen): 4 710 x 1 862 x 1 745 mm,
    wheelbase 2 705 mm, 255/45 R20.  Width with mirrors and height with the
    light bar and camera match the department's 2.19 m / 1.98 m.

Run:  blender -b --factory-startup -P build_survey_car.py
      (or: python build_survey_car.py with the `bpy` wheel)
      SURVEY_SAMPLES=32 SURVEY_ONLY=survey_front.png  -> quick preview
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

OUT = os.path.dirname(os.path.abspath(__file__))
TAU = math.tau

# --------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
if bpy.context.scene.world is None:
    bpy.context.scene.world = bpy.data.worlds.new('World')


# ---------------------------------------------------------------- materials
def mat(name, color, metal=0.0, rough=.35, coat=0.0, emit=None, trans=0.0, alpha=1.0):
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
    if alpha < 1.0:
        p.inputs['Alpha'].default_value = alpha
    m.diffuse_color = (*color, 1)
    return m


# Taipei fire red, a little brighter than the truck red so the small body
# does not go maroon under AgX.
RED     = mat('Fire engine red',        (.56, .018, .014), .0, .18, .85)
RUBBER  = mat('Tyre rubber',            (.013, .014, .015), .0, .80)
PLASTIC = mat('Black cladding plastic', (.022, .023, .025), .0, .62)
GLOSSBK = mat('Gloss black trim',       (.010, .011, .012), .0, .10, .8)
TRIM    = mat('Graphite trim',          (.042, .046, .050), .25, .38)
CHROME  = mat('Chrome',                 (.80, .82, .84), 1.0, .07)
SATIN   = mat('Satin silver',           (.48, .50, .52), .85, .30)
ALLOY   = mat('Wheel alloy',            (.56, .58, .60), .9, .22)
ALLOY_D = mat('Wheel alloy, dark',      (.05, .055, .06), .7, .35)
DISC    = mat('Brake disc',             (.30, .30, .31), .9, .45)
GLASS   = mat('Windscreen glass',       (.86, .90, .90), .0, .008, .0, trans=1.0)
GLASS_T = mat('Side window glass',      (.20, .23, .24), .0, .014, .0, trans=.80)
CLOTH   = mat('Seat trim',              (.050, .052, .058), .0, .72)
PANEL   = mat('Cab lining',             (.090, .094, .100), .0, .62)
DASH    = mat('Dashboard moulding',     (.035, .037, .040), .0, .55)
SCREEN  = mat('Monitor screen',         (.02, .05, .08), .0, .10, emit=((.20, .55, .85), 1.2))
YELLOW  = mat('Reflective yellow',      (.78, .84, .020), .05, .30,
              emit=((.62, .70, .02), .18))
WHITE   = mat('Lettering white',        (.90, .92, .91), .05, .30)
LAMP    = mat('Headlamp lens',          (.93, .95, .97), .0, .030, 1.0, trans=.94)
GLOW    = mat('Lamp element',           (1.0, .97, .92), .0, .30,
              emit=((1.0, .97, .92), 4.0))
# Taiwanese fire apparatus run red warning lamps.  A strong red emission gets
# pushed to pink by AgX (tanker, 算圖紀錄 1), so: dark red base, low emission.
BEACON  = mat('Red beacon lens',        (.30, .004, .004), .10, .10,
              emit=((1.0, .02, .015), .35))
# the lens must not match the paint (it vanished into the body), and a strong
# red glow goes pink under AgX (the tanker's lesson, repeated here at 1.6):
# a deep ruby lens with a beacon-level glow
TAILRED = mat('Tail lamp lens',         (.24, .003, .006), .05, .06, .6,
              emit=((1.0, .03, .03), .30))
AMBER   = mat('Amber lens',             (.72, .26, .010), .10, .15)
PLATE   = mat('Plate white',            (.86, .87, .86), .0, .40)

# ---------------------------------------------------------------- geometry
CUBE_F = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
          (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
CUBE_S = ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
          (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1))


def _smooth(o, angle=32):
    bpy.context.view_layer.objects.active = o
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
    except Exception:
        pass


def _finish(o, material, bevel, seg, smooth):
    o.data.materials.append(material)
    if bevel:
        b = o.modifiers.new('Edge break', 'BEVEL')
        b.width, b.segments, b.limit_method = bevel, seg, 'ANGLE'
        b.angle_limit = math.radians(35)
    if smooth:
        _smooth(o)
    return o


def _mesh(name, verts, faces, material, bevel=.01, seg=2, smooth=True):
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


def box(name, loc, size, material, bevel=.01, seg=2, smooth=True):
    h = (size[0] / 2, size[1] / 2, size[2] / 2)
    verts = [(loc[0] + sx * h[0], loc[1] + sy * h[1], loc[2] + sz * h[2])
             for sx, sy, sz in CUBE_S]
    return _mesh(name, verts, CUBE_F, material, bevel, seg, smooth)


def frame_of(n, up=(0, 0, 1)):
    """Orthonormal frame (right, up, normal) for a part lying on a surface
    whose outward normal is n.  right = up x n, so lettering reads correctly
    to someone looking at the surface from outside."""
    n = Vector(n).normalized()
    u = Vector(up)
    u = (u - n * u.dot(n))
    if u.length < 1e-6:
        u = Vector((1, 0, 0)) - n * n.x
    u.normalize()
    r = u.cross(n)
    return r, u, n


def obox(name, centre, n, size, material, up=(0, 0, 1), bevel=.006, seg=2):
    """Box aligned to a surface frame: size = (across, up, along normal)."""
    r, u, nn = frame_of(n, up)
    c = Vector(centre)
    verts = [tuple(c + r * (sx * size[0] / 2) + u * (sy * size[1] / 2) + nn * (sz * size[2] / 2))
             for sx, sy, sz in CUBE_S]
    return _mesh(name, verts, CUBE_F, material, bevel, seg, True)


def cyl(name, loc, radius, depth, material, axis='Y', verts=40, bevel=.004):
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
    return _finish(o, material, .003, 2, True)


def sphere(name, loc, r, material, seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=loc)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return o


def bake(o):
    """Apply every modifier so later booleans and ray casts see the result."""
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


# Fonts: Microsoft JhengHei on the Windows workstation, WenQuanYi Zen Hei on
# Linux.  The tanker only looked for the Windows path; on any other machine
# Blender fell back to its Latin-only font and every CJK glyph came out empty.
FONT = None
for path in ('C:/Windows/Fonts/msjhbd.ttc', 'C:/Windows/Fonts/msjh.ttc',
             '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
             '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'):
    if os.path.exists(path):
        try:
            FONT = bpy.data.fonts.load(path)
            break
        except Exception:
            continue
print('FONT', FONT.filepath if FONT else 'none - CJK lettering will be empty', flush=True)


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


# ------------------------------------------------------------ surface tools
class Shell:
    """Ray-cast target built from the baked body panels (world space)."""

    def __init__(self, objs):
        bm = bmesh.new()
        dg = bpy.context.evaluated_depsgraph_get()
        for o in objs:
            ob = o.evaluated_get(dg)
            me = ob.to_mesh()
            me.transform(o.matrix_world)
            bm.from_mesh(me)
            ob.to_mesh_clear()
        bm.normal_update()
        self.tree = BVHTree.FromBMesh(bm)
        bm.free()

    # axis: 'y' -> 2D (x, z), ray along -sign*Y from sign*5
    #       'x' -> 2D (y, z), ray along -sign*X
    #       'z' -> 2D (x, y), ray straight down
    @staticmethod
    def ray(axis, sign, u, v):
        if axis == 'y':
            return Vector((u, sign * 6.0, v)), Vector((0, -sign, 0))
        if axis == 'x':
            return Vector((sign * 6.0, u, v)), Vector((-sign, 0, 0))
        return Vector((u, v, 6.0)), Vector((0, 0, -1))

    def hit(self, axis, sign, u, v):
        o, d = self.ray(axis, sign, u, v)
        loc, n, _, _ = self.tree.ray_cast(o, d)
        if loc is None:
            return None, None
        if n.dot(d) > 0:
            n = -n
        return loc, n


def conform(name, shell, poly, axis, sign, material, off=.004, cell=.035, uv=None):
    """A thin panel laid on the shell inside the 2D outline `poly`.

    The outline is cut into grid cells (clip_rect), every corner is ray cast
    onto the shell and lifted `off` along the normal.  Cells that miss the
    shell (wheel arches, past the silhouette) are dropped.  uv=(u0, v0, u1, v1,
    flip) maps the outline's bounding box to 0..1 for decals.
    """
    us = [p[0] for p in poly]
    vs = [p[1] for p in poly]
    umin, umax, vmin, vmax = min(us), max(us), min(vs), max(vs)
    nu = max(1, math.ceil((umax - umin) / cell))
    nv = max(1, math.ceil((vmax - vmin) / cell))
    du, dv = (umax - umin) / nu, (vmax - vmin) / nv
    verts, faces, uvs = [], [], []
    for i in range(nu):
        for j in range(nv):
            sub = clip_rect(poly, umin + i * du, vmin + j * dv,
                            umin + (i + 1) * du, vmin + (j + 1) * dv)
            if not sub:
                continue
            pts = []
            for su, sv in sub:
                loc, n = shell.hit(axis, sign, su, sv)
                if loc is None:
                    pts = None
                    break
                pts.append(loc + n * off)
            if not pts:
                continue
            b = len(verts)
            verts += [tuple(p) for p in pts]
            if uv:
                u0, v0, u1, v1, flip = uv
                for su, sv in sub:
                    s = (su - u0) / (u1 - u0)
                    uvs.append((1 - s if flip else s, (sv - v0) / (v1 - v0)))
            faces += [(b, b + k, b + k + 1) for k in range(1, len(pts) - 1)]
    if not faces:
        print('conform: nothing hit for', name, flush=True)
        return None
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if uv:
        layer = me.uv_layers.new(name='UVMap')
        for poly_ in me.polygons:
            for li in poly_.loop_indices:
                layer.data[li].uv = uvs[me.loops[li].vertex_index]
    bm = bmesh.new()
    bm.from_mesh(me)
    if not uv:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=.0008)
    # face the panel outward (towards the ray origin)
    o_, d_ = Shell.ray(axis, sign, (umin + umax) / 2, (vmin + vmax) / 2)
    for f in bm.faces:
        if f.normal.dot(d_) > 0:
            f.normal_flip()
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    for p_ in me.polygons:
        p_.use_smooth = True
    return o


def strip(name, shell, pts, width, axis, sign, material, off=.005, cell=.03):
    """A band of constant width along a 2D polyline, conformed to the shell."""
    poly_l, poly_r = [], []
    for i, p in enumerate(pts):
        a = Vector(pts[max(i - 1, 0)])
        b = Vector(pts[min(i + 1, len(pts) - 1)])
        t = (b - a).normalized()
        nrm = Vector((-t.y, t.x)) * (width / 2)
        poly_l.append(tuple(Vector(p) + nrm))
        poly_r.append(tuple(Vector(p) - nrm))
    objs = []
    for i in range(len(pts) - 1):
        quad_ = [poly_l[i], poly_l[i + 1], poly_r[i + 1], poly_r[i]]
        o = conform(name, shell, quad_, axis, sign, material, off, cell)
        if o:
            objs.append(o)
    if len(objs) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
    return objs[0] if objs else None


def stick(shell, axis, sign, u, v, proud=0.0):
    """Surface point and normal under (u, v), lifted `proud` metres."""
    loc, n = shell.hit(axis, sign, u, v)
    if loc is None:
        raise RuntimeError('stick missed the shell at %s %s %.3f %.3f' % (axis, sign, u, v))
    return loc + n * proud, n


def text(name, body, loc, n, size, material, up=(0, 0, 1), extrude=.0012, off=.004):
    """Lettering laid flat on the surface tangent plane at loc."""
    c = bpy.data.curves.new(name, 'FONT')
    c.body, c.size, c.align_x, c.align_y = body, size, 'CENTER', 'CENTER'
    c.extrude = extrude
    if FONT:
        c.font = FONT
    o = bpy.data.objects.new(name, c)
    bpy.context.collection.objects.link(o)
    r, u, nn = frame_of(n, up)
    m = Matrix((r, u, nn)).transposed().to_4x4()
    m.translation = Vector(loc) + nn * (off + extrude)
    o.matrix_world = m
    c.materials.append(material)
    return o


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


def join(name, objs):
    objs = [o for o in objs if o]
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


# --------------------------------------------------------------- dimensions
# Mitsubishi Outlander, 4th generation (Taiwan 2025-): 4 710 x 1 862 x 1 745,
# wheelbase 2 705, 255/45 R20 (737 mm tyre).  Overhangs 0.940 / 1.065.
FRONT, REAR = -2.355, 2.355
HW = 0.931
WHEELBASE = 2.705
AX_F = FRONT + 0.940
AX_R = AX_F + WHEELBASE
TIRE_R = 0.369
AXLE_Z = TIRE_R
TRACK = 1.600
WHEEL_W = 0.255
ARCH_R = 0.430
ROOF_Z = 1.745
XWS = -0.98                       # windscreen base (cowl)
CALLSIGN = '信義勘查'              # unit name on the windscreen; change per station
PLATE_NO = 'RFA-1190'              # fictitious plate
SEATS = 5

# ------------------------------------------------------------- lower body
LB_N, LB_RING = 7.0, 80


def lb_section(x):
    """(half width, bottom z, top z, x-lean) of the lower body at station x."""
    a = HW - 0.018 * max(0.0, (x - 1.55) / 0.80) ** 2
    z0 = 0.340 + 0.10 * max(0.0, (x - 1.70) / 0.65) ** 2 + 0.05 * max(0.0, (-1.85 - x) / 0.50) ** 2
    if x < XWS:
        t = (x - FRONT) / (XWS - FRONT)
        z1 = 1.045 + 0.075 * (1 - (1 - t) ** 1.4)
    else:
        t = (x - XWS) / (REAR - XWS)
        z1 = 1.120 + 0.065 * t ** 1.2
    # plan-view corners are big (the nose wraps), section corners small
    for end, length, dy, dz0, dz1 in ((FRONT, .42, .26, .05, .045), (REAR, .26, .20, .09, .06)):
        u = abs(x - end) / length
        if u < 1.0:
            k = 1.0 - math.sqrt(max(0.0, 1.0 - (1.0 - u) ** 2))
            a -= dy * k
        uz = abs(x - end) / (length * .35)
        if uz < 1.0:
            kz = 1.0 - math.sqrt(max(0.0, 1.0 - (1.0 - uz) ** 2))
            z0 += dz0 * kz
            z1 -= dz1 * kz
    return a, z0, z1


def lb_ring(x):
    a, z0, z1 = lb_section(x)
    zc, b = (z0 + z1) / 2, (z1 - z0) / 2
    e = 2.0 / LB_N
    ring = []
    wf = max(0.0, 1.0 - (x - FRONT) / 0.50)     # nose leans back at the top
    wr = max(0.0, 1.0 - (REAR - x) / 0.40)      # tailgate leans forward
    for i in range(LB_RING):
        t = TAU * i / LB_RING
        cs, sn = math.cos(t), math.sin(t)
        y = a * math.copysign(abs(cs) ** e, cs)
        z = zc + b * math.copysign(abs(sn) ** e, sn)
        tz = (z - z0) / (z1 - z0)
        ring.append((x + 0.07 * wf * tz ** 2 - 0.05 * wr * tz ** 2 + 0.03 * wf * (1 - tz) ** 3,
                     y, z))
    return ring


def loft(name, stations, ring_fn, material, closed=True, cap=True):
    rings = [ring_fn(x) for x in stations]
    n = len(rings[0])
    v, f = [], []
    for r in rings:
        v.extend(r)
    span = n if closed else n - 1
    for k in range(len(rings) - 1):
        o0, o1 = k * n, (k + 1) * n
        for i in range(span):
            j = (i + 1) % n
            f.append((o0 + i, o0 + j, o1 + j, o1 + i))
    if cap:
        for base, flip in ((0, True), ((len(rings) - 1) * n, False)):
            c = len(v)
            v.append(tuple(sum(v[base + i][d] for i in range(n)) / n for d in range(3)))
            for i in range(span):
                j = (i + 1) % n
                f.append((c, base + j, base + i) if flip else (c, base + i, base + j))
    return _mesh(name, v, f, material, bevel=0, seg=1, smooth=True)


def stations(x0, x1, f0, f1, step=.08, n_end=9):
    s = [x0 + f0 * (1 - math.cos(math.pi / 2 * i / n_end)) for i in range(n_end)]
    a, b = x0 + f0, x1 - f1
    m = max(2, int((b - a) / step))
    s += [a + (b - a) * j / m for j in range(m + 1)]
    s += [x1 - f1 * (1 - math.cos(math.pi / 2 * i / n_end)) for i in range(n_end - 1, -1, -1)]
    out = []
    for x in s:
        if not out or x - out[-1] > 1e-4:
            out.append(x)
    return out


body = loft('Body shell', stations(FRONT, REAR, .42, .26, .06, 12), lb_ring, RED)

# -------------------------------------------------------------- greenhouse
XG0, XA, XR0, XG1 = XWS, -0.10, 1.96, 2.29
GH_N, GH_HALF = 5.0, 22


def gh_section(x):
    """(half width at belt, half width at roof, bottom z, top z) at x."""
    _, _, z1 = lb_section(x)
    zb = z1 - 0.12
    if x <= XA:
        t = (x - XG0) / (XA - XG0)
        f = (t if t < .78 else .78 + (t - .78) - (t - .78) ** 2 / (2 * .22)) / (1 - .11)
        zt = z1 + (1.735 - z1) * min(1.0, f)
    elif x <= XR0:
        zt = 1.735 - 0.030 * ((x - XA) / (XR0 - XA)) ** 1.6
    else:
        t = (x - XR0) / (XG1 - XR0)
        zt = 1.705 + (z1 - 1.705) * t ** 1.45
    tf = min(1.0, (x - XG0) / 0.55)
    tr = min(1.0, (XG1 - x) / 0.45)
    # kept well inside the tail's plan taper: where the two shells ran nearly
    # coincident the render striped (z-fighting) at the D-pillar
    wb = 0.875 - 0.06 * (1 - tf) ** 1.5 - 0.13 * (1 - tr) ** 1.5
    wt = wb - 0.165
    return wb, wt, zb, zt


def gh_ring(x):
    wb, wt, zb, zt = gh_section(x)
    h = max(zt - zb, 1e-3)
    e = 2.0 / GH_N
    half = []
    for i in range(GH_HALF + 1):
        phi = (math.pi / 2) * i / GH_HALF
        u = math.cos(phi) ** e
        v = math.sin(phi) ** e
        half.append((u * (wb + (wt - wb) * v), zb + v * h))
    ring = [(x, -y, z) for y, z in half] + [(x, y, z) for y, z in reversed(half[:-1])]
    return ring


greenhouse = loft('Greenhouse', stations(XG0, XG1, .30, .20, .05, 8), gh_ring, RED,
                  closed=False, cap=True)

# ----------------------------------------------------------- wheel arches
for ax in (AX_F, AX_R):
    c = cyl('Arch cutter', (ax, 0, AXLE_Z + .015), ARCH_R, 3.0, RUBBER, verts=64, bevel=0)
    carve(body, c)
    bpy.data.objects.remove(c, do_unlink=True)
# wheelhouse liners so the arch does not show the empty inside of the shell
for ax in (AX_F, AX_R):
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=ARCH_R - .005, depth=.36,
                                            location=(ax, side * (TRACK / 2 - .02), AXLE_Z + .015),
                                            rotation=(math.pi / 2, 0, 0))
        liner = bpy.context.object
        liner.name = 'Wheelhouse liner'
        liner.data.materials.append(PLASTIC)
        bm = bmesh.new()
        bm.from_mesh(liner.data)
        # keep the upper half only and drop the caps: an open half-tube
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if len(f.verts) > 4], context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if (liner.matrix_world @ v.co).z < AXLE_Z - .05],
                         context='VERTS')
        bm.to_mesh(liner.data)
        bm.free()
        sm = liner.modifiers.new('Liner', 'SOLIDIFY')
        sm.thickness = .01
        for p in liner.data.polygons:
            p.use_smooth = True
bake(body)
_smooth(body, 40)
_smooth(greenhouse, 40)
SHELL = Shell([body, greenhouse])

# ------------------------------------------------- glass and window blackout
# Side daylight opening (DLO) in (x, z), from the A-pillar back to the
# kicked-up quarter light.  The whole DLO is first blacked out (gloss black
# B/C pillars - the "floating roof"), then the panes are laid on top.
A_LINE = lambda z: XG0 + 0.17 + (z - 1.12) * 1.32      # x of the A-pillar trailing edge at z
DLO_BOT = lambda x: 1.115 + 0.040 * max(0.0, (x + 0.8) / 2.6) + (0.07 * max(0.0, (x - 1.25) / 0.6) ** 1.5)
DLO_TOP_Z = 1.660


def dlo_outline():
    pts = [(A_LINE(1.13), 1.13)]
    for i in range(14):
        x = A_LINE(1.13) + (1.88 - A_LINE(1.13)) * (i + 1) / 14
        pts.append((x, DLO_BOT(x)))
    pts += [(1.90, 1.42), (1.86, 1.585), (1.72, 1.640), (1.20, DLO_TOP_Z), (0.10, DLO_TOP_Z),
            (A_LINE(DLO_TOP_Z) + .07, DLO_TOP_Z), (A_LINE(1.60), 1.60)]
    return pts


B_PIL = (0.13, 0.225)
C_PIL = (1.11, 1.19)


def inset_rect_panes():
    """Front door, rear door and quarter panes, inset from the DLO edge."""
    g = .022
    fd = [(A_LINE(1.13 + g) + g, DLO_BOT(A_LINE(1.13)) + g), (B_PIL[0] - g / 2, DLO_BOT(B_PIL[0]) + g),
          (B_PIL[0] - g / 2, DLO_TOP_Z - g), (A_LINE(DLO_TOP_Z) + .07, DLO_TOP_Z - g),
          (A_LINE(1.60) + g, 1.60 - g)]
    rd = [(B_PIL[1] + g / 2, DLO_BOT(B_PIL[1]) + g), (C_PIL[0] - g / 2, DLO_BOT(C_PIL[0]) + g),
          (C_PIL[0] - g / 2, DLO_TOP_Z - g), (B_PIL[1] + g / 2, DLO_TOP_Z - g)]
    q = [(C_PIL[1] + g / 2, DLO_BOT(C_PIL[1]) + g)]
    for i in range(8):
        x = C_PIL[1] + (1.88 - C_PIL[1]) * (i + 1) / 8 - g
        q.append((x, DLO_BOT(x) + g))
    q += [(1.90 - 2 * g, 1.42), (1.86 - g, 1.585 - g), (1.72, 1.640 - g), (C_PIL[1] + g / 2, DLO_TOP_Z - g)]
    return fd, rd, q


for side in (-1, 1):
    conform('Window blackout', SHELL, dlo_outline(), 'y', side, GLOSSBK, .002, .03)
    for pane in inset_rect_panes():
        conform('Side window', SHELL, pane, 'y', side, GLASS_T, .006, .03)
    # bright beltline strip along the bottom of the DLO
    belt = [(A_LINE(1.13) + .02, DLO_BOT(A_LINE(1.13)) - .012)]
    belt += [(x, DLO_BOT(x) - .012) for x in [A_LINE(1.13) + .02 + (1.86 - A_LINE(1.13)) * i / 16
                                              for i in range(1, 17)]]
    strip('Belt moulding', SHELL, belt, .014, 'y', side, CHROME, .005)

# windscreen, from above (it is raked ~35 degrees)
ws = [(XG0 + .05, -0.69), (XG0 + .05, 0.69), (XA - .07, 0.625), (XA - .07, -0.625)]
# The screen is see-through: only a black frit border, and the greenhouse
# shell under the glass is opened (first cut blacked out the whole screen,
# which hid the cab and the call sign behind it).
WS_OUT = [(XG0 + .03, -0.72), (XG0 + .03, 0.72), (XA - .04, 0.65), (XA - .04, -0.65)]
WS_IN = [(XG0 + .12, -0.61), (XG0 + .12, 0.61), (XA - .12, 0.555), (XA - .12, -0.555)]
WS_HOLE = [(XG0 + .09, -0.64), (XG0 + .09, 0.64), (XA - .09, 0.58), (XA - .09, -0.58)]


def inside(pt, poly):
    c = False
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i], poly[i - 1]
        if (y0 > pt[1]) != (y1 > pt[1]) and pt[0] < (x1 - x0) * (pt[1] - y0) / (y1 - y0) + x0:
            c = not c
    return c


join('Windscreen frit', [conform('Windscreen frit', SHELL, [WS_OUT[i], WS_OUT[(i + 1) % 4],
                                                             WS_IN[(i + 1) % 4], WS_IN[i]],
                                 'z', 1, GLOSSBK, .002, .03) for i in range(4)])
conform('Windscreen', SHELL, ws, 'z', 1, GLASS, .006, .03)
_bm = bmesh.new()
_bm.from_mesh(greenhouse.data)
_bm.normal_update()
bmesh.ops.delete(_bm, geom=[f for f in _bm.faces if f.normal.z > .2 and
                            all(inside((v.co.x, v.co.y), WS_HOLE) for v in f.verts)], context='FACES')
_bm.to_mesh(greenhouse.data)
_bm.free()
# ...and the lower body's top inside the greenhouse footprint, which would
# otherwise read as a red floor at belt height behind the glass
_bm = bmesh.new()
_bm.from_mesh(body.data)
_bm.normal_update()
bmesh.ops.delete(_bm, geom=[f for f in _bm.faces if f.normal.z > .3 and
                            all(XWS + .06 < v.co.x < XG1 - .12 and abs(v.co.y) < .76 and v.co.z > .9
                                for v in f.verts)], context='FACES')
_bm.to_mesh(body.data)
_bm.free()
# tailgate glass, from behind
rg = [(-0.58, 1.27), (0.58, 1.27), (0.52, 1.62), (-0.52, 1.62)]
conform('Rear glass blackout', SHELL, [(-0.62, 1.24), (0.62, 1.24), (0.56, 1.65), (-0.56, 1.65)],
        'x', 1, GLOSSBK, .002, .03)
conform('Rear window', SHELL, rg, 'x', 1, GLASS_T, .006, .03)

# ---------------------------------------------------------- shut lines
SHUT = mat('Panel gap', (.008, .006, .006), .0, .60)
for side in (-1, 1):
    for pts in ([(-0.86, 0.80), (-0.86, 1.10)],                         # front door, leading edge
                [(0.18, 0.42), (0.18, 1.13)],                           # B-pillar
                [(1.14, 0.87), (1.14, 1.16)],                           # rear door, trailing edge
                [(-0.86, 0.80), (-0.83, 0.62), (-0.80, 0.44)],
                [(-0.80, 0.445), (1.00, 0.445)],                        # door bottoms
                [(1.14, 0.87), (1.00, 0.80), (0.91, 0.66), (0.88, 0.48)]):
        strip('Door shut line', SHELL, pts, .006, 'y', side, SHUT, .0015, .02)
    # bonnet shut line along the fender top
    strip('Bonnet shut line', SHELL, [(FRONT + .25, side * .70), (XWS - .03, side * .74)],
          .006, 'z', 1, SHUT, .0015, .02)
strip('Bonnet rear shut line', SHELL, [(XWS - .02, -.74), (XWS - .02, .74)], .006, 'z', 1, SHUT, .0015, .02)
for pts in ([(-0.66, 0.90), (0.66, 0.90)], [(-0.66, 0.90), (-0.70, 1.20)], [(0.66, 0.90), (0.70, 1.20)]):
    strip('Tailgate shut line', SHELL, pts, .006, 'x', 1, SHUT, .0015, .02)

# ---------------------------------------------------- the front (Dynamic Shield)
_F = lambda y, z, p=0.0: stick(SHELL, 'x', -1, y, z, p)
for side in (-1, 1):
    s = side
    # slim LED daytime running lamp under the bonnet edge, wrapping the corner
    strip('Daytime running lamp', SHELL, [(s * .48, .925), (s * .70, .935), (s * .86, .930)], .028,
          'x', -1, GLOW, .006, .015)
    conform('Headlamp housing', SHELL, [(s * .60, .63), (s * .855, .63), (s * .87, .80), (s * .60, .80)][::s],
            'x', -1, GLOSSBK, .004, .025)
    for yy in (.65, .72, .79):
        p, n = _F(s * yy, .715, .012)
        obox('Headlamp projector', p, n, (.050, .070, .018), LAMP, bevel=.008)
        p, n = _F(s * yy, .715, .006)
        obox('Headlamp element', p, n, (.034, .050, .014), GLOW, bevel=.006)
    strip('Turn signal', SHELL, [(s * .61, .655), (s * .85, .655)], .016, 'x', -1, AMBER, .007, .015)
    # chrome Dynamic Shield arcs framing the grille
    strip('Dynamic Shield', SHELL, [(s * .54, .925), (s * .565, .80), (s * .56, .66),
                                    (s * .52, .54), (s * .43, .45), (s * .30, .41)], .030,
          'x', -1, CHROME, .008, .02)
    conform('Lower intake', SHELL, [(s * .58, .40), (s * .82, .44), (s * .84, .58), (s * .60, .60)][::s],
            'x', -1, PLASTIC, .004, .025)
    # red flashers hidden in the grille corners (warning lamps)
    p, n = _F(s * .44, .835, .010)
    obox('Grille flasher', p, n, (.110, .040, .020), BEACON, bevel=.008)
conform('Grille', SHELL, [(-.50, .47), (.50, .47), (.53, .89), (-.53, .89)], 'x', -1, GLOSSBK, .005, .03)
for i in range(6):
    z = .52 + i * .065
    strip('Grille bar', SHELL, [(-.47, z), (.47, z)], .016, 'x', -1, SATIN, .010, .03)
conform('Skid plate', SHELL, [(-.40, .345), (.40, .345), (.36, .44), (-.36, .44)], 'x', -1, SATIN, .006, .03)
p, n = _F(0, .80, .014)
obox('Grille badge', p, n, (.130, .085, .014), CHROME, bevel=.010)
p, n = _F(0, .600, .012)
obox('Number plate', p, n, (.340, .110, .010), PLATE, bevel=.004)
text('Plate lettering', PLATE_NO, p, n, .060, TRIM, off=.006)
# recovery winch behind the bumper: fairlead and hook in the lower grille
p, n = _F(0, .490, .014)
obox('Winch fairlead', p, n, (.250, .070, .020), SATIN, bevel=.006)
obox('Fairlead slot', p + n * .011, n, (.170, .020, .004), TRIM, bevel=.002)
rod('Winch hook', tuple(p + n * .02), tuple(p + n * .05 + Vector((0, 0, -.06))), .010, TRIM, 10)

# ---------------------------------------------------------------- the tail
_R = lambda y, z, p=0.0: stick(SHELL, 'x', 1, y, z, p)
for side in (-1, 1):
    s = side
    # T-shaped tail lamps: a horizontal bar into the tailgate, a short drop at the corner
    conform('Tail lamp', SHELL, [(s * .38, 1.025), (s * .91, 1.000), (s * .91, 1.095), (s * .38, 1.105)][::s],
            'x', 1, TAILRED, .007, .02)
    conform('Tail lamp', SHELL, [(s * .78, .86), (s * .91, .86), (s * .91, 1.00), (s * .78, 1.01)][::s],
            'x', 1, TAILRED, .007, .02)
    conform('Rear reflector', SHELL, [(s * .62, .45), (s * .80, .47), (s * .80, .50), (s * .62, .49)][::s],
            'x', 1, TAILRED, .006, .02)
conform('Rear bumper cladding', SHELL, [(-.86, .38), (.86, .38), (.88, .54), (-.88, .54)], 'x', 1, PLASTIC,
        .004, .03)
conform('Rear diffuser', SHELL, [(-.45, .37), (.45, .37), (.42, .45), (-.42, .45)], 'x', 1, SATIN, .007, .03)
p, n = _R(0, .735, .010)
obox('Rear plate', p, n, (.340, .110, .010), PLATE, bevel=.004)
text('Rear plate lettering', PLATE_NO, p, n, .060, TRIM, off=.006)
p, n = _R(0, 1.015, .003)
text('Tailgate lettering', '臺北市政府消防局', p, n, .060, WHITE)
p, n = _R(0, .935, .003)
text('Tailgate lettering', '災情勘查車', p, n, .074, WHITE)
# roof spoiler over the tailgate glass, high-level brake lamp and red flashers
p, n = _R(0, 1.680, 0)
box('Roof spoiler', (p.x - .02, 0, 1.692), (.10, 1.18, .030), RED, .012, 3)
box('High-level stop lamp', (p.x + .028, 0, 1.682), (.010, .36, .016), TAILRED, .004)
for s in (-1, 1):
    box('Rear flasher', (p.x + .026, s * .48, 1.682), (.012, .11, .022), BEACON, .005)

# ------------------------------------------------------------- side detail
for side in (-1, 1):
    s = side
    # black cladding: rocker between the arches
    conform('Rocker cladding', SHELL, [(AX_F + ARCH_R + .02, .335), (AX_R - ARCH_R - .02, .335),
                                       (AX_R - ARCH_R - .02, .445), (AX_F + ARCH_R + .02, .445)],
            'y', s, PLASTIC, .006, .03)
    strip('Rocker trim', SHELL, [(AX_F + ARCH_R + .06, .395), (AX_R - ARCH_R - .06, .395)], .025,
          'y', s, SATIN, .010, .03)
    # reflective band above the arches
    band = [(x, .875 + .010 * (x - FRONT) / (REAR - FRONT)) for x in [FRONT + .30 + i * .25 for i in range(17)]]
    band = [b for b in band if b[0] < REAR - .25]
    strip('Reflective band', SHELL, band, .045, 'y', s, YELLOW, .004, .03)
    # door handles
    for xh in (0.02, 1.00):
        p, n = stick(SHELL, 'y', s, xh, 1.035, .010)
        obox('Door handle', p, n, (.16, .032, .022), CHROME, bevel=.010)
    # mirror: black base on the door, red cap, side repeater
    p, n = stick(SHELL, 'y', s, -0.66, 1.16, 0)
    box('Mirror base', (-0.66, p.y + s * .025, 1.17), (.20, .06, .07), PLASTIC, .015)
    box('Mirror stalk', (-0.63, p.y + s * .10, 1.19), (.07, .14, .04), PLASTIC, .012)
    box('Mirror cap', (-0.60, s * 0.985, 1.235), (.12, .22, .15), RED, .040, 3)
    box('Mirror glass', (-0.535, s * 0.985, 1.235), (.010, .19, .12), CHROME, .006)
    box('Mirror repeater', (-0.645, s * 1.000, 1.180), (.04, .14, .014), AMBER, .004)
    # fuel lid (driver side rear, Outlander has it on the right)
    if s > 0:
        p, n = stick(SHELL, 'y', s, 1.72, 1.00, .0015)
        obox('Fuel lid seam', p, n, (.17, .14, .002), SHUT, bevel=0)
        obox('Fuel lid', p + n * .0015, n, (.16, .13, .002), RED, bevel=0)

# arch cladding: a flat-topped lip swept round each opening (the Outlander
# arches are squared off and thick)
def arch_lip(ax, side, n_arc=40, band=.075, bulge=.030, z_floor=.36):
    lo = math.asin(max(-1.0, min(1.0, (z_floor - AXLE_Z) / ARCH_R)))
    verts, faces = [], []
    N_SEC = 7
    rows = 0
    for i in range(n_arc + 1):
        a = lo + (math.pi - 2 * lo) * i / n_arc
        nx, nz = math.cos(a), math.sin(a)
        px, pz = ax + ARCH_R * nx, AXLE_Z + .015 + ARCH_R * nz
        # body side under this point, just outside the cut
        loc, n = SHELL.hit('y', side, px + nx * (band + .01), pz + nz * (band + .01))
        if loc is None:
            continue
        y_root = abs(loc.y) - .010
        for j in range(N_SEC + 1):
            phi = math.pi * j / N_SEC
            d = band / 2 + (band / 2 + .006) * math.cos(phi)
            verts.append((px + nx * d, side * (y_root + bulge * math.sin(phi) ** .6), pz + nz * d))
        rows += 1
    for i in range(rows - 1):
        for j in range(N_SEC):
            q = i * (N_SEC + 1) + j
            faces.append((q, q + N_SEC + 1, q + N_SEC + 2, q + 1))
    if side < 0:
        faces = [tuple(reversed(f)) for f in faces]
    me = bpy.data.meshes.new('Wheel arch cladding')
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new('Wheel arch cladding', me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(PLASTIC)
    sm = o.modifiers.new('Lip thickness', 'SOLIDIFY')
    sm.thickness, sm.offset = .010, 0.0
    _smooth(o, 50)
    return o


for ax in (AX_F, AX_R):
    for side in (-1, 1):
        arch_lip(ax, side)

# ------------------------------------------------- roof: rails, bar, camera
ROOF_RAIL_Y = 0.62
for side in (-1, 1):
    pts = []
    for i in range(13):
        x = -0.05 + (1.90 + 0.05) * i / 12
        loc, n = SHELL.hit('z', 1, x, side * ROOF_RAIL_Y)
        pts.append(Vector((x, side * ROOF_RAIL_Y, loc.z + .055)))
    for a, b in zip(pts, pts[1:]):
        rod('Roof rail', tuple(a), tuple(b), .016, GLOSSBK, 12)
    for x in (-0.02, 0.92, 1.86):
        loc, n = SHELL.hit('z', 1, x, side * ROOF_RAIL_Y)
        box('Roof rail foot', (x, side * ROOF_RAIL_Y, loc.z + .028), (.09, .040, .058), GLOSSBK, .012)
# cross bars carrying the light bar
for x in (0.02, 0.32):
    z = SHELL.hit('z', 1, x, 0)[0].z + .070
    box('Cross bar', (x, 0, z), (.045, 2 * ROOF_RAIL_Y + .04, .025), GLOSSBK, .008)

# full-width red light bar (Taiwan fire: red), take-down lamps and speaker
LB_X = 0.17
LB_Z = SHELL.hit('z', 1, LB_X, 0)[0].z + .085
box('Light bar base', (LB_X, 0, LB_Z + .012), (.30, 1.24, .030), TRIM, .010)
for i in range(6):
    box('Light bar lens', (LB_X, -0.52 + i * .208, LB_Z + .062), (.280, .200, .076), BEACON, .024, 3)
for s_ in (-1, 1):
    box('Light bar end cap', (LB_X, s_ * .655, LB_Z + .060), (.290, .060, .080), TRIM, .025, 3)
for y in (-.10, .10):
    box('Take-down lamp', (LB_X - .141, y, LB_Z + .062), (.006, .12, .036), GLOW, .003)
box('Siren speaker', (-0.06, 0, LB_Z - .005), (.12, .26, .10), TRIM, .020, 3)

# disaster-monitoring camera on a telescopic mast at the back of the roof
CAM_X = 1.58
roof_z = SHELL.hit('z', 1, CAM_X, 0)[0].z
box('Mast base', (CAM_X, 0, roof_z + .025), (.22, .22, .05), TRIM, .012)
cyl('Mast tube', (CAM_X, 0, roof_z + .105), .042, .13, SATIN, axis='Z', verts=24)
CAM_PAN_Z = roof_z + .175
cyl('Camera pan unit', (CAM_X, 0, CAM_PAN_Z), .085, .045, GLOSSBK, axis='Z', verts=32)
CAM_TILT_Z = 1.980 - .075
box('Camera yoke', (CAM_X, 0, CAM_PAN_Z + .045), (.07, .17, .05), GLOSSBK, .012)
sphere('Camera head', (CAM_X, 0, CAM_TILT_Z), .075, GLOSSBK, 28)
cyl('Camera lens', (CAM_X - .066, 0, CAM_TILT_Z), .032, .025, GLASS_T, axis='X', verts=24)
# antennas for the radio fit (通訊設備)
for y, h in ((-.38, .24), (.38, .24)):
    z = SHELL.hit('z', 1, 1.85, y)[0].z
    cyl('Antenna base', (1.85, y, z + .012), .025, .025, TRIM, axis='Z', verts=16)
    rod('Antenna whip', (1.85, y, z + .02), (1.88, y, z + h), .004, TRIM, 8)
z = SHELL.hit('z', 1, 1.15, 0)[0].z
box('Shark fin antenna', (1.15, 0, z + .030), (.16, .06, .06), RED, .025, 3)

# ------------------------------------------------------------- lettering
EMBLEM = decal_mat('Fire service emblem', 'phoenix_emblem.png')
for side in (-1, 1):
    s = side
    # front door: department emblem and name
    EM_H = .26
    EM_W = EM_H * 200.0 / 228.0
    ex, ez = -0.70, 0.70
    conform('Fire service emblem', SHELL,
            [(ex - EM_W / 2, ez - EM_H / 2), (ex + EM_W / 2, ez - EM_H / 2),
             (ex + EM_W / 2, ez + EM_H / 2), (ex - EM_W / 2, ez + EM_H / 2)], 'y', s, EMBLEM, .005, .03,
            uv=(ex - EM_W / 2, ez - EM_H / 2, ex + EM_W / 2, ez + EM_H / 2, s > 0))
    p, n = stick(SHELL, 'y', s, -0.22, 0.735)
    text('Door lettering', '臺北市政府消防局', p, n, .080, WHITE)
    p, n = stick(SHELL, 'y', s, -0.22, 0.640)
    text('Door lettering', '限乘 %d 人' % SEATS, p, n, .050, WHITE)
    # rear door: vehicle type
    p, n = stick(SHELL, 'y', s, 0.60, 0.700)
    text('Vehicle type', '災情勘查車', p, n, .110, WHITE)
# yellow unit call sign inside the screen, kerb-side top corner (as on the trucks)
p, n = SHELL.hit('z', 1, XA - .25, .40)
text('Windscreen callsign', CALLSIGN, p, n, .065, YELLOW, up=(1, 0, 0), off=.002)
# hood: nothing (Taipei does not letter the bonnet)

# ---------------------------------------------------------------- interior
box('Floor pan', (0.20, 0, 0.47), (3.70, 1.70, .03), PANEL, .005)
# headliner and side linings: seen through the screen, the inside of the
# shell would otherwise show red
# (kept behind the A-pillar: the screen slopes down in front of x = 0 and a
# full-length lining stood out through it)
box('Headliner', (0.95, 0, 1.655), (1.90, 1.30, .02), PANEL, .005)
for s_ in (-1, 1):
    box('Cabin side lining', (0.95, s_ * 0.68, 1.37), (1.80, .02, .42), PANEL, .005)
    box('Door trim', (0.10, s_ * 0.80, 0.90), (2.10, .02, .40), PANEL, .005)
box('Dashboard', (XWS + .28, 0, 1.000), (.38, 1.62, .22), DASH, .040, 3)
box('Dash top', (XWS + .20, 0, 1.115), (.30, 1.58, .03), DASH, .010)
box('Centre screen', (XWS + .40, 0, 1.18), (.03, .30, .17), SCREEN, .006)
box('Centre console', (-0.30, 0, 0.66), (.85, .24, .22), DASH, .030, 3)
rod('Steering column', (XWS + .30, -0.38, 0.98), (XWS + .50, -0.38, 1.06), .028, DASH)
bpy.ops.mesh.primitive_torus_add(location=(XWS + .52, -0.38, 1.07), major_radius=.185,
                                 minor_radius=.019, major_segments=32, minor_segments=10,
                                 rotation=(0, math.radians(-68), 0))
_w = bpy.context.object
_w.name = 'Steering wheel'
_w.data.materials.append(DASH)


def seat(name, x, y, w):
    box(name + ' cushion', (x, y, .70), (.50, w, .11), CLOTH, .040, 3)
    box(name + ' back', (x + .30, y, .98), (.11, w, .52), CLOTH, .040, 3)
    box(name + ' headrest', (x + .31, y, 1.30), (.09, w * .55, .14), CLOTH, .030, 3)


seat('Driver seat', -0.40, -0.38, .50)
seat('Front passenger seat', -0.40, 0.38, .50)
for y in (-0.48, 0, 0.48):
    seat('Rear seat', 0.55, y, .44)
# cargo: radio and monitor rack of the mobile command post (臨時指揮站)
box('Equipment rack', (1.75, 0, 0.72), (.55, 1.30, .45), TRIM, .015)
box('Rack monitor', (1.55, 0, 1.02), (.03, .42, .26), SCREEN, .006)
box('Radio set', (1.80, -0.40, 0.98), (.30, .30, .08), DASH, .010)

# ------------------------------------------------------------------ wheels
def tread_ring(name, cx, cy, r, width, lugs=56, depth=.008):
    verts, faces = [], []
    for i in range(lugs):
        a0 = i * TAU / lugs
        a1 = a0 + TAU / lugs * .62
        base = len(verts)
        for a in (a0, a1):
            for rr in (r - .006, r + depth):
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


def tyre(cx, cy, w, seg=64):
    """Lathed tyre: open in the middle (a solid cylinder hid the alloy in
    the first preview).  Profile runs bead - sidewall - tread - sidewall - bead."""
    h = w / 2
    prof = [(.262, -h + .018), (.290, -h + .004), (.330, -h), (.355, -h + .010), (.366, -h + .030),
            (TIRE_R - .006, -h + .060), (TIRE_R - .006, h - .060), (.366, h - .030), (.355, h - .010),
            (.330, h), (.290, h - .004), (.262, h - .018)]
    verts, faces = [], []
    for j in range(seg):
        a = TAU * j / seg
        for r, dy in prof:
            verts.append((cx + r * math.cos(a), cy + dy, AXLE_Z + r * math.sin(a)))
    n = len(prof)
    for j in range(seg):
        k = (j + 1) % seg
        for i in range(n):
            i2 = (i + 1) % n
            faces.append((j * n + i, j * n + i2, k * n + i2, k * n + i))
    return _mesh('Tire', verts, faces, RUBBER, bevel=0, seg=1, smooth=True)


def wheel(cx, cy, side):
    """One 20-inch wheel: tyre, two-tone ten-spoke alloy, disc and caliper.
    Returns (spinning parts, fixed parts)."""
    w = WHEEL_W
    spin = [tyre(cx, cy, w), tread_ring('Tire tread', cx, cy, TIRE_R - .008, w - .06)]
    yo = cy + side * (w / 2 - .020)            # outer face of the rim
    RIM = .254                                  # 20 in / 2
    # dark barrel set well back so the spokes stand clear of it
    spin.append(cyl('Rim barrel', (cx, cy - side * .05, AXLE_Z), RIM, .15, ALLOY_D, verts=48, bevel=.004))
    bpy.ops.mesh.primitive_torus_add(location=(cx, yo - side * .006, AXLE_Z), major_radius=RIM - .004,
                                     minor_radius=.013, major_segments=48, minor_segments=8,
                                     rotation=(math.pi / 2, 0, 0))
    lip = bpy.context.object
    lip.name = 'Rim lip'
    lip.data.materials.append(ALLOY)
    bpy.ops.object.shade_smooth()
    spin.append(lip)
    spin.append(cyl('Hub face', (cx, yo - side * .010, AXLE_Z), .070, .040, ALLOY_D, verts=28))
    spin.append(cyl('Centre cap', (cx, yo + side * .004, AXLE_Z), .036, .012, CHROME, verts=24))
    for j in range(10):
        a = j * TAU / 10
        c, sn = math.cos(a), math.sin(a)
        r0, r1 = .060, RIM - .008
        sp = rod('Wheel spoke', (cx + r0 * c, yo - side * .004, AXLE_Z + r0 * sn),
                 (cx + r1 * c, yo - side * .022, AXLE_Z + r1 * sn), .014, ALLOY, 8)
        sp.scale = (1, 1, 1)
        spin.append(sp)
    for j in range(5):
        a = j * TAU / 5 + .3
        spin.append(cyl('Wheel nut', (cx + .042 * math.cos(a), yo + side * .002, AXLE_Z + .042 * math.sin(a)),
                        .008, .012, CHROME, verts=8, bevel=0))
    fixed = [cyl('Brake disc', (cx, yo - side * .075, AXLE_Z), .175, .026, DISC, verts=40),
             box('Brake caliper', (cx + .10, yo - side * .065, AXLE_Z + .10), (.09, .05, .12), TRIM, .012)]
    return spin, fixed


WHEELS = []          # (spin empty, steer empty or None, centre, spin parts, fixed parts)
for side in (-1, 1):
    sn = 'L' if side < 0 else 'R'
    for tag, ax in (('F', AX_F), ('R', AX_R)):
        c = (ax, side * TRACK / 2, AXLE_Z)
        spin, fixed = wheel(ax, side * TRACK / 2, side)
        WHEELS.append(('Wheel spin %s %s' % (tag, sn), 'Steer %s %s' % (tag, sn) if tag == 'F' else None,
                       c, spin, fixed))

# --------------------------------------------------------------- rig
#   Vehicle                          <- drive (translate along -X)
#   ├─ Steer F L / F R               <- front wheel steer (rotate Z)
#   │   └─ Wheel spin F L / F R      <- roll (rotate local Y, - is forward)
#   ├─ Wheel spin R L / R R
#   └─ Camera mast                   <- telescope (translate Z)
#      └─ Camera pan                 <- pan (rotate Z)
#         └─ Camera tilt             <- tilt (rotate Y, + raises the lens)
def empty(name, loc, size=0.25, kind='PLAIN_AXES'):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type, e.empty_display_size = kind, size
    e.location = loc
    bpy.context.collection.objects.link(e)
    return e


def adopt(child, parent):
    """Re-parent without moving anything in world space."""
    bpy.context.view_layer.update()
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = mw


for spin_name, steer_name, centre, spin, fixed in WHEELS:
    e = empty(spin_name, centre, 0.30, 'SPHERE')
    for o in spin:
        adopt(o, e)
    if steer_name:
        st = empty(steer_name, centre, 0.40, 'CIRCLE')
        adopt(e, st)
        for o in fixed:
            adopt(o, st)

mast = empty('Camera mast', (CAM_X, 0, roof_z + .05), 0.20, 'SINGLE_ARROW')
pan = empty('Camera pan', (CAM_X, 0, CAM_PAN_Z), 0.20, 'CIRCLE')
tilt = empty('Camera tilt', (CAM_X, 0, CAM_TILT_Z), 0.15, 'SINGLE_ARROW')
adopt(pan, mast)
adopt(tilt, pan)
for o in list(bpy.context.scene.objects):
    base = o.name.split('.')[0]
    if base in ('Mast tube',):
        adopt(o, mast)
    elif base in ('Camera pan unit', 'Camera yoke'):
        adopt(o, pan)
    elif base in ('Camera head', 'Camera lens'):
        adopt(o, tilt)

vehicle = empty('Vehicle', (0, 0, 0), 1.0, 'ARROWS')
for o in list(bpy.context.scene.objects):
    if o is not vehicle and o.parent is None:
        adopt(o, vehicle)

scene = bpy.context.scene
scene['Axles'] = (AX_F, AX_R)
scene['Tyre radius'] = TIRE_R
scene['Track'] = TRACK
scene['Camera mast'] = (CAM_X, 0.0, CAM_TILT_Z)

# -------------------------------------------------------------- presentation
FLOOR = mat('Studio floor', (.135, .142, .150), .0, .42)
box('Ground', (0, 0, -.06), (200, 200, .12), FLOOR, 0, smooth=False)

world = bpy.context.scene.world
world.use_nodes = True
try:
    nt = world.node_tree
    for n_ in list(nt.nodes):
        nt.nodes.remove(n_)
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


# the tanker's studio, scaled to a 4.7 m car (power ~ distance squared)
for name, loc, power, size in (('Key', (-5.0, -5.5, 6.0), 2600, 9),
                               ('Fill', (2.0, 5.5, 4.0), 1200, 7),
                               ('Rim', (6.0, -1.5, 4.5), 1500, 5),
                               ('Top', (-0.5, 0.0, 7.5), 1000, 8),
                               ('Sky card', (-9.0, -3.5, 6.0), 1400, 12),
                               ('Tail fill', (8.0, 2.0, 2.5), 300, 6)):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy, d.shape, d.size = power, 'DISK', size
    o = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(o)
    o.location = loc
    aim(o, (0, 0, .9))

CAMERAS = (
    ('Hero front three-quarter', (-7.6, -6.0, 2.10), (-0.20, 0, 0.85), 55, 'PERSP', 1600, 1000),
    ('Rear three-quarter',       (7.2, -6.2, 2.30),  (0.30, 0, 0.90), 55, 'PERSP', 1600, 1000),
    ('Side elevation',           (0.0, -16.0, 0.95), (0.0, 0, 0.95),  50, 'ORTHO', 1800, 800),
    ('Head on',                  (-12.0, 0.0, 1.00), (0, 0, 0.95),   100, 'PERSP', 1100, 1000),
    ('Tail on',                  (12.0, 0.0, 1.00),  (0, 0, 0.95),   100, 'PERSP', 1100, 1000),
    ('Roof',                     (-3.2, -3.8, 4.6),  (0.6, 0, 1.55),  50, 'PERSP', 1400, 1000),
)
cams = {}
for name, loc, target, lens, kind, rx, ry in CAMERAS:
    bpy.ops.object.camera_add(location=loc)
    c = bpy.context.object
    c.name = name
    c.data.lens, c.data.type = lens, kind
    if kind == 'ORTHO':
        c.data.ortho_scale = 5.4
    aim(c, target)
    cams[name] = (c, rx, ry)

s = bpy.context.scene
s.camera = cams['Hero front three-quarter'][0]
s.render.engine = 'CYCLES'
s.cycles.samples = int(os.environ.get('SURVEY_SAMPLES', '96'))
s.cycles.use_denoising = True
s.cycles.max_bounces = 10
s.cycles.transmission_bounces = 8
s.cycles.transparent_max_bounces = 8
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
s['Reference'] = 'Taipei City Fire Department disaster survey car (災情勘查車), Mitsubishi Outlander 4th gen'
s['Model scope'] = ('Proportional exterior study on published Outlander dimensions. '
                    'Livery laid out in the Taipei style; call sign and plate are illustrative.')

bpy.ops.object.select_all(action='DESELECT')
try:
    bpy.ops.file.pack_all()
except Exception as exc:
    print('pack skipped:', exc, flush=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'Survey_Car.blend'))


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
print('EXTENT  length %.3f  width %.3f  height %.3f  bottom %.3f (metres)'
      % (hi.x - lo.x, hi.y - lo.y, hi.z, lo.z), flush=True)
print('OBJECT COUNT', len(bpy.context.scene.objects), flush=True)

ONLY = os.environ.get('SURVEY_ONLY', '')
RENDER_DIR = os.environ.get('SURVEY_RENDER_DIR', OUT)
for name, filename in (('Hero front three-quarter', 'survey_front.png'),
                       ('Rear three-quarter', 'survey_rear.png'),
                       ('Side elevation', 'survey_side.png'),
                       ('Head on', 'survey_head_on.png'),
                       ('Tail on', 'survey_tail_on.png'),
                       ('Roof', 'survey_roof.png')):
    if ONLY == 'none' or (ONLY and filename not in ONLY.split(',')):
        continue
    c, rx, ry = cams[name]
    s.camera = c
    pct = int(os.environ.get('SURVEY_PCT', '100'))
    s.render.resolution_x, s.render.resolution_y, s.render.resolution_percentage = rx, ry, pct
    # the tail faces the rim light, so shots of it stop down (tanker: pump panel)
    s.view_settings.exposure = -0.7 if name in ('Rear three-quarter', 'Tail on') else 0.0
    s.render.filepath = os.path.join(RENDER_DIR, filename)
    bpy.ops.render.render(write_still=True)
    print('RENDERED', filename, flush=True)

print('BUILD OK', flush=True)
