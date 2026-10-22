// mrdoob/slop-newyork（MIT）車輛與行人的 WebGL 材質：原專案以 TSL（WebGPU）寫成，這裡逐行改寫成 GLSL，
// 讓本站的 WebGLRenderer 也能用同一套放樣車身與蒙皮行人。幾何與動畫見 vendor/slop/（自動擷取，未改）。
//   車：partId 分部位，車窗、密封條、頭燈（含 DRL）、尾燈、方向燈、水箱罩、進氣口、車牌、車門縫、
//       5 輻鋁圈、輪胎胎紋、計程車門徽與車頂燈、警車塗裝都在片段著色器依物件座標畫出；
//       每台車的漆色（paintColor）與狀態（carState：煞車、左右方向燈、警車塗裝）為實例屬性。
//   人：每人 31 個 vec4（15 骨頭的四元數與位移縮放＋種子資訊）存在浮點貼圖，頂點著色器以 gl_InstanceID
//       取骨頭做雙骨蒙皮，並套用體型／女性／髮量形變；片段著色器依種子著裝（膚色、髮型、西裝或外套、褲、鞋）。
// 在地化：車牌改為臺灣白底；警車塗裝沿用藍色腰線（示意）。
import * as T from 'three';
import {CAR_PARTS,carLayout,taxiSignPlacement} from './vendor/slop/actor-models.js';
import {STRIDE,PERSON_PART,HIP_X,buildPersonGeometry} from './vendor/slop/pedestrians.js';

// 數字轉 GLSL 常數；負數加括號，避免「a--0.5」被當成遞減運算子
const f=v=>{const s=Number(v).toFixed(5);return s.startsWith('-')?`(${s})`:s;};
const lin=hex=>{const c=new T.Color(hex);return `vec3(${f(c.r)},${f(c.g)},${f(c.b)})`;};

// ---------------------------------------------------------------- 車
function polygonPlanes(points,margins){return points.map(([ax,ay],i)=>{const [bx,by]=points[(i+1)%points.length],len=Math.hypot(bx-ax,by-ay),nx=(by-ay)/len,ny=-(bx-ax)/len;return [nx,ny,ax*nx+ay*ny-margins[i]];});}
const polyFn=(name,planes,k)=>`float ${name}(float px,float py){float d=px*${f(planes[0][0])}+py*${f(planes[0][1])}-${f(planes[0][2])};`+
 planes.slice(1).map(([nx,ny,c])=>`d=smax(d,px*${f(nx)}+py*${f(ny)}-${f(c)},${f(k)});`).join('')+'return d;}';

