// Instructor-directed spatial progression; not an ignition / heat-transfer calculation.
export const WINDOW_X=[-4,-1.4,1.4,4];
export function resetSpread(s){s.spread={up:0,left:0,right:0};s.spreadCells=Array(12).fill(0);s.spreadCells[2]=1;s.rearSpread=false;s.rearCells=Array(9).fill(0);}
export function stepSpread(s,dt){const old=[...s.spreadCells];for(let row=0;row<3;row++)for(let col=0;col<4;col++){const i=row*4+col;if(i===2)continue;const enabled=row<=s.spread.up&&col>=2-s.spread.left&&col<=2+s.spread.right;const parent=col===2?old[i-4]:(col<2?old[i+1]:old[i-1]);const target=enabled&&parent>.65&&s.heatKW>1?1:0;if(!enabled)s.spreadCells[i]=Math.max(0,old[i]-dt*.25);else if(target)s.spreadCells[i]=Math.min(1,old[i]+dt*.15);}}
export function spreadSources(s){return s.spreadCells.map((strength,i)=>({strength,floor:2+Math.floor(i/4),x:WINDOW_X[i%4],base:7.05+Math.floor(i/4)*3.2}));}

export function stepRearSpread(s,dt){const old=[...s.rearCells];for(let f=0;f<3;f++)for(let stage=0;stage<3;stage++){const i=f*3+stage,parent=stage?old[i-1]:Math.max(...s.spreadCells.slice(f*4,f*4+4));if(!s.rearSpread)s.rearCells[i]=Math.max(0,old[i]-dt*.2);else if(parent>.65&&s.heatKW>1)s.rearCells[i]=Math.min(1,old[i]+dt*.1);}}
export function rearSources(s){return s.rearCells.map((strength,i)=>({strength,floor:2+Math.floor(i/3),x:2.825,z:[1.6,-2.2,-4.7][i%3],base:(2+Math.floor(i/3))*3.2+.31}));}
