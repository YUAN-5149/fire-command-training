"""Extract the verified I3S front face, preserving its coordinates and elevation.
Usage: python scripts/build-target-facade.py <downloaded I3S node directory>
Appearance dimensions are visual reconstruction, not survey measurements.
"""
import json,struct,sys,math
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[1];src=Path(sys.argv[1]);node=json.loads((src/'184.json').read_text());b=(src/'184_geometries_0.bin').read_bytes();vc,fc=struct.unpack_from('<II',b)
positions=np.frombuffer(b,dtype='<f4',count=vc*3,offset=8).reshape(-1,3);ids=np.frombuffer(b,dtype='<u8',count=fc,offset=8+36*vc);ranges=np.frombuffer(b,dtype='<u4',count=fc*2,offset=8+36*vc+8*fc).reshape(-1,2);index=int(np.where(ids==17697)[0][0]);start,end=ranges[index];world=positions[int(start)*3:(int(end)+1)*3].astype(float)+node['mbs'][:3]
origin=[121.5067,25.04445,0];scale=[100850,110574,1];local=(world-origin)*scale;groups={}
for tri in local.reshape(-1,3,3):
 n=np.cross(tri[1]-tri[0],tri[2]-tri[0]);length=np.linalg.norm(n)
 if length<1e-8:continue
 n/=length
 if abs(n[2])>.01 or n[0]>-.7:continue
 key=tuple(np.round(n,3))+(round(np.dot(n,tri[0]),1),);groups.setdefault(key,[]).append(tri)
verts=max(groups.values(),key=lambda ts:sum(np.linalg.norm(np.cross(t[1]-t[0],t[2]-t[0])) for t in ts));tri=verts[0];normal=np.cross(tri[1]-tri[0],tri[2]-tri[0]);normal/=np.linalg.norm(normal);vv=np.concatenate(verts);low=vv[np.isclose(vv[:,2],vv[:,2].min())];unique=np.unique(low.round(7),axis=0);assert len(unique)==2
A,B=sorted(unique,key=lambda p:p[1]);width=float(np.linalg.norm(B-A));height=float(vv[:,2].max()-A[2]);assert 35<width<36 and abs(height-74.63)<.01
out={'objectId':17697,'label':'32R','height':74.62999725341797,'groundElevation':4.28,'roofElevation':78.91,'center':[float(world[:,0].mean()),float(world[:,1].mean())],'name':'西寧南路搶救目標・阿曼 TiT','source':'https://www.historygis.udd.gov.taipei/arcgis/rest/services/Hosted/LOD1_2024/SceneServer/layers/0','sourceNode':'184','front':{'a':(A/scale+origin).tolist(),'b':(B/scale+origin).tolist(),'normal':normal.tolist(),'width':width,'height':height},'reference':'使用者提供之 Google 街景截圖，2025 年 5 月','appearance':'正面依照片重建；窗帶節距與材質非實測；未修改背面、屋頂或室內。'}
(root/'dist/assets/ximen-target.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print('Verified target 17697 front:',round(width,2),'m x',round(height,2),'m')
