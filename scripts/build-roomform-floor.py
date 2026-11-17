#!/usr/bin/env python3
"""ROOMFORM pp4 單戶平面 → 信義街景室內「高樓住宅標準層」資料（dist/assets/roomform-pp4-floor.json）。

來源：使用者提供的 https://roomform-walk.pages.dev/ 公開 walk/manifest.json（房間多邊形、外框、牆與家具矩形）。
只取平面資料，不使用該站 3D 模型與光影貼圖。

座標：室內平面 x 沿起火立面、z 由立面往內（z=0 為臨街側），與 xinyi-street-interior-rules.js 一致。
單戶左右鏡射後放在既有樓梯間（x 0–3.5、z 7–12）與梯廳右側，玄關大門朝梯廳。
門的位置依 ROOMFORM 牆段缺口手動對照；大門原平面未畫出，依玄關位置在外牆開設（示意）。
家具高度原資料沒有，依尺寸估計（示意）。

用法：python3 scripts/build-roomform-floor.py MANIFEST_JSON [OUT_JSON]
"""
import json, math, sys, hashlib

SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else 'dist/assets/roomform-pp4-floor.json'
raw = open(SRC, 'rb').read()
m = json.loads(raw)

X1 = 12.456          # 單戶最東側外牆
OX = 5.6             # 鏡射後單戶起點（梯廳寬 2.1 m）
W, D = 18.0, 12.0
mx = lambda x: round(OX + X1 - x, 3)
r3 = lambda v: round(v, 3)

# 房間（原座標、軸對齊矩形）。kind: room 可搜索；corridor 通道。
ROOMS = [
    ('living', '客廳', 'room', 8.46, 12.456, 1.656, 6.588),
    ('dining', '餐廳', 'room', 7.308, 12.456, 6.588, 8.496),
    ('kitchen', '廚房', 'room', 7.308, 11.052, 8.496, 10.962),
    ('foyer', '玄關', 'corridor', 11.052, 12.456, 8.496, 10.962),
    ('hall', '走道', 'corridor', 3.924, 8.46, 5.4, 6.588),
    ('master', '主臥', 'room', 2.196, 5.562, 1.656, 5.4),
    ('mbath', '主衛', 'room', 0.576, 2.196, 1.656, 5.4),
    ('study', '書房', 'room', 5.562, 8.46, 1.656, 5.4),
    ('kids', '兒童房', 'room', 0.576, 3.924, 5.4, 8.28),
    ('bath', '衛浴', 'room', 4.572, 7.308, 6.588, 8.28),
    ('service', '工作陽台', 'room', 5.382, 7.308, 8.28, 10.962),
    ('balcony', '陽台', 'outdoor', 8.46, 12.456, 0.162, 1.656),
]
# 門：a 為房間側。axis 'x'＝門在東西向牆上（z 固定），'z'＝門在南北向牆上（x 固定）。w 門寬。
DOORS = [
    ('Dmaster', 'master', 'hall', 4.446, 5.4, 'x', .8),
    ('Dstudy', 'study', 'hall', 7.947, 5.4, 'x', .8),
    ('Dmbath', 'mbath', 'master', 2.196, 4.933, 'z', .75),
    ('Dkids', 'kids', 'hall', 3.924, 5.949, 'z', .8),
    ('Dbath', 'bath', 'hall', 6.021, 6.588, 'x', .65),
    ('Dservice', 'service', 'kitchen', 7.308, 9.603, 'z', .8),
    ('Dentry', 'foyer', 'lobby', 12.456, 9.7, 'z', .9),
]
# 開放式連通（無門扇，恆為開啟）。
OPENINGS = [
    ('Oliving', 'living', 'hall', 8.46, 6.03, 'z', 1.1),
    ('Odining', 'living', 'dining', 10.458, 6.588, 'x', 3.9),
    ('Ohall', 'hall', 'dining', 7.92, 6.588, 'x', 1.0),
    ('Okitchen', 'kitchen', 'dining', 9.18, 8.496, 'x', 3.6),
    ('Ofoyer', 'foyer', 'dining', 11.754, 8.496, 'x', 1.3),
    ('Ofoyer2', 'foyer', 'kitchen', 11.052, 9.73, 'z', 2.0),
]
# 窗：kind window（窗台 0.9 m）、slider（落地拉門）、railing（陽台欄杆，恆開）。
WINDOWS = [
    ('Wmaster', 'master', 3.456, 1.656, 'x', 1.4, 'window'),
    ('Wstudy', 'study', 6.588, 1.656, 'x', 1.4, 'window'),
    ('Wliving', 'living', 11.243, 1.656, 'x', 1.4, 'slider'),
    ('Wbalcony', 'balcony', 10.458, .162, 'x', 3.9, 'railing'),
    ('Wkids', 'kids', .576, 6.813, 'z', 1.4, 'window'),
    ('Wservice', 'service', 5.382, 9.612, 'z', 2.2, 'railing'),
]
# 起火房間候選：火點（原座標）放在主要可燃家具附近。
FIRE = {'living': (10.4, 3.4), 'master': (3.3, 2.7)}

spaces, doors, windows, walls, furniture = [], [], [], [], []
for sid, name, kind, x0, x1, z0, z1 in ROOMS:
    spaces.append({'id': sid, 'name': name, 'kind': kind, 'x0': mx(x1), 'x1': mx(x0), 'z0': r3(z0), 'z1': r3(z1)})
