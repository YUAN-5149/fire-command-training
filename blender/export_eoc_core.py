# -*- coding: utf-8 -*-
"""
Export the Taipei EOC "core" for the real-map scenes: the building, its own
features and its site (driveway and plaza paving, the parking lot with its bays
and parked cars, the small park, trees, the YouBike dock), but none of the
invented neighbours, streets or far ground, so it can sit among the official
LOD1 buildings and the Xinyi street network.

Site objects get an extras "drape" flag for the Xinyi street walk, which lays
them on its terrain: "surface" = flat ground meshes (each vertex follows the
ground), "object" = things standing on the ground (moved as a whole).

Run after build_taipei_eoc.py has written blender/taipei-eoc.blend:
  blender -b blender/taipei-eoc.blend -P blender/export_eoc_core.py -- --outdir <repo>

Writes assets/taipei-eoc-core.glb (plain glTF, no Draco, so the ArcGIS
real map can load it as well as three.js).  Same build space as the full
model: origin at the SW corner of the main block, +X east, +Y north, metres;
glTF maps +Y to -Z.  The real-map pages place it with a lon/lat anchor and
heading (see dist/eoc-anchor.json).
"""

import bpy
import os
import sys

OUT_DIR = os.getcwd()
if "--outdir" in sys.argv:
    OUT_DIR = sys.argv[sys.argv.index("--outdir") + 1]

CORE_PREFIXES = (
    "EOC building", "EOC east wing", "EOC top storey", "EOC helipad", "EOC mast",
    "EOC windsock", "EOC name plate", "EOC plate", "EOC corner column",
    "EOC arched canopy", "EOC vent tower", "EOC basement ramp", "EOC hedges",
    "EOC driveway bollards", "EOC fountain",
) + (
    "EOC site paving", "EOC parking lot", "EOC parking bays", "EOC north park paths",
    "Road markings yellow box grid", "Parked car", "EOC tree", "YouBike station",
)
DRAPE_SURFACE = ("EOC site paving", "EOC parking lot", "EOC parking bays",
                 "EOC north park paths", "Road markings yellow box grid")
DRAPE_OBJECT = ("Parked car", "EOC tree", "YouBike station")

bpy.ops.object.select_all(action='DESELECT')
keep = []
for ob in bpy.data.objects:
    if ob.type == 'MESH' and ob.name.startswith(CORE_PREFIXES):
        ob.select_set(True)
        keep.append(ob.name)
        if ob.name.startswith(DRAPE_SURFACE):
            ob["drape"] = "surface"
        elif ob.name.startswith(DRAPE_OBJECT):
            ob["drape"] = "object"
print("CORE_OBJECTS=", len(keep))
glb = os.path.join(OUT_DIR, "assets", "taipei-eoc-core.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True,
                          use_selection=True, export_extras=True)
print("GLB_BYTES=", os.path.getsize(glb))
