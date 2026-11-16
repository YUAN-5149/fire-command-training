// Site-specific illustrative staging, not a prescribed operational safety distance.
export const staging=[
 {x:-15,z:8.8,heading:Math.PI/2,crew:[-15,.25,6.1],hose:[-15,.2,7.35]},
 {x:-27,z:8.8,heading:Math.PI/2,crew:[-27,.25,6.1],hose:[-27,.2,7.35]},
 {x:18,z:8.8,heading:Math.PI/2,crew:[18,.25,6.1],hose:[18,.2,7.35]},
 {x:29,z:8.8,heading:Math.PI/2,crew:[29,.25,6.1],hose:[29,.2,7.35]}
];

// Truck midpoint aligned with the entrance axis (x=0), cab facing -X.
export const aerialStaging={x:0,z:10,workMinX:-6,workMaxX:6,workMinZ:7.2,workMaxZ:12.8};

// Water tanker 信義61 (12 t): parked behind the second engine in the same lane, same direction.
// 9.45 m long, so it spans x -44.2..-34.8 with ~4 m clear to the engine at x=-27. Illustrative, as above.
export const tankerStaging={x:-39.5,z:8.8,heading:Math.PI/2};

// 消防局勤務車（Outlander，指揮勤務）：停在第四車組前方同一車道、順向。
// 車長 4.7 m，佔 x 35.65..40.35，與第四車組（x=29，半長約 3.72 m）間隔約 2.9 m；道路至 x=45。示意，同上。
export const surveyCarStaging={x:38,z:8.8,heading:Math.PI/2};

// 排煙車「劍潭76」（Fire Wolf 霧化排煙車）：同車道已無 7.4 m 空位，停在對向側車道（z=14.6）西段、順向。
// 車寬 2.45 m 佔 z 13.375..15.825（道路 z 4.5..17.5），x -36.7..-29.3；不占雲梯作業區（x ±6）。示意，同上。
export const smokeTruckStaging={x:-33,z:14.6,heading:Math.PI/2};

// 救助器材車「信義71」（後置曲臂式吊臂）：同車道已無 7.7 m 空位，停在對向側車道（z=14.6）東段、順向，與排煙車左右對稱。
// 車寬 2.5 m 佔 z 13.35..15.85（道路 z 4.5..17.5），x 29.15..36.85；不占雲梯作業區（x ±6）。示意，同上。
export const rescueTruckStaging={x:33,z:14.6,heading:Math.PI/2};