export const carNight={value:0};
const _carCache=new Map();
export function createCarMaterialGL(spec){
 if(_carCache.has(spec.name))return _carCache.get(spec.name);
 const L=carLayout(spec),cab=spec.cabin,bc=L.belt.cowl,bd=L.belt.deck,rf=L.rail.front,rm=L.rail.mid,rr=L.rail.rear;
 const sidePoly=[[cab.cowl,bc.y],[cab.roofFront,rf.y],[L.rail.roofMid,rm.y],[cab.roofRear,rr.y],[cab.deck,bd.y]];
 const frontPoly=[[-1,cab.cowl],[-1,cab.roofFront],[rf.x,cab.roofFront],[bc.x,cab.cowl]],rearPoly=[[-1,cab.roofRear],[-1,cab.deck],[bd.x,cab.deck],[rr.x,cab.roofRear]];
 const [hlX,hlY,hlW,hlH]=spec.headlight,[tlX,tlY,tlW,tlH]=spec.taillight,[grY,grW,grH]=spec.grille,[inY,inW,inH]=spec.intake,[plateF,plateR]=spec.plates;
 const frontZone=spec.zFront-.55,rearZone=spec.zRear+.55,sillY=spec.sill[1][1],rearSill=spec.tail.sill[1];
 const doorMid=(spec.doors[0]+spec.doors[1])/2,WR=spec.wheelRadius,AXZ=spec.wheelZ,ARCH=L.archR;
 const P=CAR_PARTS;
 const funcs=`
float slopRR(vec2 pt,vec2 hs,float rad){vec2 q=abs(pt)-hs+rad;float d=length(max(q,vec2(0.)))+min(max(q.x,q.y),0.)-rad;float e=max(fwidth(d),.001);return smoothstep(e,-e,d);}
float smax(float a,float b,float k){float h=max(k-abs(a-b),0.)/k;return max(a,b)+h*h*k*.25;}
float slopCov(float d){float w=max(fwidth(d),.0008);return smoothstep(w,-w,d);}
${polyFn('pdSide',polygonPlanes(sidePoly,[.05,.03,.03,.065,.02]),.07)}
${polyFn('pdSideSeal',polygonPlanes(sidePoly,[.034,.016,.016,.05,.004]),.07)}
${polyFn('pdFront',polygonPlanes(frontPoly,[0,.045,.06,.05]),.09)}
${polyFn('pdFrontSeal',polygonPlanes(frontPoly,[0,.03,.045,.035]),.09)}
${polyFn('pdRear',polygonPlanes(rearPoly,[0,.045,.065,.05]),.09)}
${polyFn('pdRearSeal',polygonPlanes(rearPoly,[0,.03,.05,.035]),.09)}
uniform float uNight;varying vec3 vSP;varying vec3 vSN;varying float vPart;varying vec3 vPaint;varying vec4 vState;`;
 const ip=id=>`step(abs(pid-${f(id)}),.25)`;
 let spokes='';for(let k=0;k<5;k++){const a=k*Math.PI*2/5,cs=Math.cos(a),sn=Math.sin(a);spokes+=`{float al=wDir.x*${f(cs)}+wDir.y*${f(sn)};float pe=abs(wDir.x*${f(sn)}-wDir.y*${f(cs)})*wheelDist;spokes=max(spokes,smoothstep(.034,.018,pe)*step(0.,al));}`;}
 const seams=spec.doors.map(zd=>`seams=max(seams,smoothstep(.009,.003,abs(p.z-${f(zd)})));`).join('')+spec.handles.map(zh=>`seams=max(seams,slopRR(vec2(p.z-${f(zh)},p.y-(belt-.095)),vec2(.06,.011),.008));`).join('');
 const pillars=cab.pillars.map(zp=>`sideG=max(sideG,.036-abs(p.z-${f(zp)}));`).join('');
 const taxiY=spec.sign?taxiSignPlacement(spec).y+.105:0;
 const body=`
vec3 p=vSP;vec3 n=normalize(vSN);float pid=vPart;
float isBody=${ip(P.BODY)},isWindow=${ip(P.WINDOW)},isTyre=${ip(P.TYRE)},isAlloy=${ip(P.ALLOY)},isTrim=${ip(P.TRIM)},isMirror=${ip(P.MIRROR)},isSign=${ip(P.SIGN)};
float ax=abs(p.x),isSide=smoothstep(.45,.7,abs(n.x));
float front=smoothstep(.12,.38,n.z)*step(${f(frontZone)},p.z)*isBody,rear=smoothstep(.12,.38,-n.z)*step(p.z,${f(rearZone)})*isBody,under=smoothstep(-.25,-.55,n.y)*isBody;
float belt=mix(${f(bd.y)},${f(bc.y)},clamp((p.z-${f(cab.deck)})/${f(cab.cowl-cab.deck)},0.,1.));
float sideG=pdSide(p.z,p.y);${pillars}
float backlight=slopCov(pdRear(ax,p.z))*isWindow;
float glass=max(max(slopCov(sideG),slopCov(pdFront(ax,p.z))),backlight/max(isWindow,1e-4))*isWindow;
float seal=max(slopCov(pdSideSeal(p.z,p.y)),max(slopCov(pdFrontSeal(ax,p.z)),slopCov(pdRearSeal(ax,p.z))))*isWindow;
float chromeBelt=${spec.chrome?`smoothstep(.003,.006,p.y-belt)*smoothstep(.016,.012,p.y-belt)*smoothstep(.5,.7,abs(n.x))*step(${f(cab.deck+.05)},p.z)*step(p.z,${f(cab.cowl-.08)})*isWindow`:'0.'};
float chmsl=slopRR(vec2(p.x,p.z-${f(cab.roofRear-.075)}),vec2(.14,.012),.005)*backlight*step(n.z,-.1);
float isCW=step(abs(p.z),${f(WR+.05)})*max(isTyre,isAlloy);
vec2 wheelVec=mix(vec2(abs(p.z)-${f(AXZ)},p.y-${f(WR)}),vec2(p.z,p.y),isCW);float wheelDist=length(wheelVec);
vec2 hlUV=vec2(ax-${f(hlX)},p.y-${f(hlY)}-(ax-${f(hlX)})*.1);
float headlight=slopRR(hlUV,vec2(${f(hlW)},${f(hlH)}),${f(hlH*.8)})*smoothstep(.02,.25,n.z)*step(${f(frontZone)},p.z)*isBody;
float headlightLens=slopRR(vec2(ax-${f(hlX-hlW*.3)},hlUV.y-${f(hlH*.12)}),vec2(${f(hlW*.42)},${f(hlH*.4)}),${f(hlH*.38)})*headlight;
float drlD=abs(hlUV.y+${f(hlH*.6)}),drlE=max(fwidth(drlD),.012),drl=smoothstep(drlE,0.,drlD)*headlight;
float turnFront=smoothstep(${f(hlX+hlW*.42)},${f(hlX+hlW*.52)},ax)*headlight;
float grille=slopRR(vec2(p.x,p.y-${f(grY)}),vec2(${f(grW)},${f(grH)}),${f(grH*.9)})*front;
float intake=slopRR(vec2(p.x,p.y-${f(inY)}),vec2(${f(inW)},${f(inH)}),.04)*front;
float plateFront=slopRR(vec2(p.x,p.y-${f(plateF)}),vec2(.155,.055),.008)*front;
float taillight=slopRR(vec2(ax-${f(tlX)},p.y-${f(tlY)}),vec2(${f(tlW)},${f(tlH)}),${f(tlH*.6)})*smoothstep(.02,.25,-n.z)*step(p.z,${f(rearZone)})*isBody;
float turnRear=smoothstep(${f(tlX-tlW*.35)},${f(tlX-tlW*.45)},ax)*taillight;
float plateRear=slopRR(vec2(p.x,p.y-${f(plateR)}),vec2(.155,.06),.008)*rear;
float plateRecess=slopRR(vec2(p.x,p.y-${f(plateR)}),vec2(.185,.082),.02)*rear;
float diffuser=slopRR(vec2(p.x,p.y-${f(rearSill+.035)}),vec2(.58,.028),.02)*rear;
float reflector=slopRR(vec2(ax-${f(tlX+.06)},p.y-${f(rearSill+.1)}),vec2(.065,.011),.006)*rear;
float bumperSeam=max(smoothstep(.006,.0025,abs(p.y-${f(spec.bumperLine[0])}))*step(ax,${f(hlX-hlW*.6)})*front,smoothstep(.006,.0025,abs(p.y-${f(spec.bumperLine[1])}))*step(ax,${f(tlX)})*rear);
float cowlPanel=smoothstep(${f(cab.cowl+.085)},${f(cab.cowl+.07)},p.z)*smoothstep(${f(cab.cowl-.04)},${f(cab.cowl-.02)},p.z)*step(.6,n.y)*isBody;
float signFace=smoothstep(.55,.75,abs(n.z))*isSign;
float signGlyph=step(.42,sin(p.x*90.))*step(ax,.17)*smoothstep(.045,.04,abs(p.y-${f(taxiY)}));
float mirrorGlass=isMirror*step(.55,-n.z);
float lamp=max(headlight,taillight),plates=max(plateFront,plateRear);
float cladding=${spec.cladding>0?`max(smoothstep(${f(spec.cladding+.01)},${f(spec.cladding-.01)},p.y),smoothstep(${f(ARCH+.075)},${f(ARCH+.06)},wheelDist))*isBody*(1.-lamp)*(1.-plates)`:'0.'};
vec2 wDir=wheelVec/max(wheelDist,.0001);float spokes=0.;${spokes}
float rimRing=smoothstep(${f(WR*.56)},${f(WR*.6)},wheelDist),centerHub=smoothstep(.068,.042,wheelDist),centerCap=smoothstep(.03,.018,wheelDist);
float valveDot=smoothstep(.028,.014,length(wheelVec-vec2(0.,${f(-WR*.48)})));
float alloyMetal=clamp(max(max(spokes,valveDot),max(rimRing,centerHub))-centerCap*.85,0.,1.);
float matte=max(max(max(isTyre,isTrim),max(intake,grille)),max(max(diffuser,under),max(max(cowlPanel,cladding),seal*(1.-max(glass,chromeBelt)))));
vec3 paint=vPaint;vec4 st=vState;
float isPol=step(.5,st.w)*isSide*isBody;
float along=smoothstep(${f(spec.zRear+.22)},${f(spec.zRear+.3)},p.z)*smoothstep(${f(spec.zFront-.28)},${f(spec.zFront-.36)},p.z);
float band=smoothstep(.495,.5,p.y)*smoothstep(.645,.64,p.y)*along,pin=smoothstep(.663,.667,p.y)*smoothstep(.687,.683,p.y)*along;
float lettering=step(.45,sin(p.z*70.))*smoothstep(.725,.73,p.y)*smoothstep(.81,.805,p.y)*step(abs(p.z-${f(doorMid)}),.22);
vec3 painted=mix(mix(paint,${lin(0x1d3f8f)},max(band,lettering)*isPol),${lin(0x6fa8dc)},pin*isPol);
${spec.sign?`{float badge=slopRR(vec2(p.z-${f(doorMid)},p.y-.66),vec2(.21,.052),.012)*isSide*isBody;
 float emblem=smoothstep(.042,.036,length(vec2(abs(p.z-${f(doorMid)})-.15,p.y-.66)));
 float letters=step(.35,sin(p.z*95.))*step(abs(p.z-${f(doorMid)}),.1)*smoothstep(.03,.026,abs(p.y-.66));
 float medallion=step(.3,sin(p.z*150.))*step(abs(p.z-${f(spec.zRear+.6)}),.075)*smoothstep(.016,.013,abs(p.y-.8))*isSide*isBody;
 painted=mix(mix(painted,${lin(0x121417)},badge),${lin(0xffbe14)},max(emblem,letters)*badge);painted=mix(painted,${lin(0x121417)},medallion);}`:''}
float archLip=smoothstep(${f(ARCH+.05)},${f(ARCH-.005)},wheelDist)*smoothstep(.6,.9,ax);
float ao=(smoothstep(.2,.62,p.y)*.22+.78)*(1.-archLip*.55);
float onDoors=isSide*smoothstep(${f(sillY+.04)},${f(sillY+.07)},p.y)*smoothstep(0.,-.015,p.y-belt);
float seams=0.;${seams}
vec3 bodyC=mix(painted*ao,${lin(0x1e2124)},cladding);
bodyC*=(1.-seams*onDoors*.55)*(1.-bumperSeam*.5);bodyC=mix(bodyC,${lin(0x15181b)},cowlPanel);
float slats=step(.5,fract(p.y*42.))*.4+.6;
bodyC=mix(bodyC,${lin(0x111417)}*slats,max(intake,grille));
bodyC=mix(bodyC,mix(mix(${lin(0x23292f)},${lin(0xdfe9f2)},headlightLens),vec3(1.),drl),headlight);
bodyC=mix(bodyC,${lin(0x15181b)},diffuser);bodyC=mix(bodyC,${lin(0x7a0a10)},reflector);
bodyC=mix(bodyC,mix(${lin(0x8c0a12)},${lin(0xc24d10)},turnRear),taillight);
bodyC=mix(bodyC,bodyC*.55,plateRecess);bodyC=mix(bodyC,${lin(0xf0f0ea)},plates);bodyC=mix(bodyC,${lin(0x0e1013)},under);
vec3 glassCol=mix(${lin(0x0a1016)},${lin(0x1a2632)},smoothstep(.2,.9,n.y));
vec3 windowCol=mix(mix(mix(mix(paint,${lin(0x111315)},seal),glassCol,glass),${lin(0xc9ced3)},chromeBelt),${lin(0x6a0a0e)},chmsl);
vec3 mirrorCol=mix(paint,${lin(0x7c8a94)},mirrorGlass);
vec3 signCol=mix(${lin(0xf3efe2)},mix(${lin(0xfff1b8)},${lin(0x15181b)},signGlyph),signFace);
vec3 alloyCol=mix(${lin(0x0b0e12)},${lin(0xd8e0e8)},alloyMetal);
float treadZone=smoothstep(${f(WR*.74)},${f(WR*.83)},wheelDist),tyreBase=smoothstep(${f(WR*.85)},${f(WR*.94)},wheelDist)*.22+.78;
vec3 tyreCol=${lin(0x16181b)}*(tyreBase+spokes*treadZone*.24);
vec3 col=mix(bodyC,windowCol,isWindow);col=mix(col,mirrorCol,isMirror);col=mix(col,signCol,isSign);col=mix(col,${lin(0x1b1e21)},isTrim);col=mix(col,alloyCol,isAlloy);col=mix(col,tyreCol,isTyre);
diffuseColor.rgb=col;
float alloySpokes=max(spokes,rimRing)*isAlloy,glossy=max(max(max(glass,chromeBelt),mirrorGlass),lamp);
float cRough=mix(.26,.15,glossy);cRough=mix(cRough,.4,plates);cRough=mix(cRough,.35,isSign);cRough=mix(cRough,.82,max(matte,isAlloy-alloySpokes));
float cMetal=mix(.34,.14,glass);cMetal=mix(cMetal,.6,max(lamp,mirrorGlass));cMetal=mix(cMetal,.95,chromeBelt);cMetal=mix(cMetal,.86,alloySpokes);cMetal=mix(cMetal,.08,plates);cMetal=mix(cMetal,.04,max(matte,isSign));
float brake=st.x,blink=max(st.y*step(0.,p.x),st.z*step(p.x,0.));
vec3 cEmit=${lin(0xd9efff)}*(headlight*1.15+headlightLens*1.15+drl*.65)*uNight*(1.-turnFront*blink)
 +${lin(0xff0a12)}*(taillight*(1.-turnRear)*(brake*1.65+.95*max(uNight,.25)))
 +${lin(0xff0a12)}*(chmsl*brake*2.1)+${lin(0xff9a14)}*(max(turnFront,turnRear)*blink*2.2)
 +${lin(0xffe28a)}*(signFace*(1.-signGlyph*.9)*1.65*max(uNight,.15));`;
 const m=new T.MeshStandardMaterial({roughness:.3,metalness:.3});
 m.onBeforeCompile=sh=>{
  sh.uniforms.uNight=carNight;
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float partId;attribute vec3 paintColor;attribute vec4 carState;varying vec3 vSP;varying vec3 vSN;varying float vPart;varying vec3 vPaint;varying vec4 vState;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvSP=position;vSN=normal;vPart=partId;vPaint=paintColor;vState=carState;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\n'+funcs)
   .replace('#include <color_fragment>','#include <color_fragment>\n'+body)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=cRough;')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=cMetal;')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance=cEmit;');
 };
 m.customProgramCacheKey=()=>'slop-car-'+spec.name;
 _carCache.set(spec.name,m);return m;
}

