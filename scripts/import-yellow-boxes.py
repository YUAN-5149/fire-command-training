"""Import manually reviewed 2025 yellow boxes. No source images are published.
Usage: python scripts/import-yellow-boxes.py AUDIT_DIRECTORY [GIS_LIBRARY_DIRECTORY]
"""
import sys,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; SRC=Path(sys.argv[1])
if len(sys.argv)>2:sys.path.insert(0,sys.argv[2])
from pyproj import Transformer
from shapely.geometry import Polygon,shape,box
review=json.loads((ROOT/'docs/sources/yellow-box-manual-review-20261023.json').read_text(encoding='utf-8'))
src=json.loads((SRC/'yellow-box-candidates.json').read_text(encoding='utf-8'))
filtered=json.loads((SRC/'yellow-box-review-candidates.json').read_text(encoding='utf-8'))
admin=shape(json.loads((ROOT/'dist/assets/xinyi-road-network.json').read_text(encoding='utf-8'))['boundary'])
tiles={t['file']:t for t in src['tiles']}; cs={c['id']:c for c in src['candidates']}; fc={c['id']:c for c in filtered['candidates']}
back=Transformer.from_crs(3857,4326,always_xy=True); forward=Transformer.from_crs(4326,3857,always_xy=True)
accepted={}; dispositions={}; reviewed=set()
for region in ['west','parent','central','east']:
 r=json.loads((ROOT/('docs/sources/yellow-box-review-'+region+'.json')).read_text(encoding='utf-8'))
 groups=[([p['id'] for p in r['accepted']],'accepted'),([p['id'] for p in r['pending']],'pending'),(r['rejectedIds'],'rejected'),(r['existingIds'],'existing')]
 ids=[i for group,status in groups for i in group]
 if len(ids)!=len(set(ids)) or set(ids)!=set(r['reviewedIds']):raise ValueError('Incomplete/overlapping regional dispositions: '+region)
 if reviewed.intersection(ids):raise ValueError('Region overlap')
 reviewed.update(ids)
 for group,status in groups:
  for i in group:dispositions[i]={'candidate':i,'status':status,'region':region}
 for a in r['accepted']:accepted[a['id']]=a
 for a in r['pending']:dispositions[a['id']]['reason']=a['reason']
if reviewed!=set(cs):raise ValueError('Not every raw candidate was reviewed')
# Previously independently reviewed source polygons retain their original trace.
for sid,points in review['polygons'].items():
 i=int(sid);t=review['transforms'][sid]
 accepted[i]={'id':i,'sourceTile':t['tile'],'pixels':[[t['left']+x/t['scaleX'],t['top']+y/t['scaleY']] for x,y in points],'displayAngles':review.get('displayAngles',{}).get(sid,fc.get(i,{}).get('gridAnglesPx',[45,135])),'note':'Initial manually reviewed trace.'}
 dispositions[i]['status']='accepted'
for i,d in dispositions.items():
 d.update(sourceTile=cs[i]['tile'],sourceCandidateCenter=cs[i]['center'],sourceCandidateBoundsPx=cs[i]['bboxPx'])
 if d['status']=='existing' and i not in accepted:raise ValueError('Missing original trace: '+str(i))
