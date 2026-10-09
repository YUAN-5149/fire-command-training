// 信義街景導航：以 OSM 路網建圖並求最短路徑（示意導航，非即時路況、未考慮轉向限制與號誌）。
// 步行可走所有道路與人行路徑；駕駛只走車道道路，並遵守 OSM 單行道方向。
import {project} from './xinyi-street-world.js?v=s13';

const key=p=>p[0].toFixed(7)+','+p[1].toFixed(7);
const DRIVE=new Set(['primary','secondary','tertiary','trunk','unclassified','residential','service']);

export function buildRouteGraph(features,{vehicle=false}={}){
 const index=new Map(),nodes=[],adj=[];
 const node=p=>{const k=key(p);let i=index.get(k);if(i===undefined){i=nodes.length;index.set(k,i);const [x,z]=project(p[0],p[1]);nodes.push({x,z});adj.push([]);}return i;};
 for(const f of features){
  if(vehicle&&!(f.kind==='road'&&DRIVE.has(f.tags.highway)))continue;
  const oneway=vehicle&&['yes','1'].includes(f.tags.oneway),reverse=vehicle&&f.tags.oneway==='-1';
  for(const path of f.paths)for(let i=1;i<path.length;i++){
   const a=node(path[i-1]),b=node(path[i]),w=Math.hypot(nodes[a].x-nodes[b].x,nodes[a].z-nodes[b].z);
   if(!reverse)adj[a].push([b,w]);if(!oneway)adj[b].push([a,w]);
  }
 }
 return {nodes,adj};
}
export function nearestNode(graph,x,z){let best=-1,bd=Infinity;graph.nodes.forEach((n,i)=>{if(!graph.adj[i].length)return;const d=(n.x-x)**2+(n.z-z)**2;if(d<bd){bd=d;best=i;}});return best;}

// Dijkstra（二元堆積）。回傳經過的節點座標與總長；不可達時回傳 null。
export function findRoute(graph,fromX,fromZ,toX,toZ){
 const s=nearestNode(graph,fromX,fromZ),t=nearestNode(graph,toX,toZ);if(s<0||t<0)return null;
 const n=graph.nodes.length,dist=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),heap=[[0,s]];dist[s]=0;
 const push=e=>{heap.push(e);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}};
 const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){const l=i*2+1,r=l+1;let m=i;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m;}}return top;};
 while(heap.length){const [d,u]=pop();if(d>dist[u])continue;if(u===t)break;for(const [v,w] of graph.adj[u]){const nd=d+w;if(nd<dist[v]){dist[v]=nd;prev[v]=u;push([nd,v]);}}}
 if(!Number.isFinite(dist[t]))return null;
 const pts=[];for(let u=t;u>=0;u=prev[u])pts.push([graph.nodes[u].x,graph.nodes[u].z]);pts.reverse();
 const a=graph.nodes[s],b=graph.nodes[t];
 return {points:[[fromX,fromZ],...pts,[toX,toZ]],length:dist[t]+Math.hypot(a.x-fromX,a.z-fromZ)+Math.hypot(b.x-toX,b.z-toZ)};
}

// 道路名稱標籤位置：每個路名取最長的一段，放在中點並沿道路方向（文字保持朝上）。
export function roadLabels(features){
 const best=new Map();
 for(const f of features){if(f.kind!=='road'||!f.tags.name)continue;for(const path of f.paths)for(let i=1;i<path.length;i++){const [ax,az]=project(...path[i-1]),[bx,bz]=project(...path[i]),l=Math.hypot(bx-ax,bz-az);const cur=best.get(f.tags.name);if(!cur||l>cur.length){let ang=Math.atan2(bz-az,bx-ax);if(ang>Math.PI/2)ang-=Math.PI;if(ang<-Math.PI/2)ang+=Math.PI;best.set(f.tags.name,{name:f.tags.name,x:(ax+bx)/2,z:(az+bz)/2,angle:ang,length:l});}}}
 return [...best.values()].filter(l=>l.length>=25);
}
