// Extracted from mrdoob/slop-newyork commit f98e8da6e9c032dd03be45a1e6b3203ec62aae3d (MIT; see LICENSE).
// Pure bus geometry only; WebGPU/TSL materials are adapted in xinyi-bus.js.
import * as THREE from 'three';
import {mergeGeometries} from '../BufferGeometryUtils.js';
import {buildBodyLoft,part,roundedBox,carBodyHalfWidthAt,CAR_PARTS} from './actor-models.js?v=bus-20261023';
const BUS_PARTS = {
  BODY: 0,
  TRIM: 1,
  POD: 2
};

const BUS_SPEC = {
  name: 'bus',
  headlight: [0.79, 0.8], // midpoint of each pair of white lamps; excludes the outer amber indicator
  zFront: 5.78,
  zRear: -5.78,
  wheelRadius: 0.48,
  wheelZ: 3.6,
  wheelX: 1.24,
  archGap: 0.09,
  archFlare: 0,
  tuck: 0.05,
  stationStep: 0.62,
  lowerRound: 2.6,
  upperRound: 6,
  upperSamples: [0.3, 0.56, 0.74, 0.88, 1],
  halfWidth: [[5.78, 1.3], [-5.78, 1.3]],
  sill: [[5.78, 0.36], [-5.78, 0.36]],
  shoulder: [[5.78, 1.05], [-5.78, 1.05]],
  edge: [[5.78, 2.96], [-5.78, 2.96]],
  crown: [[5.78, 0.045], [-5.78, 0.045]],
  tumble: [[5.78, 0.17], [-5.78, 0.17]],
  nose: { halfWidth: [0.28, 1.02, 2], edge: [0.24, 2.68, 2], crown: [0.24, 0.005, 2], sill: [0.07, 0.44, 2], shoulder: [0.2, 0.95, 2] },
  tail: { halfWidth: [0.24, 1.06, 2], edge: [0.2, 2.72, 2], crown: [0.2, 0.005, 2], sill: [0.09, 0.46, 2], shoulder: [0.2, 0.95, 2] },
  rake: 0.15, // how far the top of the windshield leans back
  window: [1.24, 2.44], // side window band (y)
  frontDoor: [4.36, 5.36], // curb-side (-x) doors (z ranges)
  rearDoor: [-1.52, -0.5]
};

// The windshield rake: the upper front leans back by up to BUS_SPEC.rake, fading out along the first metre
function busRake(y, z) {
  const s = BUS_SPEC;
  const along = Math.min(1, Math.max(0, (z - (s.zFront - 1.0)) / 1.0));
  const up = Math.min(1, Math.max(0, (y - 1.0) / 1.75));
  return s.rake * along * along * Math.pow(up, 1.3);
}

function buildLoftedBusBodyGeometry() {
  const s = BUS_SPEC;
  const body = buildBodyLoft(s, 1);
  const pos = body.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) - busRake(pos.getY(i), pos.getZ(i)));
  body.computeVertexNormals();
  const parts = [part(body, BUS_PARTS.BODY)];

  // Bumpers, front bike rack (folded), stalk mirrors
  parts.push(part(roundedBox(1.24, 0.12, 0.24, 0.07, 0.03).translate(0, 0.5, s.zFront - 0.05), BUS_PARTS.TRIM));
  parts.push(part(roundedBox(1.24, 0.11, 0.22, 0.06, 0.03).translate(0, 0.48, s.zRear + 0.05), BUS_PARTS.TRIM));
  const rackZ = s.zFront + 0.13;
  parts.push(part(roundedBox(0.5, 0.024, 0.05, 0.02, 0.008).translate(0, 1.0, rackZ + 0.05), BUS_PARTS.TRIM));
  parts.push(part(roundedBox(0.46, 0.02, 0.05, 0.018, 0.008).translate(0, 0.74, rackZ), BUS_PARTS.TRIM));
  for (const side of [-1, 1]) {
    parts.push(part(new THREE.BoxGeometry(0.035, 0.36, 0.035).rotateX(-0.14).translate(side * 0.47, 0.83, rackZ + 0.02), BUS_PARTS.TRIM));
    // Mirror stalk from the roof corner, curving forward & out to a tall mirror head ahead of the windshield corner
    const stalk = new THREE.BoxGeometry(0.035, 0.035, 0.5)
      .rotateX(0.55)
      .rotateY(side * 0.35)
      .translate(side * 1.2, 2.58, s.zFront - 0.12);
    const head = roundedBox(0.075, 0.2, 0.06, 0.03, 0.012).translate(side * 1.36, 2.24, s.zFront + 0.12);
    parts.push(part(stalk, BUS_PARTS.TRIM), part(head, BUS_PARTS.TRIM));
  }

  // Roof equipment: air-conditioning pod at the rear, hybrid battery pod ahead of it
  const roofY = s.edge[0][1] + s.crown[0][1];
  parts.push(part(roundedBox(0.98, 0.15, 2.5, 0.12, 0.05).translate(0, roofY + 0.1, -3.55), BUS_PARTS.POD));
  parts.push(part(roundedBox(0.82, 0.1, 3.0, 0.08, 0.04).translate(0, roofY + 0.06, 1.1), BUS_PARTS.POD));

  // Arch liners
  for (const side of [-1, 1]) {
    for (const z of [-s.wheelZ, s.wheelZ]) {
      const well = new THREE.CircleGeometry(s.wheelRadius + s.archGap + 0.01, 10, 0, Math.PI)
        .rotateY(side * Math.PI * 0.5)
        .translate(side * (s.wheelX - 0.2), s.wheelRadius, z);
      parts.push(part(well, BUS_PARTS.TRIM));
    }
  }
  return mergeGeometries(parts);
}