features=[]; geometries=[]; duplicates=[]; outside=[]
# Stable source IDs first, so duplicate review fragments do not replace an established trace.
order=sorted(accepted,key=lambda i:(str(i) not in review['polygons'],i))
for i in order:
 a=accepted[i];tile=tiles[a['sourceTile']];x0,y0,x1,y1=tile['bbox3857'];pixel=a['pixels']
 if len(pixel)<3 or any(not all(__import__('math').isfinite(v) for v in point) for point in pixel):raise ValueError('Invalid source pixels: '+str(i))
 world=[(x0+x*.25,y1-y*.25) for x,y in pixel];p=Polygon(world)
 if not p.is_valid or p.area<=0 or abs(p.area-p.convex_hull.area)>1e-5:raise ValueError('Invalid/nonconvex trace: '+str(i))
 source_tiles=[t for t in src['tiles'] if box(*t['bbox3857']).intersects(p)]
 from shapely.ops import unary_union
 if not unary_union([box(*t['bbox3857']) for t in source_tiles]).buffer(.001).covers(p):raise ValueError('Trace outside cached imagery: '+str(i))
 poly=[[round(v,8) for v in back.transform(x,y)] for x,y in world];geo=Polygon(poly)
 if not admin.intersects(geo):
  outside.append(i);dispositions[i].update(status='outside-district');continue
 duplicate=None
 for f,q in zip(features,geometries):
  intersection=p.intersection(q).area
  if intersection/min(p.area,q.area)>.65 or intersection/p.union(q).area>.45:duplicate=f['id'];break
 if duplicate:
  duplicates.append({'candidate':i,'sameFootprintAs':duplicate});dispositions[i].update(status='duplicate',sameFootprintAs=duplicate);continue
 f={'id':'ortho2025-'+str(i),'polygon':poly,'center':[geo.centroid.x,geo.centroid.y],'review':'image-reviewed','currentStatus':'pending-current-site-check','boundaryStatus':'image-digitized-not-surveyed','lineWidth':None,'spacing':None,'displayAngles':a.get('displayAngles',[45,135]),'sourceTile':a['sourceTile'],'sourcePixels':pixel,'sourceSha256':tile['sha256'],'sourceTiles':[{'file':t['file'],'sha256':t['sha256']} for t in source_tiles],'sourceNote':a.get('note','')}
 features.append(f);geometries.append(p);dispositions[i].update(status='imported',featureId=f['id'])
pending=[d for d in dispositions.values() if d['status']=='pending']
counts={'rawCandidates':len(cs),'visualReviewed':len(reviewed),'acceptedTraces':len(accepted),'imported':len(features),'deferredBoundary':len(pending),'duplicateTraces':len(duplicates),'outsideDistrict':len(outside),'rejected':sum(d['status']=='rejected' for d in dispositions.values())}
if sum(counts[k] for k in ['imported','deferredBoundary','duplicateTraces','outsideDistrict','rejected'])!=len(cs):raise ValueError('Audit totals inconsistent')
report={'imageryYear':2025,'districtCode':'63002','source':src['service'],'attribution':'臺北市政府都市發展局・2025正射影像判讀','accessInfo':'https://www.historygis.udd.gov.taipei/urban/?id=B5775BBE','reviewDate':'2026-10-23','coverage':{'tilesExpected':len(src['tiles']),'tilesDownloaded':len(src['tiles']),'tilesScanned':len(src['tiles']),'tileSize3857':512,'pixelSize3857':.25,'searchMask':'OSM ground-road corridors, half-width max(10m, estimated road half-width + 6m)','limitations':'All detected candidates visually reviewed; screening can miss faded paint, shadow, vegetation, unmapped roads and connected markings. Not an exhaustive current-site inventory.'},'counts':counts,'tiles':src['tiles'],'osmBoxAudit':{'sourceObjects':297169,'explicitBoxCandidates':0},'status':{'placement':'image-derived','boundaries':'manual approximate interpretation, not surveyed','pattern':'display reconstruction; spacing and line width unmeasured','currentSite':'pending','completeness':'all 1648 detected candidates reviewed; undetected/obscured/current-site markings remain unverified'},'features':features,'pending':pending,'duplicates':duplicates,'outsideDistrict':outside}
(ROOT/'dist/assets/xinyi-yellow-boxes.json').write_text(json.dumps(report,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(ROOT/'docs/sources/yellow-box-audit-20261023.json').write_text(json.dumps({'counts':counts,'dispositions':sorted(dispositions.values(),key=lambda d:d['candidate'])},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(counts))
