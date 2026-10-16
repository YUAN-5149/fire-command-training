"""Extend the 信義 district and street data south to take in the Taipei EOC,
without disturbing anything already curated.

The official LOD1 service has re-issued some object ids since the original
snapshot, and the first-batch list, fixtures and tests refer to the old ids,
so a full regeneration would break them.  Instead:
  buildings: keep every existing one verbatim; add new-snapshot buildings
             whose centre lies south of the old edge and that do not
             duplicate an existing building (centre within 4 m)
  streets:   keep every existing feature verbatim, except features that
             touched the old south edge (clipped there), which take the
             new, longer geometry; add features that are entirely new

  python scripts/extend-xinyi-south.py OLD_DISTRICT NEW_DISTRICT OLD_STREETS NEW_STREETS
Writes dist/assets/district-xinyi.json and dist/assets/streets-xinyi.json.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD_SOUTH = 25.0293
NEW_BOX = [121.5604, 25.0275, 121.5704, 25.0383]


def load(p):
    return json.loads(Path(p).read_text(encoding='utf-8'))


def centre(b):
    pts = [w['a'] for w in b['walls']] + [w['b'] for w in b['walls']]
    if not pts:
        pts = [v for r in b.get('roofs', []) for v in (r if isinstance(r[0], list) else [])]
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def metres(a, b):
    c = math.cos(math.radians(a[1]))
    return math.hypot((a[0] - b[0]) * 111320 * c, (a[1] - b[1]) * 110574)


def main():
    od, nd, os_, ns = (load(p) for p in sys.argv[1:5])
    keep = od['buildings']
    centres = [centre(b) for b in keep if b['walls']]
    ids = {b['id'] for b in keep}
    added = 0
    for b in nd['buildings']:
        if b['id'] in ids or not b['walls']:
            continue
        c = centre(b)
        if c[1] >= OLD_SOUTH:
            continue
        if any(metres(c, k) < 4.0 for k in centres if abs(k[1] - c[1]) < 0.0002):
            continue
        keep.append(b)
        added += 1
    od['bbox'] = NEW_BOX
    (ROOT / 'dist/assets/district-xinyi.json').write_text(
        json.dumps(od, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('buildings', len(keep), 'added', added)

    new_by_id = {f['id']: f for f in ns['features']}
    old_ids = {f['id'] for f in os_['features']}
    out, swapped = [], 0
    for f in os_['features']:
        touches = any(abs(p[1] - OLD_SOUTH) < 2e-6 for path in f['paths'] for p in path)
        if touches and f['id'] in new_by_id:
            out.append(new_by_id[f['id']])
            swapped += 1
        else:
            out.append(f)
    fresh = [f for f in ns['features'] if f['id'] not in old_ids]
    out += fresh
    os_['features'] = out
    os_['bbox'] = NEW_BOX
    os_['source'] = ns['source']
    os_['retrievedAt'] = ns['retrievedAt']
    (ROOT / 'dist/assets/streets-xinyi.json').write_text(
        json.dumps(os_, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('streets', len(out), 'extended', swapped, 'new', len(fresh))


if __name__ == '__main__':
    main()
