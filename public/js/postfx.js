import * as THREE from 'three';

/**
 * Hand-drawn post processing.
 *
 * The scene is rendered into a linear, HDR (half-float) target that carries a
 * depth texture. A single full-screen pass then:
 *   1. finds silhouettes from depth discontinuities (Roberts cross),
 *   2. finds interior lines from luminance discontinuities,
 *   3. wobbles the sampling UVs so the ink lines look sketched by hand,
 *   4. adds a faint paper grain,
 *   5. finally applies tone mapping + sRGB encoding (three skips both when
 *      rendering into a render target, so the composite has to do it).
 */

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2  uTexel;
  uniform float uNear;
  uniform float uFar;
  uniform float uDepthEdge;
  uniform float uColorEdge;
  uniform vec3  uLineColor;
  uniform float uInkStrength;
  uniform float uGrain;
  uniform float uTime;
  uniform float uFadeNear;
  uniform float uFadeFar;

  varying vec2 vUv;

  float linearizeDepth(float d) {
    float z = d * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  }

  float luma(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    /* Undistorted sampling: every pixel is read at its exact screen
       position so nothing is warped or twisted. */
    vec2 uv = vUv;

    vec3 col = texture2D(tDiffuse, uv).rgb;

    /* --- depth silhouette edges (Roberts cross) --------------------- */
    float d0  = linearizeDepth(texture2D(tDepth, uv).x);
    float dx  = linearizeDepth(texture2D(tDepth, uv + vec2(uTexel.x, 0.0)).x);
    float dy  = linearizeDepth(texture2D(tDepth, uv + vec2(0.0, uTexel.y)).x);
    float dxy = linearizeDepth(texture2D(tDepth, uv + uTexel).x);

    float gx = d0 - dxy;
    float gy = dx - dy;
    float depthEdge = sqrt(gx * gx + gy * gy) / max(d0, 0.001);

    /* --- luminance edges (interior detail lines) -------------------- */
    float l0  = luma(texture2D(tDiffuse, uv).rgb);
    float lx  = luma(texture2D(tDiffuse, uv + vec2(uTexel.x, 0.0)).rgb);
    float ly  = luma(texture2D(tDiffuse, uv + vec2(0.0, uTexel.y)).rgb);
    float lxy = luma(texture2D(tDiffuse, uv + uTexel).rgb);

    float cx = l0 - lxy;
    float cy = lx - ly;
    float colorEdge = sqrt(cx * cx + cy * cy);

    float silhouette = smoothstep(uDepthEdge, uDepthEdge * 2.6, depthEdge);
    float detail     = smoothstep(uColorEdge, uColorEdge * 2.0, colorEdge) * 0.65;

    /* Fade the ink out with distance: keeps nearby models crisp while
       avoiding speckle on the horizon and the distant shipping. */
    float distFade = 1.0 - smoothstep(uFadeNear, uFadeFar, d0);

    float ink = clamp(silhouette + detail, 0.0, 1.0) * uInkStrength * distFade;

    vec3 finalColor = mix(col, uLineColor, ink);

    /* --- paper grain ------------------------------------------------ */
    float grain = fract(sin(dot(vUv * 1024.0, vec2(12.9898, 78.233))) * 43758.5453);
    finalColor += (grain - 0.5) * uGrain;

    gl_FragColor = vec4(finalColor, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createPostFX(renderer, scene, camera) {
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);

  const uniforms = {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uTexel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) },
    uNear: { value: camera.near },
    uFar: { value: camera.far },
    /* ~1.2% relative depth jump per pixel: catches silhouettes without
       tracing false contours down sloped ground. */
    uDepthEdge: { value: 0.012 },
    uColorEdge: { value: 0.38 },
    uLineColor: { value: new THREE.Color('#0d141c') },
    uInkStrength: { value: 0.9 },
    uGrain: { value: 0.02 },
    uTime: { value: 0 },
    uFadeNear: { value: 140 },
    uFadeFar: { value: 420 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });

  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  let target = null;

  function buildTarget(w, h) {
    if (target) {
      target.depthTexture.dispose();
      target.dispose();
    }
    const depthTexture = new THREE.DepthTexture(w, h);
    depthTexture.type = THREE.UnsignedIntType;
    depthTexture.minFilter = THREE.NearestFilter;
    depthTexture.magFilter = THREE.NearestFilter;

    /* HDR keeps highlights intact until the composite tone-maps them.
       Fall back to 8-bit when float colour buffers are unavailable. */
    const canFloat =
      renderer.extensions.has('EXT_color_buffer_float') ||
      renderer.extensions.has('EXT_color_buffer_half_float');

    target = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: canFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture,
    });
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;

    uniforms.tDiffuse.value = target.texture;
    uniforms.tDepth.value = depthTexture;
    uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  buildTarget(size.x, size.y);

  return {
    uniforms,

    setSize(width, height) {
      const dpr = renderer.getPixelRatio();
      buildTarget(Math.max(1, Math.floor(width * dpr)), Math.max(1, Math.floor(height * dpr)));
    },

    render(dt) {
      uniforms.uTime.value += dt;
      uniforms.uNear.value = camera.near;
      uniforms.uFar.value = camera.far;

      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);

      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCamera);
    },
  };
}
