# -*- coding: utf-8 -*-
"""Taipei City Fire Department Mitsubishi Outlander (臺北市政府消防局 勤務車),
modelled on the user's photographs of the station car lettered 消防警備車
(3rd-generation Outlander, 2019-21 facelift).

Built in the idiom of the water tanker (../water-tanker/build_water_tanker.py)
and the aerial ladder before it: the same helper library (boxes, rods,
boolean carving, decals, empties, studio) and the same conventions
(nose to -X, driver on -Y, Z up, metres, tyres standing on z = 0).

What is new for a passenger-car body:

  * the shell is two lofts - a lower body (an explicit section with a
    character line, filleted at nose and tail) and a greenhouse (tumblehome
    rings over the beltline);
  * everything that sits ON the curved skin - glass, blackout, lamps, grille,
    chrome, emblems, lettering - is placed by ray casting onto the shell
    (`conform`, `strip`, `stick`), not by hand-computed surface formulas.
    The tanker could place parts on flat slabs; an SUV skin is curved
    everywhere and a hand-written surface model drifts from the mesh built.

Reference
    Photographs of the Taipei car (front, both sides, rear, three-quarters).
    Mitsubishi Outlander (Taiwan, 2019-21): 4 695 x 1 810 x 1 710 mm,
    wheelbase 2 670 mm, 225/55 R18.

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


# The photographed car is a metallic crimson (Mitsubishi red), not truck red:
# the first, brighter flat red also went salmon under AgX
RED     = mat('Fire engine red',        (.24, .008, .018), .45, .26, .90)
RUBBER  = mat('Tyre rubber',            (.013, .014, .015), .0, .80)
PLASTIC = mat('Black cladding plastic', (.022, .023, .025), .0, .62)
GLOSSBK = mat('Gloss black trim',       (.010, .011, .012), .0, .10, .8)
TRIM    = mat('Graphite trim',          (.042, .046, .050), .25, .38)
CHROME  = mat('Chrome',                 (.80, .82, .84), 1.0, .07)
SATIN   = mat('Satin silver',           (.48, .50, .52), .85, .30)
ALLOY   = mat('Wheel alloy',            (.62, .64, .66), .9, .18)
ALLOY_D = mat('Wheel alloy, dark',      (.025, .027, .030), .6, .38)
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
GLOW_R  = mat('Red LED',                (.40, .01, .01), .0, .30,
              emit=((1.0, .03, .02), .22))
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
    flip) maps the outline's bounding box to 0..1 for decals; a callable
    uv(u, v) -> (s, t) maps it any other way (the bonnet decal reads from the
    front, so its image axes run across the car).
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
            if callable(uv):
                uvs += [uv(su, sv) for su, sv in sub]
            elif uv:
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
# Laid out from the user's photographs of the Taipei car - a 3rd-generation
# Outlander, 2019-21 facelift, lettered 消防警備車 - and the Taiwan spec sheet:
# 4 695 x 1 810 x 1 710 mm, wheelbase 2 670, 225/55 R18 (705 mm tyre).
FRONT, REAR = -2.3475, 2.3475
HW = 0.905
WHEELBASE = 2.670
AX_F = FRONT + 0.950
AX_R = AX_F + WHEELBASE
TIRE_R = 0.352
AXLE_Z = TIRE_R
TRACK = 1.540
WHEEL_W = 0.225
RIM = 0.229                        # 18 in / 2
ARCH_R = 0.405
XWS = -1.15                        # windscreen base (cowl)
CALLSIGN = '信義分隊'               # unit name, top kerb-side corner of the screen (photo: 松江分隊)
VEHICLE_TYPE = '消防警備車'         # as lettered on the photographed car; '災情勘查車' for a survey car
DONOR = ('四平街愛神全體信眾', '捐贈')  # donation lettering on the photographed car; () to leave off
PLATE_NO = 'RFA-1190'              # fictitious plate
SEATS = 5

# ------------------------------------------------------------- lower body
def lb_section(x):
    """(half width, bottom z, top z) of the lower body at station x."""
    a = HW - 0.020 * max(0.0, (x - 1.50) / 0.85) ** 2
    z0 = 0.270 + 0.10 * max(0.0, (x - 1.75) / 0.60) ** 2 + 0.08 * max(0.0, (-1.80 - x) / 0.55) ** 2
    if x < XWS:
        # the bonnet falls away to a rounded nose (photos: bonnet edge ~1.0 m)
        t = (x - FRONT) / (XWS - FRONT)
        z1 = 1.055 + 0.090 * (1 - (1 - t) ** 1.8)
    else:
        t = (x - XWS) / (REAR - XWS)
        z1 = 1.145 + 0.045 * t
    for end, length, dy, dz0, dz1 in ((FRONT, .40, .24, .06, .05), (REAR, .28, .18, .08, .05)):
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


def chaikin(pts, sharp, n=3):
    """Corner-cutting smoothing of an open polyline; points flagged sharp
    (and the two ends) are kept, so a crease stays a crease."""
    for _ in range(n):
        out, flags = [pts[0]], [True]
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            q = (.75 * a[0] + .25 * b[0], .75 * a[1] + .25 * b[1])
            r = (.25 * a[0] + .75 * b[0], .25 * a[1] + .75 * b[1])
            if i > 0 and sharp[i]:
                out.append(a)
                flags.append(True)
            elif i > 0:
                out.append(q)
                flags.append(False)
            if i < len(pts) - 2:
                out.append(r)
                flags.append(False)
        out.append(pts[-1])
        flags.append(True)
        pts, sharp = out, flags
    return pts


def lb_profile(x):
    """Right half of the lower-body section, bottom centre to top centre.

    A superellipse ring (the first cut) gave round, bulging flanks and read
    as a bar of soap.  The flank is a near-vertical panel under a character
    line at door-handle height (~0.95 m on the photos); above it the panel
    tucks in to the beltline and the glass sits inboard on top of it.
    """
    a, z0, z1 = lb_section(x)
    zs = min(0.945 + 0.025 * (x - FRONT) / (REAR - FRONT), z1 - .07)
    zs = max(zs, z0 + .30)
    ctrl = [((0.0, z0), True),
            ((a - .20, z0), False),
            ((a - .050, z0 + .040), False),
            ((a - .016, z0 + .17), False),
            ((a - .004, zs - .14), False),
            ((a + .004, zs), True),                # the character line
            ((a - .020, zs + .050), False),
            ((a - .045, z1 - .035), False),
            ((a - .095, z1 - .002), False),
            ((a - .32, z1 + .008), False),
            ((0.0, z1 + .014), True)]               # crown on the bonnet
    pts = chaikin([c for c, _ in ctrl], [f for _, f in ctrl], 3)
    return pts, z0, z1


def lb_ring(x):
    half, z0, z1 = lb_profile(x)
    wf = max(0.0, 1.0 - (x - FRONT) / 0.40)     # nose leans back at the top
    wr = max(0.0, 1.0 - (REAR - x) / 0.40)      # tailgate leans forward

    def lean(z):
        tz = (z - z0) / (z1 - z0)
        return x + 0.060 * wf * tz ** 2 - 0.05 * wr * tz ** 2 + 0.03 * wf * (1 - tz) ** 3
    right = [(lean(z), y, z) for y, z in half]
    left = [(lean(z), -y, z) for y, z in reversed(half[1:-1])]
    return right + left


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


body = loft('Body shell', stations(FRONT, REAR, .40, .28, .06, 12), lb_ring, RED)

# -------------------------------------------------------------- greenhouse
# screen base at the cowl, screen top at XA, roof to XR0, then a raked tailgate
# glass down to XG1 (photos: the glass leans well forward under a spoiler)
XG0, XA, XR0, XG1 = XWS, -0.32, 1.86, 2.27
ROOF_F, ROOF_R = 1.712, 1.688
GH_N, GH_HALF = 5.0, 22


def gh_section(x):
    """(half width at belt, half width at roof, bottom z, top z) at x."""
    _, _, z1 = lb_section(x)
    zb = z1 - 0.12
    if x <= XA:
        t = (x - XG0) / (XA - XG0)
        f = (t if t < .78 else .78 + (t - .78) - (t - .78) ** 2 / (2 * .22)) / (1 - .11)
        zt = z1 + (ROOF_F - z1) * min(1.0, f)
    elif x <= XR0:
        zt = ROOF_F - (ROOF_F - ROOF_R) * ((x - XA) / (XR0 - XA)) ** 1.6
    else:
        t = (x - XR0) / (XG1 - XR0)
        zt = ROOF_R + (z1 - ROOF_R) * t ** 1.35
    tf = min(1.0, (x - XG0) / 0.55)
    tr = min(1.0, (XG1 - x) / 0.45)
    # kept inside the tail's plan taper: where the two shells ran nearly
    # coincident the render striped (z-fighting) at the D-pillar
    wb = 0.868 - 0.06 * (1 - tf) ** 1.5 - 0.040 * (1 - tr) ** 1.5
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
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=ARCH_R - .005, depth=.34,
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
_smooth(body, 26)          # keeps the character line
_smooth(greenhouse, 40)
SHELL = Shell([body, greenhouse])

# ------------------------------------------------- glass and window blackout
# Side daylight opening (DLO) in (x, z), read off the side photos: a straight,
# slightly rising beltline, black B/C pillars, and a rear quarter light whose
# top and back edges curve down to a point on the beltline.  The whole DLO is
# blacked out, the panes laid on top, and a chrome surround runs all round it.
A_LINE = lambda z: -0.88 + (z - 1.17) * 1.10           # x of the A-pillar trailing edge at z
DLO_BOT = lambda x: 1.168 + 0.035 * (x + 0.88) / 2.75
DLO_TOP_Z = 1.648
B_PIL = (0.08, 0.18)
C_PIL = (1.02, 1.11)
Q_TAIL = [(1.80, None), (1.875, 1.235), (1.80, 1.44), (1.64, 1.555), (1.30, 1.625)]


def dlo_outline():
    pts = [(A_LINE(1.17), DLO_BOT(A_LINE(1.17)))]
    for i in range(14):
        x = A_LINE(1.17) + (1.80 - A_LINE(1.17)) * (i + 1) / 14
        pts.append((x, DLO_BOT(x)))
    pts += [(x, z) for x, z in Q_TAIL[1:]]
    pts += [(0.10, DLO_TOP_Z), (A_LINE(DLO_TOP_Z) + .06, DLO_TOP_Z), (A_LINE(1.60), 1.60)]
    return pts


def panes():
    """Front door, rear door and quarter panes, inset from the DLO edge."""
    g = .022
    fd = [(A_LINE(1.17 + g) + g, DLO_BOT(A_LINE(1.17)) + g), (B_PIL[0] - g / 2, DLO_BOT(B_PIL[0]) + g),
          (B_PIL[0] - g / 2, DLO_TOP_Z - g), (A_LINE(DLO_TOP_Z) + .06, DLO_TOP_Z - g),
          (A_LINE(1.60) + g, 1.60 - g)]
    rd = [(B_PIL[1] + g / 2, DLO_BOT(B_PIL[1]) + g), (C_PIL[0] - g / 2, DLO_BOT(C_PIL[0]) + g),
          (C_PIL[0] - g / 2, DLO_TOP_Z - g), (B_PIL[1] + g / 2, DLO_TOP_Z - g)]
    q = [(C_PIL[1] + g / 2, DLO_BOT(C_PIL[1]) + g), (1.78, DLO_BOT(1.78) + g), (1.835, 1.25),
         (1.77, 1.43), (1.62, 1.535), (1.30, DLO_TOP_Z - .025 - g), (C_PIL[1] + g / 2, DLO_TOP_Z - g)]
    return fd, rd, q


for side in (-1, 1):
    conform('Window blackout', SHELL, dlo_outline(), 'y', side, GLOSSBK, .002, .03)
    for pane in panes():
        conform('Side window', SHELL, pane, 'y', side, GLASS_T, .006, .03)
    loop = dlo_outline()
    strip('Window surround', SHELL, loop + loop[:1], .018, 'y', side, CHROME, .007, .025)

# windscreen, from above (it is raked well back)
ws = [(XG0 + .06, -0.67), (XG0 + .06, 0.67), (XA - .07, 0.60), (XA - .07, -0.60)]
# The screen is see-through: only a black frit border, and the greenhouse
# shell under the glass is opened.
WS_OUT = [(XG0 + .03, -0.70), (XG0 + .03, 0.70), (XA - .04, 0.63), (XA - .04, -0.63)]
WS_IN = [(XG0 + .13, -0.59), (XG0 + .13, 0.59), (XA - .12, 0.535), (XA - .12, -0.535)]
WS_HOLE = [(XG0 + .10, -0.62), (XG0 + .10, 0.62), (XA - .09, 0.56), (XA - .09, -0.56)]


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
                            all(XWS + .06 < v.co.x < XG1 - .12 and abs(v.co.y) < .74 and v.co.z > .9
                                for v in f.verts)], context='FACES')
_bm.to_mesh(body.data)
_bm.free()
# tailgate glass, from behind: large and trapezoidal on the photos
rg = [(-0.58, 1.26), (0.58, 1.26), (0.48, 1.58), (-0.48, 1.58)]
conform('Rear glass blackout', SHELL, [(-0.62, 1.23), (0.62, 1.23), (0.52, 1.61), (-0.52, 1.61)],
        'x', 1, GLOSSBK, .002, .03)
conform('Rear window', SHELL, rg, 'x', 1, GLASS_T, .006, .03)
_RG = stick(SHELL, 'x', 1, 0, 1.27, .012)
rod('Rear wiper', tuple(_RG[0]), tuple(_RG[0] + Vector((-.06, -.36, .10))), .009, PLASTIC, 8)

# ---------------------------------------------------------- shut lines
SHUT = mat('Panel gap', (.008, .006, .006), .0, .60)
for side in (-1, 1):
    for pts in ([(-0.88, 0.70), (-0.88, 1.15)],                         # front door, leading edge
                [(0.13, 0.36), (0.13, 1.17)],                           # B-pillar
                [(1.06, 0.82), (1.06, 1.18)],                           # rear door, trailing edge
                [(-0.88, 0.70), (-0.85, 0.52), (-0.82, 0.37)],
                [(-0.82, 0.37), (0.90, 0.37)],                          # door bottoms
                [(1.06, 0.82), (0.96, 0.74), (0.88, 0.60), (0.86, 0.40)]):
        strip('Door shut line', SHELL, pts, .006, 'y', side, SHUT, .0015, .02)
    strip('Bonnet shut line', SHELL, [(FRONT + .28, side * .70), (XWS - .03, side * .73)],
          .006, 'z', 1, SHUT, .0015, .02)
strip('Bonnet rear shut line', SHELL, [(XWS - .02, -.73), (XWS - .02, .73)], .006, 'z', 1, SHUT, .0015, .02)
for pts in ([(-0.70, 0.56), (0.70, 0.56)], [(-0.70, 0.56), (-0.72, 1.20)], [(0.70, 0.56), (0.72, 1.20)]):
    strip('Tailgate shut line', SHELL, pts, .006, 'x', 1, SHUT, .0015, .02)


def ngon(cy, cz, r, n=16):
    return [(cy + r * math.cos(TAU * i / n), cz + r * math.sin(TAU * i / n)) for i in range(n)]


def diamonds(name, p, n, size, material):
    """Three-diamond badge, simplified: three rhombi meeting at the centre."""
    r, u, nn = frame_of(n)
    for k in range(3):
        a = math.pi / 2 + k * TAU / 3
        d = Vector(r * math.cos(a) + u * math.sin(a))
        c = Vector(p) + d * size * .5
        m = Matrix((r, u, nn)).transposed()
        rot = Matrix.Rotation(a - math.pi / 2, 3, nn)
        rr, uu = rot @ r, rot @ u
        verts = [tuple(c + uu * size * .5), tuple(c + rr * size * .22), tuple(c - uu * size * .5),
                 tuple(c - rr * size * .22)]
        verts += [tuple(Vector(v) - nn * .008) for v in verts]
        _mesh(name, verts, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
              material, bevel=.002, seg=1, smooth=False)


# ----------------------------------------------------- the front (3rd gen)
# Read off the head-on photo (z above ground, y across): headlamps in the
# top corners at the bonnet line, a chrome double bar through a black upper
# grille carrying the badge, broad chrome Dynamic Shield arms down each side
# hooking out at the bottom, a large black lower grille with a red warning
# strip, round fog lamps low in the corners, and a silver skid plate.
_F = lambda y, z, p=0.0: stick(SHELL, 'x', -1, y, z, p)
for side in (-1, 1):
    s = side
    hl = [(s * .53, .880), (s * .86, .895), (s * .885, 1.020), (s * .60, 1.030)][::s]
    conform('Headlamp reflector', SHELL, hl, 'x', -1, SATIN, .003, .02)
    conform('Headlamp lens', SHELL, hl, 'x', -1, LAMP, .010, .02)
    for yy, r in ((.665, .048), (.790, .040)):
        conform('Headlamp bezel', SHELL, ngon(s * yy, .960, r + .012), 'x', -1, GLOSSBK, .005, .015)
        conform('Headlamp projector', SHELL, ngon(s * yy, .960, r), 'x', -1, GLOW, .007, .015)
    strip('Headlamp LED', SHELL, [(s * .57, .905), (s * .84, .912)], .012, 'x', -1, GLOW, .007, .015)
    # wrap of the lamp on to the wing
    conform('Headlamp lens', SHELL, [(FRONT + .05, .91), (FRONT + .30, .935), (FRONT + .30, .985),
                                     (FRONT + .08, 1.005)], 'y', s, LAMP, .008, .02)
    # Dynamic Shield arm
    strip('Dynamic Shield', SHELL, [(s * .600, .885), (s * .640, .78), (s * .655, .62), (s * .660, .48),
                                    (s * .690, .395), (s * .760, .350)], .070, 'x', -1, CHROME, .008, .02)
    # fog lamp in a black pocket
    conform('Fog lamp pocket', SHELL, ngon(s * .815, .470, .075), 'x', -1, GLOSSBK, .004, .02)
    conform('Fog lamp', SHELL, ngon(s * .815, .470, .048), 'x', -1, LAMP, .008, .02)
    p, n = _F(s * .815, .470, .004)
    obox('Fog lamp element', p, n, (.050, .050, .010), GLOW, bevel=.012)
conform('Upper grille', SHELL, [(-.56, .860), (.56, .860), (.58, .990), (-.58, .990)], 'x', -1, GLOSSBK, .004, .03)
for z in (.968, .875):
    strip('Grille chrome bar', SHELL, [(-.58, z + .010), (-.30, z), (.30, z), (.58, z + .010)], .036,
          'x', -1, CHROME, .010, .02)
p, n = _F(0, .922, .012)
diamonds('Grille badge', p, n, .110, CHROME)
conform('Lower grille', SHELL, [(-.61, .38), (.61, .38), (.60, .835), (-.60, .835)], 'x', -1, GLOSSBK, .005, .03)
for z in (.78, .70, .52):
    strip('Lower grille slat', SHELL, [(-.55, z), (.55, z)], .010, 'x', -1, TRIM, .008, .03)
# red warning lamps let into the lower grille (the red strip on the photo)
p, n = _F(0, .610, .010)
obox('Grille flasher', p, n, (.56, .045, .016), BEACON, bevel=.008)
conform('Skid plate', SHELL, [(-.78, .285), (.78, .285), (.74, .365), (-.74, .365)], 'x', -1, SATIN, .007, .03)
p, n = _F(0, .440, .012)
obox('Number plate', p, n, (.330, .135, .010), PLATE, bevel=.004)
text('Plate lettering', PLATE_NO, p, n, .070, TRIM, off=.006)
# OUTLANDER in spaced chrome letters along the bonnet's leading edge
p, n = SHELL.hit('z', 1, FRONT + .10, 0)
text('Bonnet badge', 'O U T L A N D E R', p, n, .040, CHROME, up=(1, 0, 0), extrude=.002, off=.003)

# ---------------------------------------------------------------- the tail
# From the rear photos: LED lamps wrapping from the quarter on to the
# tailgate, joined by a chrome bar with the badge, plate below, OUTLANDER
# badge low left, donation lettering, black lower bumper with a silver skid
# plate and round red reflectors, and a roof spoiler with side fins.
_R = lambda y, z, p=0.0: stick(SHELL, 'x', 1, y, z, p)
for side in (-1, 1):
    s = side
    conform('Tail lamp', SHELL, [(s * .45, 1.000), (s * .895, .975), (s * .895, 1.135), (s * .45, 1.115)][::s],
            'x', 1, TAILRED, .007, .02)
    conform('Reversing lamp', SHELL, [(s * .72, .950), (s * .895, .945), (s * .895, .985), (s * .72, .990)][::s],
            'x', 1, LAMP, .007, .02)
    for z in (1.045, 1.090):
        strip('Tail lamp LED', SHELL, [(s * .50, z), (s * .87, z - .012)], .010, 'x', 1, GLOW_R, .010, .02)
    # the lamp wraps on to the quarter panel, ending in a point
    conform('Tail lamp', SHELL, [(1.96, 1.060), (2.06, .985), (2.37, .975), (2.37, 1.135), (2.06, 1.125)],
            'y', s, TAILRED, .007, .02)
    conform('Rear reflector', SHELL, ngon(s * .790, .395, .045), 'x', 1, TAILRED, .007, .02)
conform('Tailgate chrome bar', SHELL, [(-.47, 1.050), (-.40, 1.088), (.40, 1.088), (.47, 1.050),
                                       (.40, 1.110), (-.40, 1.110)], 'x', 1, CHROME, .008, .02)
p, n = _R(0, 1.040, .010)
diamonds('Tailgate badge', p, n, .095, CHROME)
p, n = _R(0, .865, .010)
obox('Rear plate', p, n, (.330, .135, .010), PLATE, bevel=.004)
text('Rear plate lettering', PLATE_NO, p, n, .070, TRIM, off=.006)
p, n = _R(-.50, .765, .002)
text('Tailgate badge', 'OUTLANDER', p, n, .036, CHROME, extrude=.002)
if DONOR:
    p, n = _R(0, .700, .003)
    text('Tailgate lettering', '　'.join(DONOR), p, n, .050, WHITE)
conform('Rear bumper cladding', SHELL, [(-.76, .30), (.76, .30), (.76, .52), (-.76, .52)], 'x', 1, PLASTIC,
        .004, .03)
for s in (-1, 1):
    # the black lower bumper wraps round to the rear arch (rear three-quarter photos)
    conform('Rear bumper cladding', SHELL, [(AX_R + ARCH_R + .06, .30), (REAR + .02, .30), (REAR + .02, .52),
                                            (AX_R + ARCH_R + .02, .45)], 'y', s, PLASTIC, .004, .03)
conform('Rear skid plate', SHELL, [(-.66, .285), (.66, .285), (.62, .375), (-.62, .375)], 'x', 1, SATIN,
        .007, .03)
# roof spoiler over the tailgate glass, with fins at its ends
p, n = _R(0, 1.640, 0)
SPX = p.x
box('Roof spoiler', (SPX - .05, 0, 1.690), (.15, 1.26, .035), RED, .015, 3)
for s in (-1, 1):
    hexa_ = [(SPX - .10, s * .60, 1.690), (SPX + .09, s * .60, 1.690), (SPX + .09, s * .64, 1.690),
             (SPX - .10, s * .64, 1.690)]
    _mesh('Spoiler fin', hexa_ + [(SPX - .02, s * .60, 1.712), (SPX + .11, s * .60, 1.725),
                                  (SPX + .11, s * .62, 1.725), (SPX - .02, s * .62, 1.712)],
          CUBE_F, RED, .006)
box('High-level stop lamp', (SPX + .085, 0, 1.672), (.012, .30, .018), TAILRED, .004)

# ------------------------------------------------------------- side detail
for side in (-1, 1):
    s = side
    # black rocker cladding between the arches, chrome garnish on the doors
    conform('Rocker cladding', SHELL, [(AX_F + ARCH_R + .02, .275), (AX_R - ARCH_R - .02, .275),
                                       (AX_R - ARCH_R - .02, .370), (AX_F + ARCH_R + .02, .370)],
            'y', s, PLASTIC, .006, .03)
    strip('Door garnish', SHELL, [(-0.84, .405), (0.12, .405)], .030, 'y', s, CHROME, .010, .03)
    strip('Door garnish', SHELL, [(0.145, .405), (0.88, .405)], .030, 'y', s, CHROME, .010, .03)
    # door handles on the character line
    for xh in (-0.06, 0.90):
        p, n = stick(SHELL, 'y', s, xh, .955, .012)
        obox('Door handle', p, n, (.17, .034, .024), CHROME, bevel=.010)
    # body-coloured mirror on the door
    p, n = stick(SHELL, 'y', s, -0.74, 1.20, 0)
    box('Mirror base', (-0.74, p.y + s * .025, 1.20), (.17, .06, .07), PLASTIC, .015)
    box('Mirror stalk', (-0.71, p.y + s * .085, 1.215), (.07, .11, .04), PLASTIC, .012)
    box('Mirror cap', (-0.68, s * .955, 1.245), (.12, .19, .13), RED, .040, 3)
    box('Mirror glass', (-0.615, s * .955, 1.245), (.010, .165, .10), CHROME, .006)
    box('Mirror repeater', (-0.725, s * .965, 1.195), (.04, .12, .012), AMBER, .004)
    # fuel lid on the driver's side quarter (left-side photo)
    if s < 0:
        p, n = stick(SHELL, 'y', s, 1.55, 1.00, .0015)
        obox('Fuel lid seam', p, n, (.19, .15, .002), SHUT, bevel=0)
        obox('Fuel lid', p + n * .0015, n, (.18, .14, .002), RED, bevel=0)


# arch cladding: a thin black lip round each opening
def arch_lip(ax, side, n_arc=40, band=.045, bulge=.016, z_floor=.30):
    lo = math.asin(max(-1.0, min(1.0, (z_floor - AXLE_Z) / ARCH_R)))
    verts, faces = [], []
    N_SEC = 7
    rows = 0
    for i in range(n_arc + 1):
        a = lo + (math.pi - 2 * lo) * i / n_arc
        nx, nz = math.cos(a), math.sin(a)
        px, pz = ax + ARCH_R * nx, AXLE_Z + .015 + ARCH_R * nz
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

# ------------------------------------------------- roof: rails and light bar
ROOF_RAIL_Y = 0.60
for side in (-1, 1):
    pts = []
    for i in range(13):
        x = -0.20 + (1.78 + 0.20) * i / 12
        loc, n = SHELL.hit('z', 1, x, side * ROOF_RAIL_Y)
        pts.append(Vector((x, side * ROOF_RAIL_Y, loc.z + .045)))
    for a, b in zip(pts, pts[1:]):
        rod('Roof rail', tuple(a), tuple(b), .015, SATIN, 12)
    for x in (-0.18, 0.80, 1.76):
        loc, n = SHELL.hit('z', 1, x, side * ROOF_RAIL_Y)
        box('Roof rail foot', (x, side * ROOF_RAIL_Y, loc.z + .022), (.09, .036, .046), PLASTIC, .012)

# Short red LED bar (about 0.9 m) with a silver centre unit, carried on a
# cross bar and short posts over the B-pillar (front, side and rear photos).
LB_X = 0.12
RAIL_Z = SHELL.hit('z', 1, LB_X, ROOF_RAIL_Y)[0].z + .045
LB_Z0 = RAIL_Z + .050                       # underside of the bar
box('Light bar cross bar', (LB_X, 0, RAIL_Z + .012), (.050, 2 * ROOF_RAIL_Y + .06, .022), SATIN, .006)
for y in (-.30, .30):
    box('Light bar post', (LB_X, y, (RAIL_Z + LB_Z0) / 2 + .01), (.040, .030, LB_Z0 - RAIL_Z), SATIN, .006)
box('Light bar base', (LB_X, 0, LB_Z0 + .010), (.27, .92, .020), TRIM, .006)
for k in range(3):
    for s in (-1, 1):
        y = s * (.140 + k * .110)
        box('Light bar lens', (LB_X, y, LB_Z0 + .062), (.26, .104, .085), BEACON, .016, 2)
        for dz in (-.020, .0, .020):
            for dy in (-.030, .0, .030):
                box('Light bar LED', (LB_X - .131, y + dy, LB_Z0 + .062 + dz), (.004, .014, .010), GLOW_R, 0)
box('Light bar centre unit', (LB_X, 0, LB_Z0 + .068), (.27, .17, .100), SATIN, .020, 3)
box('Light bar speaker grille', (LB_X - .137, 0, LB_Z0 + .066), (.006, .13, .060), TRIM, .006)
box('Light bar centre lamp', (LB_X + .02, 0, LB_Z0 - .012), (.06, .06, .030), BEACON, .010)
for s in (-1, 1):
    box('Light bar end cap', (LB_X, s * .455, LB_Z0 + .060), (.26, .016, .090), TRIM, .006)
z = SHELL.hit('z', 1, 1.62, 0)[0].z
box('Shark fin antenna', (1.62, 0, z + .030), (.16, .06, .06), RED, .025, 3)

# ------------------------------------------------------------- lettering
# Front door (photos): 臺北市政府消防局 / phoenix emblem / 消防警備車, centred
# ahead of the handle; rear doors: the donation lettering in two lines.
EMBLEM = decal_mat('Fire service emblem', 'phoenix_emblem.png')
EM_ASPECT = 200.0 / 228.0
for side in (-1, 1):
    s = side
    ex = -0.47
    p, n = stick(SHELL, 'y', s, ex, 0.895)
    text('Door lettering', '臺北市政府消防局', p, n, .074, WHITE)
    EM_H = .19
    EM_W = EM_H * EM_ASPECT
    ez = .755
    conform('Fire service emblem', SHELL,
            [(ex - EM_W / 2, ez - EM_H / 2), (ex + EM_W / 2, ez - EM_H / 2),
             (ex + EM_W / 2, ez + EM_H / 2), (ex - EM_W / 2, ez + EM_H / 2)], 'y', s, EMBLEM, .005, .03,
            uv=(ex - EM_W / 2, ez - EM_H / 2, ex + EM_W / 2, ez + EM_H / 2, s > 0))
    p, n = stick(SHELL, 'y', s, ex, 0.615)
    text('Vehicle type', VEHICLE_TYPE, p, n, .064, WHITE)
    for k, line in enumerate(DONOR):
        p, n = stick(SHELL, 'y', s, 0.47, 0.895 - k * .080)
        text('Donation lettering', line, p, n, .066, WHITE)
# phoenix emblem on the bonnet, reading from the front
HX, HH = -1.72, .30
HWD = HH * EM_ASPECT
conform('Bonnet emblem', SHELL, [(HX - HH / 2, -HWD / 2), (HX + HH / 2, -HWD / 2), (HX + HH / 2, HWD / 2),
                                 (HX - HH / 2, HWD / 2)], 'z', 1, EMBLEM, .004, .03,
        uv=lambda x, y: ((HWD / 2 - y) / HWD, (x - (HX - HH / 2)) / HH))
# yellow unit name inside the screen, kerb-side top corner; small emblem on
# the driver's side (head-on photo)
p, n = SHELL.hit('z', 1, XA - .20, .40)
text('Windscreen callsign', CALLSIGN, p, n, .055, YELLOW, up=(1, 0, 0), off=.002)
SX, SH = XA - .19, .09
SW = SH * EM_ASPECT
conform('Windscreen emblem', SHELL, [(SX - SH / 2, -.45 - SW / 2), (SX + SH / 2, -.45 - SW / 2),
                                     (SX + SH / 2, -.45 + SW / 2), (SX - SH / 2, -.45 + SW / 2)],
        'z', 1, EMBLEM, .004, .02, uv=lambda x, y: ((-.45 + SW / 2 - y) / SW, (x - (SX - SH / 2)) / SH))

# ---------------------------------------------------------------- interior
box('Floor pan', (0.20, 0, 0.42), (3.60, 1.66, .03), PANEL, .005)
# headliner and side linings, kept behind the A-pillar (a full-length lining
# stood out through the sloping screen)
box('Headliner', (0.80, 0, 1.640), (1.90, 1.28, .02), PANEL, .005)
for s_ in (-1, 1):
    box('Cabin side lining', (0.80, s_ * 0.67, 1.38), (1.80, .02, .40), PANEL, .005)
    box('Door trim', (0.0, s_ * 0.78, 0.90), (2.00, .02, .40), PANEL, .005)
box('Dashboard', (XWS + .28, 0, 1.020), (.38, 1.58, .22), DASH, .040, 3)
box('Dash top', (XWS + .20, 0, 1.135), (.30, 1.54, .03), DASH, .010)
box('Centre screen', (XWS + .40, 0, 1.19), (.03, .26, .15), SCREEN, .006)
box('Centre console', (-0.45, 0, 0.62), (.85, .24, .22), DASH, .030, 3)
rod('Steering column', (XWS + .30, -0.37, 1.00), (XWS + .50, -0.37, 1.08), .028, DASH)
bpy.ops.mesh.primitive_torus_add(location=(XWS + .52, -0.37, 1.09), major_radius=.185,
                                 minor_radius=.019, major_segments=32, minor_segments=10,
                                 rotation=(0, math.radians(-68), 0))
_w = bpy.context.object
_w.name = 'Steering wheel'
_w.data.materials.append(DASH)


def seat(name, x, y, w):
    box(name + ' cushion', (x, y, .66), (.50, w, .11), CLOTH, .040, 3)
    box(name + ' back', (x + .30, y, .94), (.11, w, .52), CLOTH, .040, 3)
    box(name + ' headrest', (x + .31, y, 1.26), (.09, w * .55, .14), CLOTH, .030, 3)


seat('Driver seat', -0.55, -0.37, .50)
seat('Front passenger seat', -0.55, 0.37, .50)
for y in (-0.47, 0, 0.47):
    seat('Rear seat', 0.45, y, .44)

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
    b, t = RIM + .008, TIRE_R
    sw = t - b                                       # sidewall height
    prof = [(b, -h + .018), (b + .25 * sw, -h + .004), (b + .60 * sw, -h), (t - .014, -h + .010),
            (t - .004, -h + .030), (t - .006, -h + .060), (t - .006, h - .060), (t - .004, h - .030),
            (t - .014, h - .010), (b + .60 * sw, h), (b + .25 * sw, h - .004), (b, h - .018)]
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


def spoke(cx, yo, side, a, r0=.058, r1=RIM - .008, w0=.016, w1=.030, d0=.030, d1=.018, dish=.020):
    """Flat spoke blade from hub to rim along angle a (in the X-Z wheel plane)."""
    c, sn = math.cos(a), math.sin(a)
    tc, ts = -sn, c                                 # across the spoke
    verts = []
    for r, w, d, back in ((r0, w0, d0, 0.0), (r1, w1, d1, dish)):
        for sw in (-1, 1):
            for sd in (0, 1):
                face = yo - side * back - side * d * sd
                verts.append((cx + r * c + sw * w / 2 * tc, face, AXLE_Z + r * sn + sw * w / 2 * ts))
    # verts: inner (-w,front) (-w,back) (+w,front) (+w,back), then outer the same
    faces = [(0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6), (0, 1, 3, 2), (4, 6, 7, 5)]
    return _mesh('Wheel spoke', verts, faces, ALLOY, bevel=.003, seg=1, smooth=False)


def wheel(cx, cy, side):
    """One 18-inch wheel: tyre, two-tone multi-spoke alloy, disc and caliper.
    Returns (spinning parts, fixed parts)."""
    w = WHEEL_W
    spin = [tyre(cx, cy, w), tread_ring('Tire tread', cx, cy, TIRE_R - .008, w - .06)]
    yo = cy + side * (w / 2 - .020)            # outer face of the rim
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
    spin.append(cyl('Hub face', (cx, yo - side * .010, AXLE_Z), .064, .040, ALLOY_D, verts=28))
    spin.append(cyl('Centre cap', (cx, yo + side * .004, AXLE_Z), .036, .012, CHROME, verts=24))
    # seven V-pairs of thin machined spokes over a dark wheel (the 18 in
    # two-tone wheel on the photos); each spoke is a flat blade to the rim
    for j in range(7):
        for k in (-1, 1):
            a = j * TAU / 7 + k * math.radians(6.5)
            spin.append(spoke(cx, yo, side, a))
    for j in range(5):
        a = j * TAU / 5 + .3
        spin.append(cyl('Wheel nut', (cx + .042 * math.cos(a), yo + side * .002, AXLE_Z + .042 * math.sin(a)),
                        .008, .012, CHROME, verts=8, bevel=0))
    fixed = [cyl('Brake disc', (cx, yo - side * .075, AXLE_Z), .160, .026, DISC, verts=40),
             box('Brake caliper', (cx + .09, yo - side * .065, AXLE_Z + .09), (.08, .05, .11), TRIM, .012)]
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
#   └─ Wheel spin R L / R R
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

vehicle = empty('Vehicle', (0, 0, 0), 1.0, 'ARROWS')
for o in list(bpy.context.scene.objects):
    if o is not vehicle and o.parent is None:
        adopt(o, vehicle)

scene = bpy.context.scene
scene['Axles'] = (AX_F, AX_R)
scene['Tyre radius'] = TIRE_R
scene['Track'] = TRACK

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
s['Reference'] = 'Taipei City Fire Department Mitsubishi Outlander (3rd gen facelift), from photographs'
s['Model scope'] = ('Exterior study of the Taipei car from photographs and published Outlander '
                    'dimensions. Unit name and plate are illustrative.')

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
