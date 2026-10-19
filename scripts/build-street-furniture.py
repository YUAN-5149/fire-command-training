# -*- coding: utf-8 -*-
"""
信義區全區街道設施：寫出 dist/assets/street-furniture-xinyi.json（本地公尺，x 東、z 南，與
xinyi-street-world.js 的 project() 相同）。

  python scripts/build-street-furniture.py <xinyi-osm.xml> <TaipeiLight.json>

  lamps     臺北市路燈（data.taipei TaipeiLight.json，TWD97 → WGS84）[x, z, 桿高, 燈數]
  trees     OSM natural=tree 與 natural=tree_row（每 7 m 一棵）[x, z]
  signals   OSM highway=traffic_signals，桿位移到最近人行道邊 [x, z, 桿位 x, 桿位 z]
  hydrants  OSM emergency=fire_hydrant [x, z, 0 地上式 / 1 地下式]
  busStops  OSM highway=bus_stop [x, z, 方向角]
  green     OSM leisure=park、landuse=grass 多邊形 [[x0,z0,x1,z1,...], ...]
桿位、朝向依 OSM 與車道資料推定，非實測；消防栓位置以 OSM 為準，實際以消防局水源資料為準。
"""
import json
import math
import os
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
O_LON, O_LAT = 121.5654, 25.0338
LON_M = 111320 * math.cos(math.radians(O_LAT))
LAT_M = 110574


def project(lon, lat):
    return round((lon - O_LON) * LON_M, 2), round(-(lat - O_LAT) * LAT_M, 2)


def twd97_to_wgs84(x, y):
    """TM2 (EPSG:3826) 反算：GRS80、中央經線 121°、k0 0.9999、東偏 250000 m。"""
    a, f = 6378137.0, 1 / 298.257222101
    e2 = f * (2 - f)
    k0, lon0, dx = 0.9999, math.radians(121), 250000.0
    x -= dx
    M = y / k0
    mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    fp = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
          + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    ep2 = e2 / (1 - e2)
    C1, T1 = ep2 * math.cos(fp) ** 2, math.tan(fp) ** 2
    N1 = a / math.sqrt(1 - e2 * math.sin(fp) ** 2)
    R1 = a * (1 - e2) / (1 - e2 * math.sin(fp) ** 2) ** 1.5
    D = x / (N1 * k0)
    lat = fp - (N1 * math.tan(fp) / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
                                          + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720)
    lon = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / math.cos(fp)
    return math.degrees(lon), math.degrees(lat)


def nearest_on_rings(px, pz, grid, cell, rings, maxd):
    best, bd = None, maxd
    gx, gz = int(px // cell), int(pz // cell)
    for i in range(gx - 1, gx + 2):
        for j in range(gz - 1, gz + 2):
            for k in grid.get((i, j), ()):
                r = rings[k]
                n = len(r) // 2
                for m in range(n):
                    ax, az, bx, bz = r[2 * m], r[2 * m + 1], r[(2 * m + 2) % len(r)], r[(2 * m + 3) % len(r)]
                    dx, dz = bx - ax, bz - az
                    t = max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz or 1)))
                    qx, qz = ax + t * dx, az + t * dz
                    d = math.hypot(px - qx, pz - qz)
                    if d < bd:
                        bd, best = d, (round(qx, 2), round(qz, 2))
    return best