// ---------------------------------------------------------------- 人
const COAT=[0x2b3a52,0x33332f,0x8a6a44,0x5a2f2f,0x4f5238,0x6a6a66,0x222024,0x7d3f22],COAT_F=[0x7a2630,0xb89a72,0x2e3e5c,0x1f1d22,0xc9c1b2,0x5b6b4a,0x8c5a7a,0x3c3c40];
const SHIRT=[0xe8e6e0,0xb8c4d8,0xcfc8b8,0x9aa7b8],LEG=[0x22242c,0x35485b,0x51473d,0x7c7160,0x252526],LEG_F=[0x1c1c22,0x2f4a6e,0x46413b,0xcfc8bb,0x5a2a2e];
const SKIN=[0xc68863,0xa96f4c,0x8a5535,0x6b3d24,0xd9a077],HAIR=[0x1a1512,0x3a2a1a,0x584022,0x6e6862,0x2a2624,0x8f6d43,0x5e3020];
const pick=(arr,t)=>{let s=lin(arr[0]);for(let i=1;i<arr.length;i++)s=`mix(${s},${lin(arr[i])},step(${f(i)},(${t})*${f(arr.length)}))`;return s;};
const PP=PERSON_PART;
const PERSON_VERT_COMMON=`uniform sampler2D uPose;attribute vec4 skin;attribute vec3 extra;attribute vec3 femaleDelta;attribute vec3 hairDelta;
varying vec3 vQ;varying float vAlong;varying float vPid;varying vec4 vInfo;
vec4 poseAt(int j){return texelFetch(uPose,ivec2(j,gl_InstanceID),0);}
vec3 qrot(vec4 q,vec3 v){return v+2.*cross(q.xyz,cross(q.xyz,v)+q.w*v);}
void skinPerson(out vec3 sp,out vec3 sn){vec4 info=poseAt(${STRIDE-1});
 float hairAmount=mix(clamp(info.w*2.,0.,1.),clamp(info.w*2.-1.,0.,1.),step(${f(PP.LONG_HAIR-.5)},skin.w));
 vec3 pp=position+vec3(extra.x,0.,extra.y)*(info.z-1.)+femaleDelta*info.y+hairDelta*hairAmount;
 int ia=int(skin.x+.5)*2,ib=int(skin.y+.5)*2;float w=skin.z;vec4 qa=poseAt(ia),ta=poseAt(ia+1),qb=poseAt(ib),tb=poseAt(ib+1);
 sn=normalize(mix(qrot(qa,normal),qrot(qb,normal),w));sp=mix(qrot(qa,pp)*ta.w+ta.xyz,qrot(qb,pp)*tb.w+tb.xyz,w);
 vQ=position;vAlong=extra.z;vPid=skin.w;vInfo=info;}`;
