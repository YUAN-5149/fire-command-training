import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function stationSnapshot(rows,{sha256,capturedAt}){
 const seen=new Set(),stations=[];
 for(const r of rows.filter(r=>r.sarea==='信義區')){
  const longitude=Number(r.longitude??r.lng),latitude=Number(r.latitude??r.lat),capacity=Number(r.Quantity??r.quantity??r.tot);
  if(!r.sno||seen.has(r.sno)||!r.sna||!Number.isFinite(longitude)||!Number.isFinite(latitude)||longitude<121.54||longitude>121.61||latitude<24.99||latitude>25.07||!Number.isInteger(capacity)||capacity<0)throw Error('Invalid/duplicate Xinyi station '+r.sno);
  seen.add(r.sno);stations.push({id:r.sno,name:r.sna.replace(/^YouBike2\.0_/,''),address:r.ar,longitude,latitude,capacity,enabled:r.act==='1',sourceUpdated:r.srcUpdateTime??r.mday,positionStatus:'official-point',layoutStatus:'unverified'});
 }
 if(!stations.length)throw Error('No Xinyi stations');
 return {version:1,source:{title:'臺北市 YouBike2.0 公共自行車即時資訊（站點快照）',url:'https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json',catalog:'https://data.taipei/dataset/detail?id=c6bc8aed-557d-41d5-bfb1-8da24f78f2fb',sha256,capturedAt,selection:'sarea = 信義區（依官方站點行政區欄位）'},status:{completed:'站名、官方站點座標、地址與柱位總數匯入',unverified:'逐柱位置、柱距、排列方向、自行車款式與地面高程',pending:'連續近照與現場尺寸核對',availability:'不匯入租還車數；畫面車輛僅為示意'},stations:stations.sort((a,b)=>a.id.localeCompare(b.id))};
}
if(typeof process!=='undefined'&&process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/import-xinyi-youbike.mjs SOURCE.json OUTPUT.json');
 const raw=fs.readFileSync(input);const data=stationSnapshot(JSON.parse(raw),{sha256:createHash('sha256').update(raw).digest('hex'),capturedAt:fs.statSync(input).mtime.toISOString()});fs.writeFileSync(output,JSON.stringify(data,null,2)+'\n');console.log('Imported '+data.stations.length+' official station points');
}