def main(osm_file, light_file):
    district = json.load(open(os.path.join(ROOT, 'dist', 'assets', 'district-xinyi.json'), encoding='utf-8'))
    w, s, e, n = district['bbox']
    inb = lambda lon, lat: w <= lon <= e and s <= lat <= n
    # 路燈：先用倉庫內既有資料（含 TWD97 與經緯度）驗證換算
    old = json.load(open(os.path.join(ROOT, 'dist', 'assets', 'street-fixtures-xinyi.json'), encoding='utf-8'))
    err = max(math.hypot((twd97_to_wgs84(*l['twd97'])[0] - l['lon']) * LON_M, (twd97_to_wgs84(*l['twd97'])[1] - l['lat']) * LAT_M)
              for l in old['lamps'] if l.get('twd97'))
    assert err < 0.05, f'TWD97 conversion error {err} m'
    lamps = []
    for r in json.load(open(light_file, encoding='utf-8')):
        try:
            lon, lat = twd97_to_wgs84(float(r['TWD97X']), float(r['TWD97Y']))
        except (KeyError, ValueError):
            continue
        if not inb(lon, lat):
            continue
        h = float(r.get('LightHeight') or 0) or 8.0
        lamps.append([*project(lon, lat), max(3.0, min(h, 14.0)), int(r.get('Quantity') or 1)])

    root = ET.parse(osm_file).getroot()
    nodes = {}
    trees, signals_raw, hydrants, stops = [], [], [], []
    for nd in root.iter('node'):
        lon, lat = float(nd.get('lon')), float(nd.get('lat'))
        nodes[nd.get('id')] = (lon, lat)
        tg = {t.get('k'): t.get('v') for t in nd.iter('tag')}
        if not tg or not inb(lon, lat):
            continue
        x, z = project(lon, lat)
        if tg.get('natural') == 'tree':
            trees.append([x, z])
        if tg.get('highway') == 'traffic_signals':
            signals_raw.append((x, z))
        if tg.get('emergency') == 'fire_hydrant':
            kind = tg.get('fire_hydrant:type', 'pillar')
            hydrants.append([x, z, 1 if kind in ('underground', 'pipe') else 0])
        if tg.get('highway') == 'bus_stop':
            stops.append([x, z])
    green = []
    for way in root.iter('way'):
        tg = {t.get('k'): t.get('v') for t in way.iter('tag')}
        pts = [nodes[r.get('ref')] for r in way.iter('nd') if r.get('ref') in nodes]
        if tg.get('natural') == 'tree_row' and len(pts) >= 2:
            for (a, b) in zip(pts, pts[1:]):
                ax, az = project(*a)
                bx, bz = project(*b)
                L = math.hypot(bx - ax, bz - az)
                for k in range(int(L // 7) + 1):
                    t = (k * 7 + 3.5) / L if L > 0 else 0
                    if t <= 1 and inb(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t):
                        trees.append([round(ax + (bx - ax) * t, 2), round(az + (bz - az) * t, 2)])
        if (tg.get('leisure') == 'park' or tg.get('landuse') == 'grass') and len(pts) >= 4 and pts[0] == pts[-1]:
            if any(inb(*p) for p in pts):
                ring = []
                for p in pts[:-1]:
                    ring += project(*p)
                green.append(ring)

    # 號誌與公車站：用車道資料（osm2streets）的人行道邊找桿位與道路方向
    lanes = json.load(open(os.path.join(ROOT, 'dist', 'assets', 'lanes-xinyi.json'), encoding='utf-8'))
    walks = lanes['lanes'].get('Sidewalk', []) + lanes['lanes'].get('Footway', [])
    cell = 40
    grid = {}
    for k, r in enumerate(walks):
        for i in range(0, len(r), 2):
            grid.setdefault((int(r[i] // cell), int(r[i + 1] // cell)), set()).add(k)
    signals = []
    for x, z in signals_raw:
        p = nearest_on_rings(x, z, grid, cell, walks, 22)
        if p:
            signals.append([x, z, *p])
    bus = []
    drive = lanes['lanes'].get('Driving', [])
    dgrid = {}
    for k, r in enumerate(drive):
        for i in range(0, len(r), 2):
            dgrid.setdefault((int(r[i] // cell), int(r[i + 1] // cell)), set()).add(k)
    for x, z in stops:
        p = nearest_on_rings(x, z, grid, cell, walks, 12) or (x, z)
        q = nearest_on_rings(p[0], p[1], dgrid, cell, drive, 25)
        ang = round(math.atan2(q[0] - p[0], q[1] - p[1]), 3) if q else 0.0
        bus.append([*p, ang])

    out = {'place': 'xinyi', 'bbox': district['bbox'], 'units': 'm; x east, z south (xinyi-street-world.js project())',
           'source': {'lamps': 'data.taipei 臺北市路燈 TaipeiLight.json（TWD97 → WGS84）',
                      'osm': 'OpenStreetMap（ODbL 1.0 © OpenStreetMap contributors）'},
           'note': '桿位、朝向依 OSM 與車道資料推定，非實測；消防栓實際以消防局水源資料為準',
           'lamps': lamps, 'trees': trees, 'signals': signals, 'hydrants': hydrants, 'busStops': bus, 'green': green}
    dest = os.path.join(ROOT, 'dist', 'assets', 'street-furniture-xinyi.json')
    json.dump(out, open(dest, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('twd97 max error m', round(err, 4), {k: len(v) for k, v in out.items() if isinstance(v, list)}, 'bytes', os.path.getsize(dest))


main(sys.argv[1], sys.argv[2])
