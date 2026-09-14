import * as THREE from 'three';

/**
 * One source of truth for the character's foot.
 *
 * The same 2D outline drives both the extruded 3D shoe and the sand
 * footprint decal, so a print left on the beach always matches the foot
 * that made it.
 */

export const FOOT_LENGTH = 0.36;
export const FOOT_WIDTH = 0.17;

/* The extruded shoe is bevelled, which pushes its silhouette outward by
   this much on every side. The extruded profile is inset by the same
   amount so the finished shoe measures exactly FOOT_WIDTH x FOOT_LENGTH
   and therefore lines up with the footprint decal. */
const BEVEL_SIZE = 0.018;

/* Normalised outline: x is lateral in [-0.5, 0.5], y runs heel (0) -> toe (1). */
const OUTLINE = [
  [0.00, 0.00],
  [0.28, 0.03],
  [0.42, 0.16],
  [0.50, 0.36],
  [0.50, 0.58],
  [0.44, 0.80],
  [0.30, 0.94],
  [0.00, 1.00],
  [-0.30, 0.94],
  [-0.44, 0.80],
  [-0.50, 0.58],
  [-0.50, 0.36],
  [-0.42, 0.16],
  [-0.28, 0.03],
];

function outlinePoints(segments = 56, scaleX = FOOT_WIDTH, scaleY = FOOT_LENGTH) {
  const curve = new THREE.CatmullRomCurve3(
    OUTLINE.map(([x, y]) => new THREE.Vector3(x * scaleX, y * scaleY, 0)),
    true,
    'catmullrom',
    0.5
  );
  return curve.getPoints(segments).map((p) => new THREE.Vector2(p.x, p.y));
}

let cachedGeo = null;

/** Extruded shoe: centred on the origin in X/Z, sole resting at y = 0. */
export function buildFootGeometry() {
  if (cachedGeo) return cachedGeo;

  /* Inset the profile so the bevel brings it back out to the true size. */
  const shape = new THREE.Shape(
    outlinePoints(64, FOOT_WIDTH - BEVEL_SIZE * 2, FOOT_LENGTH - BEVEL_SIZE * 2)
  );
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: BEVEL_SIZE,
    bevelSegments: 2,
    curveSegments: 8,
  });

  /* Shape lives in XY (x lateral, y forward) and extrudes along +Z.
     Rotating +90° about X puts forward on +Z and the extrusion on -Y. */
  geo.rotateX(Math.PI / 2);
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox.min.y, 0);

  /* Re-centre on Z so the decal (also centred) lines up exactly. */
  const midZ = (geo.boundingBox.min.z + geo.boundingBox.max.z) / 2;
  geo.translate(0, 0, -midZ);

  geo.computeVertexNormals();
  cachedGeo = geo;
  return geo;
}

let cachedTex = null;

/** The footprint decal: the very same outline, drawn as a shoe print. */
export function makeFootTexture() {
  if (cachedTex) return cachedTex;

  const W = 128;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const pts = outlinePoints(96);
  const toCanvas = (p) => [
    (p.x / FOOT_WIDTH + 0.5) * W,
    (1 - (p.y / FOOT_LENGTH)) * H,
  ];

  ctx.beginPath();
  pts.forEach((p, i) => {
    const [cx, cy] = toCanvas(p);
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.closePath();

  /* Firmer under the heel and ball, lighter across the arch. */
  const g = ctx.createLinearGradient(0, H, 0, 0);
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.24, 'rgba(255,255,255,1)');
  g.addColorStop(0.46, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.62)');
  g.addColorStop(0.78, 'rgba(255,255,255,1)');
  g.addColorStop(1.00, 'rgba(255,255,255,0.92)');
  ctx.fillStyle = g;
  ctx.fill();

  /* A few tread notches for a worn-boot feel. */
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const y = H * (0.06 + i * 0.035);
    ctx.beginPath();
    ctx.moveTo(W * 0.28, y);
    ctx.lineTo(W * 0.72, y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  cachedTex = tex;
  return tex;
}
