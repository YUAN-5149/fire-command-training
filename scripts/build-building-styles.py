# -*- coding: utf-8 -*-
"""
信義區逐棟建物外觀屬性：把 OSM 的 building、building:levels、building:colour 與店家 POI
對到官方 LOD1 量體（dist/assets/district-xinyi.json），寫出 dist/assets/building-styles-xinyi.json。

  python scripts/build-building-styles.py <xinyi-osm.xml>

每棟一筆 [style, levels, shop, colour]：
  style  0 老公寓（≤6F，鐵窗）  1 住宅大樓（7–15F，陽台）  2 高層住宅（>15F）
         3 辦公／商業（玻璃帷幕）  4 學校／公共（帶狀窗）  5 寺廟  6 雨遮／棚架（無窗）
  levels 地上樓層數；shop 1＝一樓店面（有騎樓招牌）；colour 立面主色 #rrggbb
OSM 沒有的量體依高度與占地推定。只是外觀分類，非實際用途或樓層，不可據此判斷救災開口。
"""
import json
import math
import os
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LON_M = 111320 * math.cos(math.radians(25.0338))
LAT_M = 110574

OSM_STYLE = {'apartments': None, 'residential': None, 'house': 0, 'detached': 0, 'terrace': 0,
             'commercial': 3, 'retail': 3, 'office': 3, 'hotel': 3, 'school': 4, 'university': 4,
             'public': 4, 'government': 4, 'civic': 4, 'hospital': 4, 'transportation': 4, 'train_station': 4,
             'temple': 5, 'shrine': 5, 'church': 5, 'roof': 6, 'carport': 6, 'service': 6}
# 臺灣常見外牆：米白／淺灰磁磚、二丁掛磚紅、淺綠／淺藍馬賽克、石材灰
PALETTE = {0: ['#d8cfbf', '#c9b9a0', '#b9a58c', '#a3613f', '#cfd3c6', '#bcc7c4', '#e1dbcf'],
           1: ['#d9d3c7', '#c7c0b2', '#b8ab98', '#9c5e45', '#d6d8d2', '#c3c9c5'],
           2: ['#d5d1c8', '#bdbbb5', '#a9a7a2', '#cdc5b6'],
           3: ['#8fa3ad', '#7d8f99', '#a2b1b6', '#6f8590'],
           4: ['#e3dccb', '#d9cfb8', '#cfc6b0'],
           5: ['#a8342a', '#b0402c'],
           6: ['#9a9d98', '#7f8a86']}
SHOP_KEYS = ('shop', 'amenity', 'office', 'craft', 'leisure')
SHOP_AMENITY = {'restaurant', 'cafe', 'bank', 'fast_food', 'clinic', 'pharmacy', 'bar', 'dentist', 'pub',
                'ice_cream', 'atm', 'post_office', 'doctors', 'veterinary', 'food_court'}


def local(lon, lat):
    return (lon - 121.5654) * LON_M, (lat - 25.0338) * LAT_M


def inside(x, y, edges):
    hit = False
    for (x1, y1), (x2, y2) in edges:
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def seg_dist(px, py, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy or 1)))
    return math.hypot(px - a[0] - t * dx, py - a[1] - t * dy)


def main(osm_file):
    root = ET.parse(osm_file).getroot()
    nodes, pois = {}, []
    for n in root.iter('node'):
        x, y = local(float(n.get('lon')), float(n.get('lat')))
        nodes[n.get('id')] = (x, y)
        tg = {t.get('k'): t.get('v') for t in n.iter('tag')}
        if any(k in tg for k in ('shop', 'office', 'craft')) or tg.get('amenity') in SHOP_AMENITY:
            pois.append((x, y))
    osm = []
    for w in root.iter('way'):
        tg = {t.get('k'): t.get('v') for t in w.iter('tag')}
        if 'building' not in tg:
            continue
        pts = [nodes[nd.get('ref')] for nd in w.iter('nd') if nd.get('ref') in nodes]
        if len(pts) < 4:
            continue
        lv = tg.get('building:levels', '')
        osm.append({'edges': list(zip(pts, pts[1:])), 'pts': pts, 'type': tg['building'],
                    'levels': int(float(lv)) if lv.replace('.', '', 1).isdigit() else None,
                    'colour': tg.get('building:colour'), 'shop': any(k in tg for k in SHOP_KEYS)})
    district = json.load(open(os.path.join(ROOT, 'dist', 'assets', 'district-xinyi.json'), encoding='utf-8'))
    cell = 60
    grid = {}
    for i, (x, y) in enumerate(pois):
        grid.setdefault((int(x // cell), int(y // cell)), []).append(i)
    out, matched, shops = {}, 0, 0
    for b in district['buildings']:
        edges = [(local(*w['a'][:2]), local(*w['b'][:2])) for w in b['walls']]
        if not edges:
            continue
        xs = [p[0] for e in edges for p in e]
        ys = [p[1] for e in edges for p in e]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        area = sum(w['w'] for w in b['walls']) ** 2 / 16          # 周長推估的近似面積
        h = max(w['h'] for w in b['walls'])
        m = None
        for o in osm:
            ox = [p[0] for p in o['pts']]
            oy = [p[1] for p in o['pts']]
            if not (min(ox) - 5 <= cx <= max(ox) + 5 and min(oy) - 5 <= cy <= max(oy) + 5):
                continue
            ocx, ocy = sum(ox) / len(ox), sum(oy) / len(oy)
            if inside(cx, cy, o['edges']) or inside(ocx, ocy, edges):
                m = o
                break
        style = OSM_STYLE.get(m['type']) if m else None
        levels = m['levels'] if m and m['levels'] else None
        if style is None:
            if h < 3.5 or (m and m['type'] == 'roof'):
                style = 6
            elif h <= 21:
                style = 0
            elif h <= 48:
                style = 1 if area < 2500 else 3
            else:
                style = 2 if area < 1800 else 3
        if style == 0 and h > 24:
            style = 1
        if not levels:
            levels = max(1, round(h / (3.0 if style == 0 else 3.4 if style in (1, 2) else 4.0)))
        near = 0
        gx, gy = int(cx // cell), int(cy // cell)
        for i in range(gx - 1, gx + 2):
            for j in range(gy - 1, gy + 2):
                for k in grid.get((i, j), []):
                    px, py = pois[k]
                    if inside(px, py, edges) or min(seg_dist(px, py, *e) for e in edges) < 7:
                        near += 1
        shop = int(style in (0, 1, 2, 3) and (near > 0 or (m is not None and m['shop'] and style != 3)))
        colour = (m and m['colour'] if m and m['colour'] and m['colour'].startswith('#') and len(m['colour']) == 7
                  else PALETTE[style][b['id'] % len(PALETTE[style])])
        out[str(b['id'])] = [style, levels, shop, colour]
        matched += m is not None
        shops += shop
    dest = os.path.join(ROOT, 'dist', 'assets', 'building-styles-xinyi.json')
    json.dump({'place': 'xinyi', 'source': 'OpenStreetMap (ODbL 1.0 © OpenStreetMap contributors) + 臺北市 LOD1 2024',
               'styles': ['老公寓', '住宅大樓', '高層住宅', '辦公商業', '學校公共', '寺廟', '雨遮棚架'],
               'note': '外觀分類，非實際用途或樓層', 'buildings': out},
              open(dest, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    counts = [sum(1 for v in out.values() if v[0] == s) for s in range(7)]
    print('buildings', len(out), 'osm-matched', matched, 'shops', shops, 'styles', counts, 'bytes', os.path.getsize(dest))


main(sys.argv[1])
