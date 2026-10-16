"""Download the official LOD1 (2024) leaf nodes covering a place's bbox.

Writes, into OUT_DIR, what build-district-facades.py reads:
  <place>-leaves.json            list of leaf node ids (strings)
  <id>.json                      3dNodeIndexDocument (has mbs)
  <id>_geometries_0.bin          legacy geometry buffer
Traversal uses node pages and only descends into nodes whose oriented
bounding box overlaps the bbox, so the whole city is never downloaded.

  python scripts/fetch-lod1.py OUT_DIR xinyi
"""
import gzip
import json
import math
import sys
import time
import subprocess
from pathlib import Path

SRC = 'https://www.historygis.udd.gov.taipei/arcgis/rest/services/Hosted/LOD1_2024/SceneServer/layers/0'
BOXES = {'ximen': [121.5025, 25.0375, 121.5125, 25.0465],
         'xinyi': [121.5604, 25.0275, 121.5704, 25.0383]}


def get(url, binary=False, tries=4):
    # curl, not urllib: Python 3.13+ rejects this server's certificate chain
    # (no Subject Key Identifier) while curl still verifies it normally.
    for k in range(tries):
        r = subprocess.run(['curl', '-sf', '--max-time', '60', url], capture_output=True)
        if r.returncode == 0:
            data = r.stdout
            if data[:2] == b'':           # geometry comes gzipped
                data = gzip.decompress(data)
            return data if binary else json.loads(data)
        if k == tries - 1:
            raise RuntimeError(f'curl {r.returncode}: {url}')
        time.sleep(2 * (k + 1))


def overlaps(obb, box):
    lon, lat = obb['center'][0], obb['center'][1]
    r = math.hypot(obb['halfSize'][0], obb['halfSize'][1])     # metres, generous
    dlon = r / (111320 * math.cos(math.radians(lat)))
    dlat = r / 110574
    return not (lon + dlon < box[0] or lon - dlon > box[2] or
                lat + dlat < box[1] or lat - dlat > box[3])


def main():
    out, place = Path(sys.argv[1]), sys.argv[2]
    box = BOXES[place]
    out.mkdir(parents=True, exist_ok=True)
    per_page = get(SRC + '?f=json')['nodePages']['nodesPerPage']
    pages = {}

    def node(i):
        p = i // per_page
        if p not in pages:
            pages[p] = get(f'{SRC}/nodepages/{p}?f=json')['nodes']
        return pages[p][i % per_page]

    leaves, stack = [], [0]
    while stack:
        i = stack.pop()
        n = node(i)
        if not overlaps(n['obb'], box):
            continue
        kids = n.get('children') or []
        if kids:
            stack.extend(kids)
        elif n.get('mesh'):
            leaves.append(i)
    print(place, 'leaves', len(leaves), 'pages', len(pages))
    done = 0
    for i in leaves:
        doc, geo = out / f'{i}.json', out / f'{i}_geometries_0.bin'
        if not doc.exists():
            doc.write_text(json.dumps(get(f'{SRC}/nodes/{i}?f=json')))
        if not geo.exists():
            geo.write_bytes(get(f'{SRC}/nodes/{i}/geometries/0', binary=True))
        done += 1
        if done % 25 == 0:
            print(' ', done, '/', len(leaves))
    (out / f'{place}-leaves.json').write_text(json.dumps([str(i) for i in leaves]))
    print('done')


if __name__ == '__main__':
    main()
