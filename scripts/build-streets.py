"""Extract complete OSM ways; bounding box API puts nodes/ways before relations."""
import xml.etree.ElementTree as ET
import json,sys,re,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BOXES={'ximen':[121.5025,25.0375,121.5125,25.0465],'xinyi':[121.5604,25.0293,121.5704,25.0383]}
DEFAULT={'primary':12,'secondary':10,'tertiary':8,'residential':6,'unclassified':6,'service':4,'living_street':5,'pedestrian':5,'footway':1.8,'path':1.5,'cycleway':2}
def clip(a,b,box):
 x,y=a;dx,dy=b[0]-x,b[1]-y;lo,hi=0,1
 for p,q in [(-dx,x-box[0]),(dx,box[2]-x),(-dy,y-box[1]),(dy,box[3]-y)]:
  if p==0:
   if q<0:return
  elif p<0:lo=max(lo,q/p)
  else:hi=min(hi,q/p)
 if lo>hi:return
 return [[round(x+lo*dx,7),round(y+lo*dy,7)],[round(x+hi*dx,7),round(y+hi*dy,7)]]
for place,box in BOXES.items():
 nodes={};ways=[];relations=False
 try:
  for event,e in ET.iterparse(Path(sys.argv[1])/f'{place}-osm.xml',events=['start','end']):
   if event=='start':
    if e.tag=='relation':relations=True
    continue
   if e.tag=='node':nodes[e.attrib['id']]=[float(e.attrib['lon']),float(e.attrib['lat'])];e.clear()
   elif e.tag=='way':
    tags={t.attrib['k']:t.attrib['v'] for t in e.findall('tag')};refs=[n.attrib['ref'] for n in e.findall('nd')]
    if tags.get('highway') in DEFAULT and tags.get('tunnel','no')=='no' and tags.get('bridge','no')=='no' and tags.get('indoor','no')=='no' and tags.get('layer','0')=='0' and tags.get('level','0')=='0' and tags.get('area')!='yes':ways.append((int(e.attrib['id']),tags,refs))
    e.clear()
 except ET.ParseError:
  if not relations:raise # Only relation-tail truncation is permissible: no relation geometry is used.
 features=[]
 for id,t,refs in ways:
  points=[nodes[r] for r in refs if r in nodes]
  if len(points)!=len(refs):raise ValueError('Incomplete way nodes')
  paths=[]
  for a,b in zip(points,points[1:]):
   seg=clip(a,b,box)
   if not seg or seg[0]==seg[1]:continue
   if paths and paths[-1][-1]==seg[0]:paths[-1].append(seg[1])
   else:paths.append(seg)
  if not paths:continue
  match=re.fullmatch(r'(\d+(?:\.\d+)?)\s*(?:m)?',t.get('width',''))
  width=float(match[1]) if match else DEFAULT[t['highway']]
  if not match and re.fullmatch('[1-6]',t.get('lanes','')):width=float(t['lanes'])*3.1
  if width<=0 or width>45:continue
  kind='sidewalk' if t.get('footway')=='sidewalk' else 'crossing' if t.get('footway')=='crossing' else 'walk' if t['highway'] in ['footway','pedestrian','path'] else 'cycle' if t['highway']=='cycleway' else 'road'
  features.append({'id':id,'paths':paths,'width':width,'widthSource':'tag' if match else 'estimate','kind':kind,'tags':{k:v for k,v in t.items() if k in ['name','highway','surface','oneway','lanes','width','footway','crossing','crossing:markings']}})
 out={'place':place,'bbox':box,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':'https://api.openstreetmap.org/api/0.6/map?bbox='+','.join(map(str,box)),'license':'ODbL 1.0 © OpenStreetMap contributors','features':features}
 dest=ROOT/'dist/assets'/f'streets-{place}.json';dest.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')))
 print(place,len(features),'ways;',sum(f['widthSource']=='tag' for f in features),'tagged widths;',sum(f['kind']=='sidewalk' for f in features),'mapped sidewalks')
