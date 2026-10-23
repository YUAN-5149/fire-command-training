import sys,json,math,time,urllib.request,concurrent.futures,hashlib
from pathlib import Path
sys.path.insert(0,sys.argv[2] if len(sys.argv)>2 else str(Path(sys.argv[1])/'road-data-libs'))
import numpy as np,cv2
from pyproj import Transformer
from shapely.geometry import shape,box,Point
from shapely.ops import transform
ROOT=Path(sys.argv[1]);CACHE=ROOT/'yellow-box-ortho-2025';CACHE.mkdir(exist_ok=True)
net=json.loads((Path(__file__).resolve().parents[1]/'dist/assets/xinyi-road-network.json').read_text(encoding='utf-8'))
tr=Transformer.from_crs(4326,3857,always_xy=True); back=Transformer.from_crs(3857,4326,always_xy=True)
admin=transform(tr.transform,shape(net['boundary'])); x0,y0,x1,y1=admin.bounds
size=512;res=.25;pixels=2048
jobs=[]
for x in range(math.floor(x0/size)*size,math.ceil(x1/size)*size,size):
 for y in range(math.floor(y0/size)*size,math.ceil(y1/size)*size,size):
  if box(x,y,x+size,y+size).intersects(admin):jobs.append((x,y))
def download(job):
 x,y=job; f=CACHE/(str(x)+'_'+str(y)+'.jpg')
 if not f.exists():
  url='https://www.historygis.udd.gov.taipei/arcgis/rest/services/Aerial/Ortho_2025/MapServer/export?bbox='+','.join(map(str,[x,y,x+size,y+size]))+'&bboxSR=3857&imageSR=3857&size=2048,2048&format=jpg&layers=show:0&f=image'
  for retry in range(3):
   try:
    with urllib.request.urlopen(url,timeout=90) as r: raw=r.read()
    img=cv2.imdecode(np.frombuffer(raw,np.uint8),1)
    if img is None or img.shape[:2]!=(2048,2048):raise ValueError('Invalid image response')
    f.write_bytes(raw);break
   except Exception:
    if retry==2:raise
    time.sleep(2)
 return job
