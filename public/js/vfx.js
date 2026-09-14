import * as THREE from 'three';

function sparkTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,224,102,0.95)');
  g.addColorStop(1, 'rgba(255,170,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * Bright glowing / flashing particle burst used when a RARE fish is hooked.
 * Also flashes the avatar's materials via `group.userData.flash`.
 */
export function createRareVfx(scene) {
  const tex = sparkTexture();
  const effects = [];

  function trigger(group) {
    if (!group) return;

    const N = 150;
    const positions = new Float32Array(N * 3);
    const velocities = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.4 + Math.random() * 3.6;
      velocities.push(
        new THREE.Vector3(
          Math.cos(a) * sp * 0.8,
          2.0 + Math.random() * 4.0,
          Math.sin(a) * sp * 0.8
        )
      );
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.55,
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xffe066,
      opacity: 1,
    });

    const points = new THREE.Points(geo, mat);
    points.position.copy(group.position).add(new THREE.Vector3(0, 1.1, 0));
    points.frustumCulled = false;
    scene.add(points);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.62, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffe066,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(group.position).add(new THREE.Vector3(0, 0.25, 0));
    scene.add(ring);

    group.userData.flash = 1;

    effects.push({ points, velocities, ring, t: 0, life: 2.4 });
  }

  function update(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.t += dt;
      const k = e.t / e.life;

      const pos = e.points.geometry.attributes.position;
      for (let j = 0; j < e.velocities.length; j++) {
        const v = e.velocities[j];
        v.y -= 3.0 * dt;
        pos.setXYZ(j, pos.getX(j) + v.x * dt, pos.getY(j) + v.y * dt, pos.getZ(j) + v.z * dt);
      }
      pos.needsUpdate = true;

      e.points.material.opacity = Math.max(0, 1 - k);
      e.points.material.size = 0.55 * (1 - k * 0.45);

      const rs = 1 + k * 6;
      e.ring.scale.set(rs, rs, rs);
      e.ring.material.opacity = Math.max(0, 0.9 * (1 - k));

      if (e.t >= e.life) {
        scene.remove(e.points);
        scene.remove(e.ring);
        e.points.geometry.dispose();
        e.points.material.dispose();
        e.ring.geometry.dispose();
        e.ring.material.dispose();
        effects.splice(i, 1);
      }
    }
  }

  return { trigger, update };
}
