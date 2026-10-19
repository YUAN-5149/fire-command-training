"""Extend the 信義 district and street data to a larger bbox without
disturbing anything already curated.

The official LOD1 service has re-issued some object ids since the original
snapshot, and the first-batch list, fixtures and tests refer to the old ids,
so a full regeneration would break them.  Instead:
  buildings: keep every existing one verbatim; add new-snapshot buildings
             whose centre lies outside the old bbox and that do not
             duplicate an existing building (centre within 4 m)
  streets:   keep every existing feature verbatim, except features that
             touch an old bbox edge that has moved (they were clipped
             there), which take the new, longer geometry; add features
             that are entirely new

  python scripts/extend-xinyi.py OLD_DISTRICT NEW_DISTRICT OLD_STREETS NEW_STREETS [LON,LAT,RADIUS]
The new bbox is taken from the new files.  The optional LON,LAT,RADIUS (m)
limits added buildings to a circle, to stay inside the geometry budget
checked by tests/geo-xinyi-detail.mjs (4 M vertices for the whole district);
streets and the height-field bbox still cover the full new bbox.  Writes dist/assets/district-xinyi.json
and dist/assets/streets-xinyi.json.

History: 2026-10 south to 25.0275 (臺北市災害應變中心), then north to 25.0425
(臺北市政府消防局, 松仁路1號), adding buildings only within 160 m of the HQ:
  python scripts/extend-xinyi.py old new old-streets new-streets 121.56915,25.0407,160
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(p):
    return json.loads(Path(p).read_text(encoding='utf-8'))


def centre(b):
    pts = [w['a'] for w in b['walls']] + [w['b'] for w in b['walls']]
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def metres(a, b):
    c = math.cos(math.radians(a[1]))
    return math.hypot((a[0] - b[0]) * 111320 * c, (a[1] - b[1]) * 110574)


def inside(c, box):
    return box[0] <= c[0] <= box[2] and box[1] <= c[1] <= box[3]


def main():
    od, nd, os_, ns = (load(p) for p in sys.argv[1:5])
    near = [float(v) for v in sys.argv[5].split(',')] if len(sys.argv) > 5 else None
    old_box, new_box = od['bbox'], nd['bbox']
    keep = od['buildings']
    centres = [centre(b) for b in keep if b['walls']]
    ids = {b['id'] for b in keep}
    added = 0
    for b in nd['buildings']:
        if b['id'] in ids or not b['walls']:
            continue
        c = centre(b)
        if inside(c, old_box):
            continue
        if near and metres(c, near[:2]) > near[2]:
            continue
        if any(metres(c, k) < 4.0 for k in centres if abs(k[1] - c[1]) < 0.0002):
            continue
        keep.append(b)
        added += 1
    od['bbox'] = new_box
    (ROOT / 'dist/assets/district-xinyi.json').write_text(
        json.dumps(od, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('buildings', len(keep), 'added', added)

    # old edges that moved: (axis index in a point, value)
    moved = [(i % 2, old_box[i]) for i in range(4) if old_box[i] != new_box[i]]
    new_by_id = {f['id']: f for f in ns['features']}
    old_ids = {f['id'] for f in os_['features']}
    out, swapped = [], 0
    for f in os_['features']:
        touches = any(abs(p[ax] - v) < 2e-6 for ax, v in moved for path in f['paths'] for p in path)
        if touches and f['id'] in new_by_id:
            out.append(new_by_id[f['id']])
            swapped += 1
        else:
            out.append(f)
    fresh = [f for f in ns['features'] if f['id'] not in old_ids]
    out += fresh
    os_['features'] = out
    os_['bbox'] = new_box
    os_['source'] = ns['source']
    os_['retrievedAt'] = ns['retrievedAt']
    (ROOT / 'dist/assets/streets-xinyi.json').write_text(
        json.dumps(os_, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('streets', len(out), 'extended', swapped, 'new', len(fresh))


if __name__ == '__main__':
    main()
