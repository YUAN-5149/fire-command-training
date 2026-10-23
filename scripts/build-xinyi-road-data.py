"""Build whole-Xinyi road extension and official curb paint; no editor/personal fields exported.
Usage: python scripts/build-xinyi-road-data.py INPUT_DIRECTORY [--libs LIB_DIRECTORY]
Requires pyshp, pyproj, shapely. Inputs: Taipei district SHP ZIP, noparkin SHP ZIP,
public noparkin SLD, and xinyi-tile-*-*.xml OSM API tiles. Preserve curated core data.
"""
import argparse,sys,io,zipfile,json,math,hashlib,collections,datetime,xml.etree.ElementTree as ET
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('input',type=Path);p.add_argument('--libs');a=p.parse_args()
if a.libs:sys.path.insert(0,a.libs)
import shapefile
from pyproj import Transformer
from shapely.geometry import shape,LineString,box
from shapely.ops import transform
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'dist/assets'; SRC=a.input
origin=[121.5654,25.0338]; sx=111320*math.cos(math.radians(origin[1]));sy=110574
local=lambda x,y: [round((x-origin[0])*sx,3),round(-(y-origin[1])*sy,3)]
def readzip(fn):
 z=zipfile.ZipFile(SRC/fn)
 return shapefile.Reader(**{e:io.BytesIO(z.read(next(n for n in z.namelist() if n.endswith('.'+e)))) for e in ['shp','shx','dbf']},encoding='utf-8',encodingErrors='replace')
def lines(g):
 if g.is_empty:return []
 if g.geom_type=='LineString':return [list(g.coords)]
 if hasattr(g,'geoms'):return [x for part in g.geoms for x in lines(part)]
 return []