const lane=s=>`fract(sin((vInfo.x+${f(s)})*12.9898)*43758.5453)`;
const PERSON_FRAG=`
float pid=vPid,female=vInfo.y;vec3 q=vQ;float along=vAlong;
#define ISP(id) step(abs(pid-float(id)),.25)
vec3 skinCol=${pick(SKIN,lane(17))},hairCol=${pick(HAIR,lane(3))};
vec3 coatCol=mix(${pick(COAT,lane(29))},${pick(COAT_F,lane(29))},female),shirtCol=${pick(SHIRT,lane(71))},legsCol=mix(${pick(LEG,lane(47))},${pick(LEG_F,lane(47))},female);
vec2 hd=normalize(vec2(q.x,q.z+.01));float bald=step(${lane(41)},.08)*(1.-female);
float hairline=hd.y*.055+1.62-(hd.x*hd.x-hd.y*hd.y)*.005+bald*.3,hairMask=smoothstep(hairline-.004,hairline+.004,q.y);
float frontF=smoothstep(.06,.08,q.z),eyeX=abs(abs(q.x)-.031);
float eyes=smoothstep(.011,.006,eyeX)*smoothstep(.0055,.002,abs(q.y-1.627))*frontF,brows=smoothstep(.016,.01,eyeX)*smoothstep(.0035,.0012,abs(q.y-1.646))*frontF,mouth=smoothstep(.022,.014,abs(q.x))*smoothstep(.0045,.0015,abs(q.y-1.549))*frontF;
vec3 faceCol=mix(skinCol*(1.-eyes*.7-brows*.45),skinCol*${lin(0xb06a5c)}*1.15,mouth*.7),headCol=mix(faceCol,hairCol,hairMask);
vec3 hairStrands=hairCol*(sin(q.x*170.+q.z*130.)*.06+.97),hairPartCol=mix(hairStrands,skinCol,bald*step(q.y,1.755));
float tailored=step(.42,${lane(89)}),hemY=mix(mix(.955,1.,${lane(61)}),mix(.88,1.,${lane(61)}),female),chestFront=smoothstep(.035,.075,q.z),opening=(q.y-1.33)*.42;
float shirtV=smoothstep(1.33,1.35,q.y)*smoothstep(.004,0.,abs(q.x)-opening)*chestFront*tailored;
float lapel=smoothstep(.024,.009,abs(abs(q.x)-opening))*smoothstep(1.32,1.37,q.y)*chestFront*tailored*(1.-shirtV);
float zip=smoothstep(.006,.0025,abs(q.x))*chestFront*(1.-tailored),collarBand=smoothstep(1.455,1.48,q.y)*(1.-tailored);
float neckLine=mix(1.5,1.49,tailored),neck=smoothstep(neckLine-.004,neckLine+.004,q.y),hem=smoothstep(hemY-.004,hemY+.004,q.y),hemShade=smoothstep(hemY+.035,hemY,q.y)*.12;
vec3 jacketCol=mix(coatCol*(1.-lapel*.25-zip*.4-collarBand*.15-hemShade),shirtCol,shirtV),torsoCol=mix(mix(legsCol,jacketCol,hem),skinCol,neck);
float cuff=smoothstep(.93,.96,along);vec3 sleeveCol=mix(coatCol,mix(coatCol*.72,shirtCol,tailored),cuff);
float crease=smoothstep(.004,0.,abs(abs(q.x)-${f(HIP_X)}))*step(0.,q.z)*.08;vec3 trouserCol=legsCol*(1.-crease);
float sneaker=step(.4,${lane(5)});vec3 leatherCol=mix(${lin(0x201e1c)},${lin(0x4a3524)},${lane(23)}),sneakerCol=mix(${lin(0x252b32)},${lin(0xc8c3b8)},step(.55,${lane(31)}));
vec3 upperCol=mix(leatherCol,sneakerCol,sneaker);float sole=smoothstep(.024,.016,q.y);vec3 soleCol=mix(${lin(0x191816)},${lin(0xd5d1c8)},sneaker);
float laces=smoothstep(.6,.75,fract(q.z*80.))*step(abs(abs(q.x)-${f(HIP_X)}),.016)*step(0.,q.z)*step(q.z,.09)*step(.075,q.y)*sneaker;
vec3 shoeCol=mix(mix(upperCol,soleCol,sole),${lin(0xb8b4aa)},laces*.6);
vec3 pc=mix(mix(mix(mix(mix(mix(torsoCol,trouserCol,ISP(${PP.LEG})),shoeCol,ISP(${PP.SHOE})),sleeveCol,ISP(${PP.ARM})),skinCol,ISP(${PP.HAND})),headCol,ISP(${PP.HEAD})),hairPartCol,step(${f(PP.HAIR-.5)},pid));
diffuseColor.rgb=pc;
float skinP=max(ISP(${PP.HAND}),ISP(${PP.HEAD})),leather=ISP(${PP.SHOE})*step(${lane(5)},.4);
float pRough=mix(mix(mix(.86,.55,skinP),.74,step(${f(PP.HAIR-.5)},pid)),.38,leather);`;

