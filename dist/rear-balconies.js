// Training layout inferred from the existing apartment, not a surveyed reconstruction.
export function addRearBalcony(box,f,scene,facade){const y=f*3.2;
// Rear wall opening aligned with the interior rear-room passage at x=2.825.
box(7.65,2.95,.3,-1.575,y+1.8,-3.9,'#a6afa9',facade);box(1.85,2.95,.3,4.475,y+1.8,-3.9,'#a6afa9',facade);box(1.5,.65,.3,2.8,y+2.95,-3.9,'#a6afa9',facade);
// Open rear door leaf rests alongside the opening; no invisible panel spans the exit.
box(.055,2.05,.72,3.49,y+1.34,-4.27,'#476167',facade);
// Ground floor retains its rear exit, without a balcony deck, railing or fixtures.
if(f===0)return;
box(11,.22,1.5,0,y+.2,-4.65,'#a5aaa3',scene);
for(const x of [-5.4,5.4])box(.13,1.1,1.5,x,y+.86,-4.65,'#879b9e',facade);
box(10.8,.07,.07,0,y+1.4,-5.35,'#81979a',facade);box(10.8,.42,.12,0,y+.52,-5.35,'#aab0a7',facade);
for(let n=0;n<28;n++)box(.035,.72,.035,-5.2+n*.385,y+.99,-5.35,'#738a8d',facade);
box(.6,.7,.5,-3.9,y+.66,-4.65,'#c7ccbf',facade);box(.45,.08,.36,-3.9,y+1.05,-4.65,'#88938c',facade);
box(.09,3.2,.09,-5.2,y+1.8,-4.1,'#6c7c77',facade);
}
