import * as THREE from 'three';
import { makeFootTexture, FOOT_LENGTH, FOOT_WIDTH } from './foot.js';

const LIFE = 5; // seconds a footprint stays before it has fully faded

/**
 * A recycled pool of footprint decals. The texture is generated from the
 * exact same outline as the character's shoe geometry, so each print
 * matches the foot that left it. Each lives 5 seconds, fading out at the
 * end, then disappears and is available for reuse.
 */
export function createFootprints(scene, max = 240) {
  const tex = makeFootTexture();
  const geo = new THREE.PlaneGeometry(FOOT_WIDTH, FOOT_LENGTH);
  geo.rotateX(-Math.PI / 2);

  const items = [];
  for (let i = 0; i < max; i++) {
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        color: 0x6f5a3c,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -6,
      })
    );
    mesh.visible = false;
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    scene.add(mesh);
    items.push({ mesh, life: 0 });
  }

  let cursor = 0;

  return {
    get activeCount() {
      return items.reduce((n, it) => n + (it.life > 0 ? 1 : 0), 0);
    },

    add(x, y, z, rotation) {
      const it = items[cursor];
      cursor = (cursor + 1) % items.length;
      it.mesh.position.set(x, y + 0.02, z);
      it.mesh.rotation.y = rotation + Math.PI; // texture toes point along -Z
      it.mesh.visible = true;
      it.life = LIFE;
    },

    update(dt) {
      for (const it of items) {
        if (it.life <= 0) continue;
        it.life -= dt;
        if (it.life <= 0) {
          it.mesh.visible = false;
          it.mesh.material.opacity = 0;
          continue;
        }
        const t = it.life / LIFE;
        const fadeIn = Math.min(1, (1 - t) * 10);
        const fadeOut = Math.min(1, t * 2.5);
        it.mesh.material.opacity = 0.68 * fadeIn * fadeOut;
      }
    },

    clear() {
      for (const it of items) {
        it.life = 0;
        it.mesh.visible = false;
        it.mesh.material.opacity = 0;
      }
    },
  };
}
