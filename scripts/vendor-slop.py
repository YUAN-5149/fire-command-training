# -*- coding: utf-8 -*-
"""
從 mrdoob/slop-newyork（MIT）擷取車輛與行人的純幾何／動畫程式，轉成 ES 模組放到 dist/vendor/slop/。

  python scripts/vendor-slop.py <slop-newyork 目錄>

只取不依賴 TSL／WebGPU 的部分：
  actor-models.js：放樣車身幾何（LoftGeometry、轎車／計程車／休旅車規格、輪胎輪框、後照鏡、車頂燈）
  pedestrians.js：骨架、人體放樣幾何、PersonRig（腳步落地、兩段 IK、步態）
材質（原為 TSL）在 dist/slop-webgl.js 另以 GLSL 重寫。來源版本記在檔頭。
"""
import os
import re
import shutil
import subprocess
import sys

src = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, 'dist', 'vendor', 'slop')
os.makedirs(out, exist_ok=True)
rev = subprocess.run(['git', '-C', src, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
HEAD = ("// 擷取自 https://github.com/mrdoob/slop-newyork（commit %s，MIT License，見同目錄 LICENSE）\n"
        "// 由 scripts/vendor-slop.py 自動轉為 ES 模組：移除 window.NYC 全域與 TSL 材質，其餘程式未改。\n") % rev


def lines(name):
    return open(os.path.join(src, 'js', name), encoding='utf-8').read().split('\n')


def find(ls, needle, start=0):
    for i in range(start, len(ls)):
        if needle in ls[i]:
            return i
    raise SystemExit('marker not found: ' + needle)


# ---- actor-models.js：Addons 解構之後，到 lightbar 材質之前
A = lines('actor-models.js')
a0 = find(A, 'window.NYC.Addons') + 1
a1 = find(A, 'let _lightbarMat = null;')
body = '\n'.join(A[a0:a1])
assert 'Fn(' not in body and 'cityUniforms' not in body and 'attribute(' not in body, 'TSL left in car geometry'
open(os.path.join(out, 'actor-models.js'), 'w', encoding='utf-8').write(
    HEAD + "import * as THREE from 'three';\nimport {mergeGeometries,mergeVertices} from '../BufferGeometryUtils.js';\n" + body +
    "\nexport { CAR_PARTS, BODY_SPECS, carLayout, carBodyHalfWidthAt, taxiSignPlacement, buildCarGeometry, buildCarProxyGeometry, buildLightbarGeometry };\n")

# ---- pedestrians.js：骨架與幾何（到 TSL 材質章節前）＋ PersonRig 章節（到 window.NYC 匯出前）
P = lines('pedestrians.js')
p0 = find(P, 'window.NYC.Addons') + 1
p1 = find(P, '// 3. TSL MATERIAL') - 1
p2 = find(P, '// 5. PERSON RIG') - 1
p3 = find(P, 'Object.assign(window.NYC')
geo = '\n'.join(P[p0:p1])
rig = '\n'.join(P[p2:p3])
for part in (geo, rig):
    assert 'Fn(' not in part and 'attributeArray' not in part and 'attribute(' not in part, 'TSL left in person code'
open(os.path.join(out, 'pedestrians.js'), 'w', encoding='utf-8').write(
    HEAD + "import * as THREE from 'three';\nimport {mergeGeometries} from '../BufferGeometryUtils.js';\n" + geo + '\n' + rig +
    "\nexport { BONE as PERSON_BONES, BONE_COUNT, STRIDE, PART as PERSON_PART, HIP_X, buildPersonGeometry, PersonRig };\n")

shutil.copy(os.path.join(src, 'LICENSE'), os.path.join(out, 'LICENSE'))
print('vendored', rev[:10], 'actor-models lines', a1 - a0, 'pedestrians lines', (p1 - p0) + (p3 - p2))
