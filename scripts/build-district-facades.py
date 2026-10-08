"""Extract rectangular wall planes and roof triangles from official leaf meshes.
No new building footprints or masses are introduced. Appearance is illustrative.
"""
from pathlib import Path
import json,struct,sys,math
import numpy as np
ROOT=Path(__file__).resolve().parents[1];SRC=Path(sys.argv[1]);SCALE=np.array([100850.,110574.,1.])
BOXES={'ximen':[121.5025,25.0375,121.5125,25.0465],'xinyi':[121.5604,25.0293,121.5704,25.0383]}
for place,box in BOXES.items():
 if len(sys.argv)>2 and place!=sys.argv[2]:continue
 leaves=json.loads((SRC/(place+'-leaves.json')).read_text());features={};walls=0
 for id in leaves:
  node=json.loads((SRC/(id+'.json')).read_text());raw=(SRC/(id+'_geometries_0.bin')).read_bytes();vc,fc=struct.unpack_from('<II',raw);assert len(raw)==8+vc*36+fc*16
  pos=np.frombuffer(raw,dtype='<f4',count=vc*3,offset=8).reshape(-1,3).astype(float)+node['mbs'][:3];ids=np.frombuffer(raw,dtype='<u8',count=fc,offset=8+36*vc);ranges=np.frombuffer(raw,dtype='<u4',count=fc*2,offset=8+36*vc+8*fc).reshape(-1,2)
  for oid,(start,end) in zip(ids,ranges):
   oid=int(oid)
   if oid in features:continue
   world=pos[int(start)*3:(int(end)+1)*3];mn=world.min(axis=0);mx=world.max(axis=0);center=(mn+mx)/2
   if not(box[0]<=center[0]<=box[2] and box[1]<=center[1]<=box[3]) or mx[2]-mn[2]<1:continue
   origin=np.array([center[0],center[1],0]);local=(world-origin)*SCALE;groups={};roofs=[]
   for ti,tri in enumerate(local.reshape(-1,3,3)):
    n=np.cross(tri[1]-tri[0],tri[2]-tri[0]);length=np.linalg.norm(n)
    if length<.0001:continue
    n/=length
    if n[2]>.5:roofs.extend(world[ti*3:ti*3+3].round(8).tolist())
    if abs(n[2])>.005:continue
    key=tuple(np.round(n,4))+(round(np.dot(n,tri[0]),2),);groups.setdefault(key,[]).append(tri)
   faces=[]
   for ts in groups.values():
    v=np.concatenate(ts);normal=np.cross(ts[0][1]-ts[0][0],ts[0][2]-ts[0][0]);normal/=np.linalg.norm(normal);tangent=np.array([-normal[1],normal[0],0]);u=v@tangent;u0,u1=float(u.min()),float(u.max());z0,z1=float(v[:,2].min()),float(v[:,2].max());w=u1-u0;h=z1-z0
    if w<1 or h<1:continue
    area=sum(np.linalg.norm(np.cross(t[1]-t[0],t[2]-t[0]))/2 for t in ts)
    if abs(area-w*h)>.015*w*h:continue # Never fill a non-rectangular opening or stepped boundary.
    d=float(np.dot(normal,v[0]));a=(tangent*u0+normal*d+np.array([0,0,z0]))/SCALE+origin;b=(tangent*u1+normal*d+np.array([0,0,z0]))/SCALE+origin
    if oid==17697 and normal[0]<-.7 and w>30:continue # Preserve the individually authored photo-reference frontage.
    faces.append({'a':a.round(9).tolist(),'b':b.round(9).tolist(),'w':round(w,4),'h':round(h,4),'n':normal[:2].round(7).tolist()})
   if faces or roofs:features[oid]={'id':oid,'walls':faces,'roofs':roofs};walls+=len(faces)
 out={'place':place,'bbox':box,'source':'https://www.historygis.udd.gov.taipei/arcgis/rest/services/Hosted/LOD1_2024/SceneServer/layers/0','sourceYear':2024,'appearance':'示意外觀，非逐棟實景；窗戶不是實際救援開口','buildings':list(features.values())}
 dest=ROOT/'dist/assets'/('district-'+place+'.json');dest.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')));print(place,len(features),'buildings;',walls,'walls;',dest.stat().st_size,'bytes',flush=True)