def rounded(paths):return [[[round(x,7),round(y,7)] for x,y in path] for path in paths if len(path)>=2]
def write(name,data):(OUT/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
projector=Transformer.from_crs(3826,4326,always_xy=True).transform
boundary=next(shape(s.shape.__geo_interface__) for s in readzip('taipei-boundary-official.zip').iterShapeRecords() if s.record['CPID']=='63002')
area=transform(projector,boundary)
core=json.loads((OUT/'streets-xinyi.json').read_text(encoding='utf-8')); corebox=box(*core['bbox'])
# Read published SLD classification rather than assuming unknown codes are red.
ns={'s':'http://www.opengis.net/sld','o':'http://www.opengis.net/ogc'}
legend={}
for rule in ET.parse(SRC/'traffic-noparkin-style.xml').findall('.//s:Rule',ns):
 code=rule.find('.//o:Literal',ns);title=rule.find('s:Title',ns)
 if code is not None and title is not None:legend[code.text]=title.text
curbs=[];unmapped=collections.Counter();counts=collections.Counter()
for rec in readzip('red-yellow-official.zip').iterShapeRecords():
 # Fast projected bbox rejection before geometry intersection.
 if not box(*rec.shape.bbox).intersects(boundary):continue
 clipped=shape(rec.shape.__geo_interface__).intersection(boundary)
 if clipped.is_empty:continue
 code=rec.record['patype'];label=legend.get(code,'')
 color='red' if code in ['01','06','11'] and label else 'yellow' if code in ['02','12'] and label else None
 if not color:unmapped[code]+=1;continue
 paths=lines(transform(projector,clipped))
 for j,path in enumerate(paths):
  if len(path)<2:continue
  curbs.append({'id':str(rec.record['keyid'])+':'+str(j),'code':code,'kind':color,'label':label,'path':[local(x,y) for x,y in path]});counts[color]+=1
nodes={};ways={};inputs=[]
for f in sorted(SRC.glob('xinyi-tile-*-*.xml')):
 inputs.append({'file':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
 for event,e in ET.iterparse(f,events=['end']):
  if e.tag=='node':nodes[e.attrib['id']]=(float(e.attrib['lon']),float(e.attrib['lat']));e.clear()
  elif e.tag=='way':
   tags={t.attrib['k']:t.attrib['v'] for t in e.findall('tag')}
   if 'highway' in tags:ways[int(e.attrib['id'])]=(tags,[r.attrib['ref'] for r in e.findall('nd')])
   e.clear()
defaults={'primary':12,'primary_link':6,'secondary':10,'secondary_link':6,'tertiary':8,'tertiary_link':5,'residential':6,'unclassified':6,'service':4,'living_street':5,'pedestrian':5,'footway':1.8,'path':1.5,'cycleway':2}
features=[];outer=[];tagcounts=collections.Counter();missing=[]
import re
for id,(t,refs) in sorted(ways.items()):
 if t['highway'] not in defaults or t.get('bridge','no')!='no' or t.get('tunnel','no')!='no' or t.get('layer','0')!='0' or t.get('indoor','no')!='no' or t.get('area')=='yes':continue
 if any(n not in nodes for n in refs):missing.append(id);continue
 pts=[nodes[n] for n in refs]
 if len(pts)<2:continue
 clipped=LineString(pts).intersection(area)
 paths=rounded(lines(clipped))
 if not paths:continue
 m=re.fullmatch(r'(\d+(?:\.\d+)?)\s*(?:m)?',t.get('width',''))
 width=float(m[1]) if m else float(t['lanes'])*3.1 if re.fullmatch('[1-6]',t.get('lanes','')) else defaults[t['highway']]
 if not 0<width<=45:continue
 kind='sidewalk' if t.get('footway')=='sidewalk' else 'crossing' if t.get('footway')=='crossing' else 'walk' if t['highway'] in ['footway','pedestrian','path'] else 'cycle' if t['highway']=='cycleway' else 'road'
 tags={k:v for k,v in t.items() if k in ['name','highway','surface','oneway','lanes','width','footway','crossing','crossing:markings','divider','overtaking','access'] or k.startswith('lane_markings')}
 for k,v in tags.items():
  if k=='divider' or k.startswith('lane_markings'):tagcounts[k+'='+v]+=1
 feat={'id':id,'paths':paths,'width':width,'widthSource':'tag' if m else 'estimate','kind':kind,'tags':tags}
 features.append(feat)
 op=rounded(lines(clipped.difference(corebox)))
 if op:outer.append({**feat,'paths':op})
if missing:raise ValueError('Missing OSM way nodes: '+str(missing[:10]))
if len(inputs)!=20:raise ValueError('Expected complete 4 x 5 OSM tile set')
source={'curbs':'https://data.taipei/dataset/detail?id=a9c282c5-3a43-41ed-badc-f9c1bdf1cc34','curbSnapshot':'2024-07-12','boundary':'https://data.taipei/dataset/detail?id=1601ef3a-c253-4988-b047-943d9e786143','boundarySnapshot':'2022-09-15','osm':'https://www.openstreetmap.org/copyright','retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'license':['政府資料開放授權條款第1版','ODbL 1.0 © OpenStreetMap contributors'],'sha256':{fn:hashlib.sha256((SRC/fn).read_bytes()).hexdigest() for fn in ['red-yellow-official.zip','taipei-boundary-official.zip','traffic-noparkin-style.xml']},'osmTiles':inputs}
metadata={'place':'xinyi','districtCode':'63002','bbox':list(area.bounds),'origin':origin,'source':source,'status':{'curbs':'official-snapshot-not-current-survey','roadWidths':'tag-or-estimate','terrain':'core-building-base-interpolation-clamped-outside','lanePaint':'inferred-unless-explicit-source','curbWidth':'display-width-not-measured','crossings':'OSM-explicit-zebra-only-stripe-dimensions-estimated'}}
write('xinyi-road-network.json',{**metadata,'boundary':area.__geo_interface__,'coreBbox':core['bbox'],'features':features,'outerFeatures':outer,'stats':{'features':len(features),'outerFeatures':len(outer),'markingTags':dict(tagcounts)}})
write('xinyi-curb-markings.json',{**metadata,'units':'local-metres-x-east-z-south','classification':legend,'features':curbs,'stats':dict(counts),'unclassified':dict(unmapped)})
print(json.dumps({'roadFeatures':len(features),'outerFeatures':len(outer),'curbs':dict(counts),'taggedMarkings':dict(tagcounts),'unclassified':dict(unmapped)},ensure_ascii=False))
