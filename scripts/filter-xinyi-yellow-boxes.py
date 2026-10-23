import sys,json,math
from pathlib import Path
ROOT=Path(sys.argv[1]);sys.path.insert(0,sys.argv[2] if len(sys.argv)>2 else str(ROOT/'road-data-libs'))
import cv2,numpy as np
from PIL import Image,ImageDraw
src=json.loads((ROOT/'yellow-box-candidates.json').read_text(encoding='utf-8'));cache=ROOT/'yellow-box-ortho-2025'; keep=[]; imgs={}
def angular(a,b):return abs((a-b+90)%180-90)
def unique(values):
 out=[]
 for v in sorted(values):
  if not out or v-out[-1]>2.8:out.append(v)
 return out
for c in src['candidates']:
 if c['density']>.38 or c['density']<.04:continue
 px,py,w,h=c['bboxPx']
 if c['tile'] not in imgs:imgs={c['tile']:cv2.imdecode(np.frombuffer((cache/c['tile']).read_bytes(),np.uint8),1)}
 im=imgs[c['tile']][py:py+h,px:px+w];b,g,r=cv2.split(im);bf=b.astype(float);gf=g.astype(float);rf=r.astype(float)
 mask=((rf>65)&(gf>55)&(rf>bf*1.23)&(gf>bf*1.18)&(rf>gf*.94)&(rf-gf<75)&(gf-bf>13)).astype(np.uint8)*255
 ls=cv2.HoughLinesP(mask,1,np.pi/180,threshold=max(7,int(min(w,h)*.2)),minLineLength=max(7,int(min(w,h)*.24)),maxLineGap=3)
 if ls is None:continue
 ys,xs=np.where(mask); rect=cv2.minAreaRect(np.column_stack((xs,ys)).astype(np.float32)); (cx,cy),(rw,rh),angle=rect; ca=math.cos(math.radians(angle));sa=math.sin(math.radians(angle)); ls2=[]
 for x0,y0,x1,y1 in ls.reshape(-1,4):
  mx,my=(x0+x1)/2-cx,(y0+y1)/2-cy;xx=mx*ca+my*sa;yy=-mx*sa+my*ca
  if abs(xx)>rw/2-max(2,rw*.1) or abs(yy)>rh/2-max(2,rh*.1):continue
  ls2.append((math.degrees(math.atan2(y1-y0,x1-x0))%180,(x0+x1)/2,(y0+y1)/2))
 best=0;families=None
 for theta in range(0,90,5):
  offsets=[]
  for a in [theta,theta+90]:
   nx=-math.sin(math.radians(a));ny=math.cos(math.radians(a)); offsets.append(unique([x*nx+y*ny for ang,x,y in ls2 if angular(ang,a)<11]))
  if min(map(len,offsets))>=2 and sum(map(len,offsets))>best:best=sum(map(len,offsets));families=[theta,theta+90]
 if best<5:continue
 c['gridScore']=best;c['gridAnglesPx']=families;keep.append(c)
(ROOT/'yellow-box-review-candidates.json').write_text(json.dumps({**src,'candidates':keep,'rawCandidateCount':len(src['candidates'])},ensure_ascii=False),encoding='utf-8')
for page in range(math.ceil(len(keep)/40)):
 sheet=Image.new('RGB',(1600,1240),'#222222');d=ImageDraw.Draw(sheet)
 for j,c in enumerate(keep[page*40:(page+1)*40]):
  px,py,w,h=c['bboxPx'];im=Image.open(cache/c['tile']);pad=8;crop=im.crop((max(0,px-pad),max(0,py-pad),min(2048,px+w+pad),min(2048,py+h+pad)));s=min(190/crop.width,190/crop.height);crop=crop.resize((round(crop.width*s),round(crop.height*s)),Image.Resampling.NEAREST);x=j%8*200;y=j//8*248;sheet.paste(crop,(x,y+22));d.text((x+2,y+3),str(c['id'])+' score:'+str(c['gridScore']),fill='white');d.text((x+2,y+219),('%.5f %.5f'%tuple(c['center'])),fill='white')
 sheet.save(cache/('filtered-'+str(page+1)+'.jpg'),quality=95)
print('Raw',len(src['candidates']),'Grid-like candidates',len(keep),'pages',math.ceil(len(keep)/40))