# 樓梯間與梯廳（本專案原有樓梯幾何：x 0–3.5、z 7–12）。
spaces += [
    {'id': 'stair', 'name': '樓梯間', 'kind': 'stair', 'x0': 0, 'x1': 3.5, 'z0': 7, 'z1': 12},
    {'id': 'corridor', 'name': '梯廳', 'kind': 'corridor', 'x0': 0, 'x1': OX, 'z0': 5, 'z1': 7},
    {'id': 'lobby', 'name': '梯廳', 'kind': 'corridor', 'x0': 3.5, 'x1': OX, 'z0': 7, 'z1': 12},
]
for did, a, b, x, z, axis, w in DOORS:
    doors.append({'id': did, 'a': a, 'b': b, 'x': mx(x), 'z': r3(z), 'axis': axis, 'w': w})
doors.append({'id': 'D0', 'a': 'stair', 'b': 'corridor', 'x': 1.75, 'z': 7, 'axis': 'x', 'w': .9})
for did, a, b, x, z, axis, w in OPENINGS:
    doors.append({'id': did, 'a': a, 'b': b, 'x': mx(x), 'z': r3(z), 'axis': axis, 'w': w, 'opening': True})
doors.append({'id': 'Olobby', 'a': 'corridor', 'b': 'lobby', 'x': r3((3.5 + OX) / 2), 'z': 7, 'axis': 'x', 'w': r3(OX - 3.5), 'opening': True})

byId = {s['id']: s for s in spaces}
for wid, sid, x, z, axis, w, kind in WINDOWS:
    s = byId[sid]
    lx, lz = (mx(x), r3(z))
    # 朝室內的法線符號：x 向窗看房間中心在 z 哪側；z 向窗看 x 哪側。
    n = (1 if (s['z0'] + s['z1']) / 2 > lz else -1) if axis == 'x' else (1 if (s['x0'] + s['x1']) / 2 > lx else -1)
    windows.append({'id': wid, 'space': sid, 'x': lx, 'z': lz, 'axis': axis, 'w': w, 'kind': kind, 'n': n})

# 牆：ROOMFORM 牆矩形（厚度 ≤ 0.08 m）取中線；成對重複者為開窗牆段，去重即可（開窗由 windows 繪製）。
seen = set()
for s in m['solids']:
    cx, cz, hl, ht, rot = s
    if ht > .08:
        continue
    key = tuple(s)
    if key in seen:
        continue
    seen.add(key)
    vert = abs(abs(math.sin(rot)) - 1) < 1e-3
    if vert:
        walls.append([mx(cx), r3(cz - hl), mx(cx), r3(cz + hl)])
    else:
        a, b = sorted([mx(cx - hl), mx(cx + hl)])
        walls.append([a, r3(cz), b, r3(cz)])
# 客廳往陽台的落地拉門位於 ROOMFORM 兩段牆之間的缺口，補一段牆讓拉門（窗）可繪製並阻擋通行。
walls.append([mx(11.97), 1.656, mx(10.515), 1.656])
walls += [[0, 5, OX, 5], [0, 5, 0, 7], [0, 7, 0, 12], [0, 12, OX, 12], [0, 7, 3.5, 7], [3.5, 7, 3.5, 12], [OX, 11.03, OX, 12]]

# 家具（含結構柱）：旋轉矩形取外接框；高度依尺寸估計（示意）。
def space_at(x, z):
    for s in spaces:
        if s['x0'] - 1e-6 <= x <= s['x1'] + 1e-6 and s['z0'] - 1e-6 <= z <= s['z1'] + 1e-6:
            return s['id']
    return None

for s in m['solids']:
    cx, cz, hx, hz, rot = s
    if hz <= .08:
        continue
    c, sn = abs(math.cos(rot)), abs(math.sin(rot))
    ex, ez = hx * c + hz * sn, hx * sn + hz * c
    x0, x1, z0, z1 = mx(cx + ex), mx(cx - ex), cz - ez, cz + ez
    if abs(hx - hz) < .01 and hx > .45:
        h, kind = 2.8, 'column'
    elif max(ex, ez) >= .7 and min(ex, ez) <= .32:
        h, kind = 2.0, 'cabinet'
    elif ex * ez * 4 >= 1.2:
        h, kind = .55, 'bed-sofa'
    else:
        h, kind = .8, 'furniture'
    sid = space_at((x0 + x1) / 2, (z0 + z1) / 2)
    if not sid:   # 中心落在室內範圍外（外牆柱、外凸檯面）：不列入
        continue
    if True:      # 超出房間的部分裁到所在房間內
        sp = byId[sid]
        x0, x1, z0, z1 = max(x0, sp['x0'] + .05), min(x1, sp['x1'] - .05), max(z0, sp['z0'] + .05), min(z1, sp['z1'] - .05)
    furniture.append({'space': sid, 'x': r3((x0 + x1) / 2), 'z': r3((z0 + z1) / 2), 'w': r3(x1 - x0), 'd': r3(z1 - z0), 'h': h, 'kind': kind})

fire = {k: {'x': mx(x), 'z': r3(z)} for k, (x, z) in FIRE.items()}
out = {
    'name': 'ROOMFORM pp4 高樓住宅標準層（示意）',
    'source': {'url': 'https://roomform-walk.pages.dev/walk/manifest.json', 'sha256': hashlib.sha256(raw).hexdigest(),
               'note': '使用者提供的平面；只取房間、牆、家具矩形。單戶左右鏡射接本專案樓梯間與梯廳；大門位置、門寬、家具高度為示意。'},
    'W': W, 'D': D, 'ceiling': m.get('height', 2.8),
    'spaces': spaces, 'doors': doors, 'windows': windows, 'walls': walls, 'furniture': furniture,
    'fire': fire, 'victimRooms': ['master', 'kids', 'study', 'living', 'dining', 'kitchen', 'mbath', 'bath'],
}
json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print(OUT, len(spaces), 'spaces', len(doors), 'doors', len(windows), 'windows', len(walls), 'walls', len(furniture), 'furniture')
