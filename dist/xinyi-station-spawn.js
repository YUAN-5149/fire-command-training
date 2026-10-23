import {localToLonLat} from './landmarks-real.js';

// Existing HQ anchor and apparatus apron, from hq-anchor.json and build_xinyi_street.py.
// Official station address: Zhongxiao E. Rd. Sec. 5 No.32. Positions within the
// existing model are visual placements, not a survey of the actual parking bay.
export const XINYI_STATION={name:'信義分隊',address:'臺北市信義區忠孝東路5段32號',source:'https://www.119.gov.taipei/News_Content.aspx?n=B560E007487264F0&s=CC7601CC4DA8BD07&sms=63C64EAD9579D601',modelPlacementVerified:false};
export const DEFAULT_HQ_ANCHOR={key:'hq',lon:121.5685283,lat:25.0410951,base:7.13,heading:-1.6};
export function stationPositions(anchor=DEFAULT_HQ_ANCHOR){
 return {player:localToLonLat(anchor,61.6,-26.6),truck:localToLonLat(anchor,61.6,-32),aerial:localToLonLat(anchor,67.2,-31.45),support:localToLonLat(anchor,56,-32),supportExit:localToLonLat(anchor,56,-15),
  crew:[[57.3,-24],[56,-24],[54.7,-24],[56,-22.5]].map(([x,y])=>localToLonLat(anchor,x,y)),
  heading:anchor.heading*Math.PI/180,station:XINYI_STATION};
}
// Follow the existing bay/apron mesh top (0.19 m); flatten only the modeled garage.
// this does not add a ramp or an assumed real-world level difference.
export function stationSurface(ground,project,anchor=DEFAULT_HQ_ANCHOR){
 const original=ground.at.bind(ground),[ax,az]=project(anchor.lon,anchor.lat),g=original(ax,az),base=Math.abs(g-anchor.base)>1.5?g:anchor.base,h=anchor.heading*Math.PI/180;
 return (x,z)=>{const dx=x-ax,dy=-(z-az),u=dx*Math.cos(h)+dy*Math.sin(h),v=-dx*Math.sin(h)+dy*Math.cos(h);return u>=52.6&&u<=72&&v>=-37&&v<=-15?(v<=-27?base+.19:Math.max(original(x,z),base+.19)):original(x,z);};
}

// Match the existing open GLB bays, not the closed LOD1 footprint. Never alter source GIS geometry.
export function stationCollisionBuildings(buildings,anchor=DEFAULT_HQ_ANCHOR){
 const ids=new Set(anchor.officialIds??[288171,288599,288958,288957,288170]);
 const kept=buildings.filter(b=>b.id!=='landmark-hq'&&!ids.has(b.id));
 const f=anchor.footprint??{x0:30,y0:-51,x1:72,y1:-27,h:55.8},lines=[[[f.x0,f.y0],[f.x1,f.y0]],[[f.x0,f.y0],[f.x0,f.y1]],[[f.x1,f.y0],[f.x1,f.y1]]];
 for(const [a,b] of [[f.x0,53.8],[58.2,59.4],[63.8,65],[69.4,f.x1]])lines.push([[a,-27],[b,-27]]);
 for(const c of [56,61.6,67.2]){lines.push([[c-2.2,-36.95],[c+2.2,-36.95]]);for(const x of [c-2.175,c+2.175])lines.push([[x,-36.95],[x,-27]]);}
 const walls=lines.map(([p,q])=>{const a=localToLonLat(anchor,...p),b=localToLonLat(anchor,...q);return {a:[...a,anchor.base],b:[...b,anchor.base],h:f.h,w:Math.hypot(q[0]-p[0],q[1]-p[1]),n:[0,0]};});
 return [...kept,{id:'landmark-hq-garage-collision',walls,roofs:[]}];
}
