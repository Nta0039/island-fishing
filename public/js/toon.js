import * as THREE from 'three';

/**
 * Shared cel-shading ramp. Four flat bands produce the classic
 * cartoon "stepped" light falloff.
 */
let gradientMap = null;

export function getGradientMap() {
  if (gradientMap) return gradientMap;
  const steps = new Uint8Array([64, 128, 196, 255]);
  gradientMap = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

/** Cartoon material factory used by every model in the scene. */
export function toonMaterial(opts = {}) {
  const { color, ...rest } = opts;
  return new THREE.MeshToonMaterial({
    color: color === undefined ? 0xffffff : color,
    gradientMap: getGradientMap(),
    ...rest,
  });
}

/**
 * Tint a geometry with a flat vertex colour so many parts can be merged
 * into a single draw call while keeping distinct colours.
 */
export function tint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/* ------------------------------------------------------------------ */
/*  Wind                                                               */
/* ------------------------------------------------------------------ */

const windMaterials = new Set();

/**
 * Patch a material's vertex shader so geometry sways in the breeze.
 * `bend` controls how much the top moves relative to the base (2 keeps
 * the trunk rigid and lets only the crown move). Works for both plain
 * meshes and InstancedMesh, using the instance position as a phase seed
 * so neighbouring plants never sway in lockstep.
 */
export function applyWind(material, opts = {}) {
  const strength = opts.strength !== undefined ? opts.strength : 1;
  const bend = opts.bend !== undefined ? opts.bend : 2;
  const scale = opts.scale !== undefined ? opts.scale : 0.012;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = { value: 0 };
    shader.uniforms.uWindStrength = { value: strength };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uWindTime;\nuniform float uWindStrength;'
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 windSeed = instanceMatrix[3].xyz;
        #else
          vec3 windSeed = vec3(0.0);
        #endif
        float windH = max(transformed.y, 0.0);
        float windPhase = uWindTime * 1.2 + windSeed.x * 0.32 + windSeed.z * 0.24;
        float windAmp = uWindStrength * pow(windH, ${bend.toFixed(2)}) * ${scale.toFixed(4)};
        transformed.x += sin(windPhase) * windAmp;
        transformed.z += cos(windPhase * 0.77 + 1.3) * windAmp * 0.75;
        transformed.y -= abs(sin(windPhase)) * windAmp * 0.15;`
      );

    material.userData.shader = shader;
  };

  /* three caches programs by onBeforeCompile.toString(), which is the
     same source for every wind material. Without a distinct key they
     would all silently share the first material's sway profile. */
  material.customProgramCacheKey = () => `wind_${bend}_${scale}_${strength}`;

  material.userData.wind = true;
  material.needsUpdate = true;
  windMaterials.add(material);
  return material;
}

/** Advance every wind material. Called once per frame from the world. */
export function updateWind(time) {
  for (const m of windMaterials) {
    const shader = m.userData.shader;
    if (shader) shader.uniforms.uWindTime.value = time;
  }
}

/**
 * Give a geometry crisp faceted shading. PolyhedronGeometry ships with
 * smoothed normals, so re-deriving them from a non-indexed copy produces
 * flat per-face normals instead.
 */
export function flatShade(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

/**
 * Prepare one part of a merged model: strip the index, apply
 * scale -> rotation -> translation, then paint it.
 */
export function part(geo, hex, opts = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;

  if (opts.scale) {
    if (Array.isArray(opts.scale)) g.scale(opts.scale[0], opts.scale[1], opts.scale[2]);
    else g.scale(opts.scale, opts.scale, opts.scale);
  }
  if (opts.rot) {
    if (opts.rot[0]) g.rotateX(opts.rot[0]);
    if (opts.rot[1]) g.rotateY(opts.rot[1]);
    if (opts.rot[2]) g.rotateZ(opts.rot[2]);
  }
  if (opts.pos) g.translate(opts.pos[0], opts.pos[1], opts.pos[2]);

  tint(g, hex);
  return g;
}
