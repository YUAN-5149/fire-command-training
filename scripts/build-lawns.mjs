// 逐街精修所見草坪（依 PROJECT-MEMORY.md「短草試作」：其他位置須先核對草坪／灌木／鋪面分類與邊界，不把綠地全部撒草）：
// 只挑街景照片確認是草坪的 OSM 綠地多邊形（street-furniture-xinyi.json 的 green），網頁以 three-stylized GrassLayer 長短草。
//
//   node scripts/build-lawns.mjs     → dist/assets/street-lawns-xinyi.json
//
// 以「種子點」找出所在的綠地多邊形（避免依索引，資料重建後仍對得上）；邊界沿用 OSM，非量測。
import fs from 'node:fs';

const read=f=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+f,import.meta.url)));
const furniture=read('street-furniture-xinyi.json');

// 街景確認為草坪的綠地（名稱、臨接道路、種子點 [x 東, z 南]、照片出處）
const SEEN=[
 {name:'國泰金融中心後側草坪',street:'松勇路',seed:[423,-486],photo:'Google 街景，松勇路27號西望：大片草坪、樹與低矮綠籬'},
 {name:'忠孝松仁路口西南側草坪',street:'忠孝東路五段',seed:[235,-780],photo:'Google 街景，忠孝東路五段松仁路口西側南望：人行道後大片草坪，後方樹列'},
];

const inside=(p,x,z)=>{let c=false;const n=p.length/2;for(let i=0,j=n-1;i<n;j=i++){const xi=p[2*i],zi=p[2*i+1],xj=p[2*j],zj=p[2*j+1];if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)c=!c;}return c;};
const area=p=>{let a=0;const n=p.length/2;for(let i=0;i<n;i++){const j=(i+1)%n;a+=p[2*i]*p[2*j+1]-p[2*j]*p[2*i+1];}return Math.abs(a/2);};
const lawns=SEEN.map(s=>{
 const hits=furniture.green.filter(p=>inside(p,...s.seed));
 if(hits.length!==1)throw Error(`${s.name}: seed inside ${hits.length} green polygons`);
 const poly=hits[0];
 return {name:s.name,street:s.street,photo:s.photo,area:+area(poly).toFixed(1),polygon:poly,
  status:'草坪分類依街景確認；邊界沿用 OSM 綠地，草高 6–12 cm 為外觀示意，草種與實際邊界待核對'};
});
const out={place:'xinyi',source:'Google 街景目測（各列 photo）；邊界為 OpenStreetMap 綠地（ODbL）',
 note:'只做照片確認為草坪的綠地；不含花台、竹叢、綠籬或樹穴。座標為街景本地公尺（x 東、z 南）。',lawns};
fs.writeFileSync(new URL('../dist/assets/street-lawns-xinyi.json',import.meta.url),JSON.stringify(out));
for(const l of lawns)console.log(l.name,l.street,'area',l.area,'m²');
