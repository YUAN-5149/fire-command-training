# -*- coding: utf-8 -*-
"""
Export the Taipei City Fire Department HQ (臺北市政府消防局, 松仁路1號) on its
own for the real-map scenes: everything under the "S2 Fire HQ" group of the
Xinyi street scene (podium, tower, entrances, name plates, apparatus bays,
forecourt), without the roads, shophouses, furniture or backdrop.

Run after build_xinyi_street.py has written blender/xinyi-street.blend:
  blender -b blender/xinyi-street.blend -P blender/export_hq_core.py -- --outdir <repo>

Writes assets/fire-hq-core.glb (plain glTF).  Build space is the street
scene's: origin at the centre of the Songren / Zhongxiao intersection, +X
east, +Y north, metres.  The real-map pages place it with
dist/assets/hq-anchor.json, fitted to the official LOD1 2024 volumes.
"""

import bpy
import os
import sys

OUT_DIR = os.getcwd()
if "--outdir" in sys.argv:
    OUT_DIR = sys.argv[sys.argv.index("--outdir") + 1]

root = bpy.data.objects["S2 Fire HQ"]


def descendants(o):
    for c in o.children:
        yield c
        yield from descendants(c)


bpy.ops.object.select_all(action='DESELECT')
picked = [o for o in descendants(root) if o.type == 'MESH']
for o in picked:
    o.select_set(True)
print("HQ_OBJECTS=", len(picked))
glb = os.path.join(OUT_DIR, "assets", "fire-hq-core.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True,
                          use_selection=True, export_extras=True)
print("GLB_BYTES=", os.path.getsize(glb))