print('Tiles covering official Xinyi boundary:',len(jobs),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 for i,j in enumerate(pool.map(download,jobs)):print('Downloaded',i+1,'/',len(jobs),j,flush=True)
# Ground road search mask; raw source positions retained. Mask is deliberately wider than estimated road widths.
roads=[]
for f in net['features']:
 if f['kind']!='road':continue
 for path in f['paths']:roads.append((np.array([tr.transform(*p) for p in path]),max(10,f['width']/2+6)))
candidates=[]; manifest=[]
for ti,(x,y) in enumerate(jobs):
 file=CACHE/(str(x)+'_'+str(y)+'.jpg'); im=cv2.imdecode(np.frombuffer(file.read_bytes(),np.uint8),1); b,g,r=cv2.split(im); bf=b.astype(np.float32);gf=g.astype(np.float32);rf=r.astype(np.float32)
 yellow=((rf>65)&(gf>55)&(rf>bf*1.23)&(gf>bf*1.18)&(rf>gf*.94)&(rf-gf<75)&(gf-bf>13)).astype(np.uint8)*255
 roadmask=np.zeros(yellow.shape,np.uint8)
 for pts,w in roads:
  if pts[:,0].max()<x-w or pts[:,0].min()>x+size+w or pts[:,1].max()<y-w or pts[:,1].min()>y+size+w:continue
  local=np.round(np.column_stack(((pts[:,0]-x)/res,(y+size-pts[:,1])/res))).astype(np.int32)
  cv2.polylines(roadmask,[local],False,255,max(1,round(w*2/res)))
 yellow=cv2.bitwise_and(yellow,roadmask)
 conn=cv2.morphologyEx(yellow,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8)); conn=cv2.dilate(conn,np.ones((3,3),np.uint8))
 n,labels,stats,centers=cv2.connectedComponentsWithStats(conn,8)
 for k in range(1,n):
  px,py,w,h,area=stats[k];
  if area<65 or min(w,h)<9 or max(w,h)>440:continue
  mask=(labels[py:py+h,px:px+w]==k)&(yellow[py:py+h,px:px+w]>0)
  yy,xx=np.where(mask)
  if len(xx)<30:continue
  points=np.column_stack((xx+px,yy+py)).astype(np.float32); rect=cv2.minAreaRect(points);rw,rh=rect[1]
  if min(rw,rh)<7 or max(rw,rh)/max(min(rw,rh),1)>5 or rw*rh*res*res<4 or rw*rh*res*res>1200:continue
  density=len(points)/(rw*rh or 1)
  if not .035<density<.8:continue
  center=rect[0];world=[x+center[0]*res,y+size-center[1]*res]
  if not admin.covers(Point(*world)):continue
  crop=yellow[py:py+h,px:px+w]
  ls=cv2.HoughLinesP(crop,1,np.pi/180,threshold=max(8,int(min(w,h)*.23)),minLineLength=max(7,int(min(w,h)*.25)),maxLineGap=4)
  angles=[]
  if ls is not None:
   for l in ls.reshape(-1,4):
    dx,dy=l[2]-l[0],l[3]-l[1];angles.append(math.degrees(math.atan2(dy,dx))%180)
  # Two crossing diagonal families in addition to possible perimeter edges.
  cross=sum(1 for a in angles for b in angles if 60<abs((a-b+90)%180-90)<=90)
  if len(angles)<5 or cross<4:continue
  hull=cv2.convexHull(points); poly=cv2.approxPolyDP(hull,max(1.2,min(rw,rh)*.035),True).reshape(-1,2)
  if len(poly)<4:continue
  coords=[back.transform(x+float(p[0])*res,y+size-float(p[1])*res) for p in poly]
  candidates.append({'id':len(candidates)+1,'tile':file.name,'bboxPx':[int(px),int(py),int(w),int(h)],'polygon':coords,'center':back.transform(*world),'areaImageM2':round(rw*rh*res*res,2),'lineCount':len(angles),'density':round(density,3)})
 manifest.append({'file':file.name,'bbox3857':[x,y,x+size,y+size],'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
 print('Scanned',ti+1,'/',len(jobs),'candidates',len(candidates),flush=True)
(ROOT/'yellow-box-candidates.json').write_text(json.dumps({'service':'https://www.historygis.udd.gov.taipei/arcgis/rest/services/Aerial/Ortho_2025/MapServer','resolution3857':res,'tiles':manifest,'candidates':candidates},ensure_ascii=False),encoding='utf-8')
# Contact sheets for explicit visual review; no source images added to the public site.
from PIL import Image,ImageDraw
for page in range(math.ceil(len(candidates)/48)):
 sheet=Image.new('RGB',(1536,1344),'#222222');draw=ImageDraw.Draw(sheet)
 for j,c in enumerate(candidates[page*48:(page+1)*48]):
  px,py,w,h=c['bboxPx'];im=Image.open(CACHE/c['tile']);pad=12; crop=im.crop((max(0,px-pad),max(0,py-pad),min(2048,px+w+pad),min(2048,py+h+pad)));scale=min(184/crop.width,138/crop.height);crop=crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.NEAREST);cx=(j%8)*192;cy=(j//8)*224
  sheet.paste(crop,(cx,cy+18));draw.text((cx+3,cy+1),str(c['id'])+' / '+str(c['lineCount'])+' lines',fill='white');draw.text((cx+3,cy+163),'%.6f %.6f'%tuple(c['center']),fill='white')
 sheet.save(CACHE/('review-'+str(page+1)+'.jpg'),quality=94)
print('Review candidates',len(candidates),flush=True)