function personMaterials(uPose){
 const m=new T.MeshStandardMaterial({metalness:0,roughness:.8});
 m.onBeforeCompile=sh=>{sh.uniforms.uPose=uPose;
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\n'+PERSON_VERT_COMMON)
   .replace('#include <beginnormal_vertex>','vec3 sPos;vec3 objectNormal;skinPerson(sPos,objectNormal);')
   .replace('#include <begin_vertex>','vec3 transformed=sPos;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vQ;varying float vAlong;varying float vPid;varying vec4 vInfo;')
   .replace('#include <color_fragment>','#include <color_fragment>\n'+PERSON_FRAG)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=pRough;');};
 m.customProgramCacheKey=()=>'slop-person';
 const d=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});
 d.onBeforeCompile=sh=>{sh.uniforms.uPose=uPose;
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\n'+PERSON_VERT_COMMON)
   .replace('#include <begin_vertex>','vec3 sPos;vec3 sNor;skinPerson(sPos,sNor);vec3 transformed=sPos;');};
 d.customProgramCacheKey=()=>'slop-person-depth';
 return {m,d};
}

// 人群：近處（細）與遠處（粗）兩層，各一個實例化繪製；骨頭資料每格一個 vec4。
export class PersonCrowdGL{
 constructor(maxCount,{farDistance=34,castShadow=true}={}){
  this.farDistance=farDistance;this.group=new T.Group();this.group.name='slop people';
  this.lods=[1,0].map(detail=>{
   const data=new Float32Array(STRIDE*4*maxCount),tex=new T.DataTexture(data,STRIDE,maxCount,T.RGBAFormat,T.FloatType);tex.needsUpdate=true;
   const src=buildPersonGeometry(detail),g=new T.InstancedBufferGeometry();g.index=src.index;for(const [k,a] of Object.entries(src.attributes))g.setAttribute(k,a);g.instanceCount=0;
   const uPose={value:tex},{m,d}=personMaterials(uPose),mesh=new T.Mesh(g,m);
   mesh.customDepthMaterial=d;mesh.frustumCulled=false;mesh.castShadow=castShadow;mesh.receiveShadow=true;mesh.name=detail?'people near':'people far';this.group.add(mesh);
   return {data,tex,g,count:0,max:maxCount};});
 }
 begin(){for(const l of this.lods)l.count=0;}
 add(rig,distance=0){const l=this.lods[distance>this.farDistance?1:0];if(l.count>=l.max)return;l.data.set(rig.pose,l.count*STRIDE*4);l.count++;}
 end(){for(const l of this.lods){l.g.instanceCount=l.count;if(l.count)l.tex.needsUpdate=true;}}
}