/**
 * Destination sign panels for the bus's sign texture (route badge + destination): above the windshield, on the curb
 * side by the front door, and the route badge alone above the rear window. Same object space as the bus body.
 */
function buildBusSignGeometry() {
  const s = BUS_SPEC;
  const panels = [];
  const yF = 2.55;
  const front = new THREE.PlaneGeometry(1.9, 0.27);
  front.rotateX(-Math.atan2(s.rake * 1.3 * 0.62, 1.75));
  front.translate(0, yF, s.zFront - busRake(yF, s.zFront) + 0.012);
  panels.push(front);
  const side = new THREE.PlaneGeometry(1.15, 0.2).rotateY(-Math.PI / 2);
  side.translate(-(carBodyHalfWidthAt(s, 3.9, 2.58) + 0.006), 2.58, 3.9);
  panels.push(side);
  const rear = new THREE.PlaneGeometry(0.52, 0.2);
  const uv = rear.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.29);
  rear.rotateY(Math.PI).translate(0, 2.55, s.zRear - 0.012);
  panels.push(rear);
  return mergeGeometries(panels);
}

// Bus wheel: tall tyre with a deep steel disc, 10 lug nuts and a hub cap on both outer and inner faces (spins about x, centred on the origin)
function buildBusWheelGeo(side) {
  const r = BUS_SPEC.wheelRadius;
  const w = 0.3;
  const tyre = new THREE.LatheGeometry(
    [
      new THREE.Vector2(r * 0.72, -w * 0.5),
      new THREE.Vector2(r * 0.97, -w * 0.38),
      new THREE.Vector2(r, 0),
      new THREE.Vector2(r * 0.97, w * 0.38),
      new THREE.Vector2(r * 0.72, w * 0.5)
    ],
    20
  );
  const disc = new THREE.LatheGeometry(
    [new THREE.Vector2(r * 0.72, w * 0.5), new THREE.Vector2(r * 0.66, w * 0.4), new THREE.Vector2(r * 0.56, w * 0.18), new THREE.Vector2(0.15, w * 0.16)],
    20
  );
  const backDisc = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, -w * 0.16),
      new THREE.Vector2(0.15, -w * 0.16),
      new THREE.Vector2(r * 0.56, -w * 0.18),
      new THREE.Vector2(r * 0.66, -w * 0.4),
      new THREE.Vector2(r * 0.72, -w * 0.5)
    ],
    20
  );
  const cap = new THREE.CylinderGeometry(0.1, 0.13, 0.12, 14).translate(0, w * 0.2, 0);
  const backCap = new THREE.CylinderGeometry(0.13, 0.1, 0.12, 14).translate(0, -w * 0.2, 0);
  const parts = [
    part(tyre, CAR_PARTS.TYRE),
    part(disc, CAR_PARTS.ALLOY),
    part(backDisc, CAR_PARTS.ALLOY),
    part(cap, CAR_PARTS.ALLOY),
    part(backCap, CAR_PARTS.ALLOY)
  ];
  for (const g of parts) g.rotateZ(-side * Math.PI * 0.5);
  return mergeGeometries(parts);
}


export {BUS_PARTS,BUS_SPEC,buildLoftedBusBodyGeometry,buildBusSignGeometry,buildBusWheelGeo};
