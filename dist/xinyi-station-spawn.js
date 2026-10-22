import {localToLonLat} from './landmarks-real.js';

// Existing HQ anchor and apparatus apron, from hq-anchor.json and build_xinyi_street.py.
// Official station address: Zhongxiao E. Rd. Sec. 5 No.32. Positions within the
// existing model are visual placements, not a survey of the actual parking bay.
export const XINYI_STATION={name:'信義分隊',address:'臺北市信義區忠孝東路5段32號',source:'https://www.119.gov.taipei/News_Content.aspx?n=B560E007487264F0&s=CC7601CC4DA8BD07&sms=63C64EAD9579D601',modelPlacementVerified:false};
export const DEFAULT_HQ_ANCHOR={key:'hq',lon:121.5685283,lat:25.0410951,base:7.13,heading:-1.6};
export function stationPositions(anchor=DEFAULT_HQ_ANCHOR){
 return {player:localToLonLat(anchor,58.6,-19),truck:localToLonLat(anchor,61.6,-19),heading:anchor.heading*Math.PI/180,station:XINYI_STATION};
}
// Use only the existing apron mesh's top (0.19 m) in its forecourt rectangle;
// this does not add a ramp or an assumed real-world level difference.
export function stationSurface(ground,project,anchor=DEFAULT_HQ_ANCHOR){
 const original=ground.at.bind(ground),[ax,az]=project(anchor.lon,anchor.lat),g=original(ax,az),base=Math.abs(g-anchor.base)>1.5?g:anchor.base,h=anchor.heading*Math.PI/180;
 return (x,z)=>{const dx=x-ax,dy=-(z-az),u=dx*Math.cos(h)+dy*Math.sin(h),v=-dx*Math.sin(h)+dy*Math.cos(h);return u>=52.6&&u<=72&&v>=-27&&v<=-15?Math.max(original(x,z),base+.19):original(x,z);};
}
