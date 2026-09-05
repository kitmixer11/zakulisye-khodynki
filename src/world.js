import * as THREE from "three";
import {
  CELL,
  SIZE,
  DIRECTIONS,
  isWall,
  randomSource,
  spriteView,
} from "./level.js";
const ASSET = import.meta.env.BASE_URL + "assets/";
function texture(size, paint) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  paint(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function facets(kind) {
  const rng = randomSource(kind === "wall" ? 391 : 194),
    base =
      kind === "wall"
        ? [151, 131, 82]
        : kind === "floor"
          ? [101, 104, 79]
          : [75, 81, 65];
  const t = texture(512, (c, n) => {
    c.fillStyle = `rgb(${base.join(",")})`;
    c.fillRect(0, 0, n, n);
    const step = kind === "wall" ? 64 : 128;
    for (let y = 0; y < n; y += step)
      for (let x = 0; x < n; x += step) {
        const cx = x + step * (0.25 + rng() * 0.5),
          cy = y + step * (0.25 + rng() * 0.5);
        for (const p of [
          [
            [x, y],
            [x + step, y],
          ],
          [
            [x + step, y],
            [x + step, y + step],
          ],
          [
            [x + step, y + step],
            [x, y + step],
          ],
          [
            [x, y + step],
            [x, y],
          ],
        ]) {
          const shade = (rng() - 0.5) * (kind === "wall" ? 24 : 17);
          c.fillStyle = `rgb(${base.map((v) => Math.round(v + shade)).join(",")})`;
          c.beginPath();
          c.moveTo(cx, cy);
          c.lineTo(...p[0]);
          c.lineTo(...p[1]);
          c.closePath();
          c.fill();
        }
        if (kind !== "wall") {
          c.strokeStyle = "#252c22";
          c.lineWidth = 3;
          c.strokeRect(x, y, step, step);
          c.strokeStyle = "#b4b28a55";
          c.lineWidth = 1;
          c.strokeRect(x + 3, y + 3, step - 6, step - 6);
        }
      }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function numberTexture(number, home = false) {
  return texture(256, (c) => {
    c.fillStyle = "#262d25";
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = "#827d5d";
    c.lineWidth = 5;
    c.strokeRect(10, 10, 236, 236);
    c.fillStyle = home ? "#deca8a" : "#b5af8e";
    c.font = "72px Georgia";
    c.textAlign = "center";
    c.fillText(String(number), 128, 151);
  });
}
export async function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#151b14");
  scene.fog = new THREE.FogExp2("#202719", 0.033);
  const camera = new THREE.PerspectiveCamera(
    70,
    innerWidth / innerHeight,
    0.045,
    100,
  );
  camera.rotation.order = "YXZ";
  scene.add(camera);
  const ambient = new THREE.HemisphereLight(0xd8d2a5, 0x414334, 0.72);
  scene.add(ambient);
  const flashlight = new THREE.SpotLight(0xffe7b2, 19, 23, 0.49, 0.65, 1.3);
  flashlight.position.set(0.12, -0.08, -0.05);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.set(1024, 1024);
  flashlight.shadow.bias = -0.001;
  const aim = new THREE.Object3D();
  aim.position.set(0, -0.15, -10);
  camera.add(flashlight, aim);
  flashlight.target = aim;
  const loader = new THREE.TextureLoader();
  const sprites = Object.fromEntries(
    await Promise.all(
      ["front", "back", "side", "angry"].map(async (key) => {
        const t = await loader.loadAsync(ASSET + "monster/" + key + ".png");
        t.colorSpace = THREE.SRGBColorSpace;
        return [key, t];
      }),
    ),
  );
  const monsterMaterial = new THREE.MeshBasicMaterial({
    map: sprites.front,
    transparent: true,
    alphaTest: 0.12,
    side: THREE.DoubleSide,
    depthWrite: true,
    color: 0xb6bba3,
  });
  const monsterMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.94, 2.39),
    monsterMaterial,
  );
  monsterMesh.position.y = 1.195;
  scene.add(monsterMesh);
  const monsterGlow = new THREE.PointLight(0x78bb2f, 0.65, 3.5);
  scene.add(monsterGlow);
  const shadowTexture = texture(128, (c, n) => {
    const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, "#000000c0");
    g.addColorStop(1, "#00000000");
    c.fillStyle = g;
    c.fillRect(0, 0, n, n);
  });
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.1),
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  scene.add(contactShadow);
  const wallMat = new THREE.MeshStandardMaterial({
      map: facets("wall"),
      roughness: 1,
    }),
    floorTex = facets("floor");
  floorTex.repeat.set(SIZE, SIZE);
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.34,
    metalness: 0.08,
  });
  const ceilingTex = facets("ceiling");
  ceilingTex.repeat.set(SIZE, SIZE);
  const ceilingMat = new THREE.MeshStandardMaterial({
    map: ceilingTex,
    roughness: 1,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x292f2a,
    roughness: 0.72,
    metalness: 0.18,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x393e2c,
    roughness: 0.9,
  });
  const hardwareMat = new THREE.MeshStandardMaterial({
    color: 0x9c9470,
    roughness: 0.4,
    metalness: 0.6,
  });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xe3f5ac });
  const lightPool = texture(128, (c, n) => {
    const g = c.createRadialGradient(n / 2, n / 2, 2, n / 2, n / 2, n / 2);
    g.addColorStop(0, "#d0dc733b");
    g.addColorStop(1, "#d0dc7300");
    c.fillStyle = g;
    c.fillRect(0, 0, n, n);
  });
  const poolMat = new THREE.MeshBasicMaterial({
    map: lightPool,
    transparent: true,
    depthWrite: false,
  });
  let root = new THREE.Group();
  scene.add(root);
  let fixtures = [],
    doorObjects = new Map(),
    level = null;
  const dynamicLights = Array.from({ length: 5 }, () => {
    const light = new THREE.PointLight(0xe3edaa, 4.7, 8.5, 1.7);
    scene.add(light);
    return light;
  });
  function box(w, h, d, material, x, y, z, parent = root) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function floorRoom(x, z) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(CELL, CELL),
      new THREE.MeshStandardMaterial({ color: 0x37362c, roughness: 1 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.012, z);
    root.add(mesh);
  }
  function mountDoor(d) {
    const group = new THREE.Group();
    group.position.set(d.x, 0, d.z);
    group.rotation.y = Math.atan2(d.nx, d.nz);
    root.add(group);
    const opening = d.width + 0.12,
      side = (CELL - opening) / 2;
    box(side, 2.95, 0.17, wallMat, -CELL / 2 + side / 2, 1.475, 0, group);
    box(side, 2.95, 0.17, wallMat, CELL / 2 - side / 2, 1.475, 0, group);
    box(opening, 0.55, 0.17, wallMat, 0, 2.675, 0, group);
    box(0.075, 2.45, 0.21, trimMat, -opening / 2, 1.225, 0, group);
    box(0.075, 2.45, 0.21, trimMat, opening / 2, 1.225, 0, group);
    box(opening + 0.08, 0.075, 0.21, trimMat, 0, 2.44, 0, group);
    const hinge = new THREE.Group();
    hinge.position.set(-d.width / 2, 0, 0);
    group.add(hinge);
    box(d.width, 2.36, 0.085, steelMat, d.width / 2, 1.18, 0, hinge);
    box(
      d.width - 0.11,
      2.2,
      0.017,
      new THREE.MeshStandardMaterial({ color: 0x343b30, roughness: 0.88 }),
      d.width / 2,
      1.19,
      0.05,
      hinge,
    );
    for (const y of [0.4, 1.85])
      box(0.055, 0.12, 0.09, hardwareMat, 0.015, y, 0.05, hinge);
    for (const sideZ of [-1, 1]) {
      box(
        0.035,
        0.2,
        0.025,
        hardwareMat,
        d.width - 0.13,
        1.03,
        sideZ * 0.07,
        hinge,
      );
      box(
        0.15,
        0.035,
        0.04,
        hardwareMat,
        d.width - 0.18,
        1.07,
        sideZ * 0.09,
        hinge,
      );
      const eye = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.025, 12),
        hardwareMat,
      );
      eye.rotation.x = Math.PI / 2;
      eye.position.set(d.width / 2, 1.59, sideZ * 0.06);
      hinge.add(eye);
    }
    if (d.kind === "apartment") {
      const num = new THREE.Mesh(
        new THREE.PlaneGeometry(0.35, 0.25),
        new THREE.MeshBasicMaterial({ map: numberTexture(d.number, d.home) }),
      );
      num.position.set(-opening / 2 - 0.22, 1.76, 0.105);
      group.add(num);
      const roomCenter = { x: d.roomX, z: d.roomZ };
      floorRoom(roomCenter.x, roomCenter.z);
      for (const v of DIRECTIONS) {
        if (v.x === d.nx && v.z === d.nz) continue;
        const wall = box(
          CELL,
          2.95,
          0.15,
          trimMat,
          roomCenter.x + (v.x * CELL) / 2,
          1.475,
          roomCenter.z + (v.z * CELL) / 2,
        );
        wall.rotation.y = Math.atan2(v.x, v.z);
      }
      const mat = box(
        0.67,
        0.016,
        0.38,
        new THREE.MeshStandardMaterial({ color: d.home ? 0x877348 : 0x514b33 }),
        d.x + d.nx * 0.35,
        0.013,
        d.z + d.nz * 0.35,
      );
      mat.rotation.y = group.rotation.y;
    } else {
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.19),
        new THREE.MeshBasicMaterial({ map: numberTexture("→") }),
      );
      plate.position.set(d.width / 2, 2.04, 0.065);
      hinge.add(plate);
    }
    doorObjects.set(d.id, { group, hinge });
  }
  function rebuild(newLevel) {
    alarmBlend = 0;
    const geometries = new Set(),
      materials = new Set();
    root.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) materials.add(o.material);
    });
    for (const g of geometries) g.dispose();
    const shared = new Set([
      wallMat,
      floorMat,
      ceilingMat,
      steelMat,
      trimMat,
      hardwareMat,
      glowMat,
      poolMat,
    ]);
    for (const m of materials)
      if (!shared.has(m)) {
        m.map?.dispose();
        m.dispose();
      }
    scene.remove(root);
    root = new THREE.Group();
    scene.add(root);
    doorObjects = new Map();
    fixtures = [];
    level = newLevel;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE * CELL, SIZE * CELL),
      floorMat,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(((SIZE - 1) * CELL) / 2, 0, ((SIZE - 1) * CELL) / 2);
    floor.receiveShadow = true;
    root.add(floor);
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE * CELL, SIZE * CELL),
      ceilingMat,
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.copy(floor.position);
    ceiling.position.y = 2.95;
    root.add(ceiling);
    for (let z = 0; z < SIZE; z++)
      for (let x = 0; x < SIZE; x++)
        if (!isWall(level, x, z)) {
          for (const v of DIRECTIONS)
            if (isWall(level, x + v.x, z + v.z)) {
              const wx = x * CELL + (v.x * CELL) / 2,
                wz = z * CELL + (v.z * CELL) / 2;
              if (
                level.apartments.some(
                  (d) => Math.abs(d.x - wx) < 0.01 && Math.abs(d.z - wz) < 0.01,
                )
              )
                continue;
              const mesh = box(
                CELL + 0.015,
                2.95,
                0.15,
                wallMat,
                wx,
                1.475,
                wz,
              );
              mesh.rotation.y = Math.atan2(v.x, v.z);
              const trim = box(CELL + 0.025, 0.12, 0.19, trimMat, wx, 0.06, wz);
              trim.rotation.y = mesh.rotation.y;
            }
        }
    for (const edge of level.edges) {
      const start = level.nodes[edge.from];
      for (const j of [1, 3, 5, 7]) {
        const x = (start.x + edge.dx * j) * CELL,
          z = (start.z + edge.dz * j) * CELL;
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        g.rotation.y = Math.atan2(edge.dx, edge.dz);
        root.add(g);
        box(0.87, 0.065, 0.76, trimMat, 0, 2.89, 0, g);
        for (const sx of [-0.27, -0.09, 0.09, 0.27])
          box(0.105, 0.018, 0.63, glowMat, sx, 2.846, 0, g);
        fixtures.push(new THREE.Vector3(x, 2.69, z));
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.8), poolMat);
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(x, 0.009, z);
        root.add(pool);
      }
    }
    [...level.doors, ...level.apartments].forEach(mountDoor);
    monsterMesh.visible = monsterGlow.visible = contactShadow.visible = false;
  }
  const renderTarget = new THREE.WebGLRenderTarget(innerWidth, innerHeight);
  const postScene = new THREE.Scene(),
    postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postMaterial = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: renderTarget.texture },
      aspect: { value: innerWidth / innerHeight },
    },
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,1.0);}",
    fragmentShader:
      "uniform sampler2D map;uniform float aspect;varying vec2 vUv;void main(){vec2 p=(vUv-.5)*vec2(aspect,1.0)*2.0;float r=length(p);vec2 uv=.5+(vUv-.5)*(1.0+.35*r*r);vec3 color=texture2D(map,uv).rgb;float vignette=1.0-smoothstep(.44,.77,r);color*=vignette;float rim=smoothstep(.74,.75,r)*(1.0-smoothstep(.77,.79,r));color+=vec3(.16,.13,.08)*rim;if(r>.79)color=vec3(.007,.009,.006);gl_FragColor=vec4(color,1.0);}",
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));
  let lightTimer = 0,
    alarmBlend = 0;
  const normalLight = new THREE.Color(0xe3edaa),
    redLight = new THREE.Color(0xff0305);
  const normalSky = new THREE.Color(0xd8d2a5),
    redSky = new THREE.Color(0xf9080b);
  const normalTorch = new THREE.Color(0xffe7b2),
    redTorch = new THREE.Color(0xff5144);
  function update(
    dt,
    time,
    m,
    { hidden, peek, flashlightOn, peaceful, alert = false },
  ) {
    alarmBlend +=
      ((alert && !peaceful ? 1 : 0) - alarmBlend) * (1 - Math.exp(-dt * 4.5));
    dynamicLights.forEach((l) =>
      l.color.copy(normalLight).lerp(redLight, alarmBlend),
    );
    glowMat.color.copy(normalLight).lerp(redLight, alarmBlend);
    ambient.color.copy(normalSky).lerp(redSky, alarmBlend);
    flashlight.color.copy(normalTorch).lerp(redTorch, alarmBlend);
    flashlight.intensity = 19 * (1 - alarmBlend * 0.35);
    lightTimer -= dt;
    if (lightTimer <= 0) {
      lightTimer = 0.3;
      const sorted = [...fixtures].sort(
        (a, b) =>
          a.distanceToSquared(camera.position) -
          b.distanceToSquared(camera.position),
      );
      dynamicLights.forEach((light, i) => {
        if (sorted[i]) light.position.copy(sorted[i]);
      });
    }
    dynamicLights.forEach(
      (light, i) =>
        (light.intensity = 4.7 * (0.97 + 0.03 * Math.sin(time * 12 + i * 7))),
    );
    ambient.intensity = hidden && !peek ? 0.24 : 0.72;
    flashlight.visible = flashlightOn && !hidden;
    for (const d of [...level.doors, ...level.apartments]) {
      const desired = d.open ? 1.43 : 0;
      d.angle += (desired - d.angle) * (1 - Math.exp(-dt * 7));
      doorObjects.get(d.id).hinge.rotation.y = d.angle;
    }
    monsterMesh.visible =
      monsterGlow.visible =
      contactShadow.visible =
        !["dormant", "lurking"].includes(m.state) && !peaceful;
    if (monsterMesh.visible) {
      const view = spriteView(
        m.heading,
        m,
        camera.position,
        m.state === "chase" && m.distance < 7,
      );
      m.frame = view.frame;
      monsterMaterial.map = sprites[view.frame];
      monsterMesh.scale.x = view.flip ? -1 : 1;
      monsterMesh.rotation.y = Math.atan2(
        camera.position.x - m.x,
        camera.position.z - m.z,
      );
      monsterMesh.position.set(m.x, 1.195 + Math.sin(time * 7) * 0.035, m.z);
      monsterGlow.position.set(m.x, 1.15, m.z);
      contactShadow.position.set(m.x, 0.018, m.z);
      monsterMaterial.color.setScalar(m.state === "chase" ? 0.85 : 0.67);
    }
  }
  function render(peek = false) {
    if (peek) {
      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCamera);
    } else renderer.render(scene, camera);
  }
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderTarget.setSize(innerWidth, innerHeight);
    postMaterial.uniforms.aspect.value = innerWidth / innerHeight;
  }
  return {
    renderer,
    scene,
    camera,
    flashlight,
    rebuild,
    update,
    render,
    resize,
    monsterMesh,
    doorObjects: () => doorObjects,
    sprites,
  };
}
