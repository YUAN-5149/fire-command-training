export function surfaceHeight(x,z,level=0){
 if(level>1&&Math.abs(x)<5.4&&z>-4&&z<4)return level>4.8?6.71:3.51;
 if(Math.abs(x)<=45&&z>=-8&&z<=6)return Math.abs(x)<5.4&&z>-4&&z<4?.31:.175;
 if(Math.abs(x)<=45&&z>=17.5&&z<=23.5)return .175;
 if(Math.abs(x)<=45&&z>=4.5&&z<=17.5)return -.065;
 return -.15;
}
// Stair routes remain inside the building. Explicit tread tops replace a diagonal rise through air.
export const stairPath=[[0,.31,3.5],[-3.7,.31,3.2],...Array.from({length:16},(_,i)=>[-3.7,.31+(i+1)*.2,3-i*.35]),[-2.1,3.51,-2.25],...Array.from({length:16},(_,i)=>[-2.1,3.51+(i+1)*.2,-2.25+i*.35]),[0,6.71,2]];
