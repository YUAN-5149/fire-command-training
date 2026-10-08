// Explicit stairwell openings and landings for a continuous 1F–5F walking route.
export function addWalkableSlab(box,f,y){
 if(f===0){box(11,.22,8,0,y+.2,0,'#b5bebc');return}
 box(6.75,.22,8,2.125,y+.2,0,'#b5bebc');
 box(.95,.22,8,-5.025,y+.2,0,'#b5bebc');
 box(3.3,.22,.9,-2.9,y+.2,-3.55,'#b5bebc');
 box(3.3,.22,.5,-2.9,y+.2,3.75,'#b5bebc');
 // Landing at the arrival end joins the stairwell to the right-hand corridor.
 box(3.45,.22,f%2?.8:.6,-2.825,y+.2,f%2?-2.65:3.3,'#b5bebc');
}
export function addInteriorStairs(box){
 for(let f=0;f<4;f++)for(let n=0;n<16;n++)box(1.45,.2,.35,f%2?-2.1:-3.7,f*3.2+.41+n*.2,f%2?-2.25+n*.35:3-n*.35,'#b0b8b3');
}
export function addInteriorPartitions(box,f,y){
 // Keep an open 1.6 m passage between the stair corridor and front rooms.
 if(f>0){box(.18,2.8,5.4,0,y+1.7,-1.2,'#9aa4a0');box(.18,.55,1.6,0,y+2.825,2.3,'#9aa4a0');}
 box(1.8,2.8,.15,1.1,y+1.7,-.6,'#9aa4a0');box(1.65,2.8,.15,4.475,y+1.7,-.6,'#9aa4a0');box(1.65,.55,.15,2.825,y+2.825,-.6,'#9aa4a0');
}
