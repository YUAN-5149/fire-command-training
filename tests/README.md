# Aerial motion regression checks

Run from the project root:

```sh
node --no-warnings --experimental-loader ./tests/three-loader.mjs ./tests/aerial-motion.mjs
node --no-warnings --experimental-loader ./tests/three-loader.mjs ./tests/aerial-rescue.mjs
node --no-warnings --experimental-loader ./tests/three-loader.mjs ./tests/aerial-fog.mjs
```

Uses the actual GLB hierarchy, geometry and bundled Three.js. Only texture decoding and person appearance are stubbed in Node. Covers cabin/body triangle collisions (including rejection of the previous roof-penetrating descent and ladder-heel over-elevation), hydraulic ram alignment, safe landing outside the body, rejection of unreachable facade positions without far-side substitution, swept collisions, shortest turntable rotation, initial deployment, balcony approach, passenger descent, reachable floors 2–4 and rejected close targets at floors 5–6, return, pause/resume and mid-mission reassignment. Scene clearance limits are illustrative collision constraints, not a certified vehicle operating envelope.

Fog checks use the actual native nozzle mouth and platform transform: emission origin, nozzle-width cone root, broad water mist, continuing particles after arrival, stop/pause, and bounded platform swivel at reachable floors 2–4 and rejected close targets at floors 5–6. Rendering still requires WebGL.
