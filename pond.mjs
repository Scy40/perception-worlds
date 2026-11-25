import * as THREE from './vendor/three.module.js';

const WATER = -1.42;
const SPEED = 2.78;
export const ECHO_DURATION = 5.4;
const ORIGIN = new THREE.Vector3(-0.33, WATER, -1.42);
const TARGETS = [
  { point: new THREE.Vector3(0.26, -0.92, -4.19), name: '木台睡莲' },
  { point: new THREE.Vector3(-0.55, -0.56, -7.12), name: '垂穗花廊' },
  { point: new THREE.Vector3(2.08, -0.48, -12.25), name: '白石后的水岸' },
];

function travelTime(p, origin) {
  return Math.hypot(p.x - origin.x, (p.y - origin.y) * 0.52, p.z - origin.z) / SPEED;
}

function noise(seed) {
  const n = Math.sin(seed * 91.337 + 17.77) * 43758.5453123;
  return n - Math.floor(n);
}

export function shore(angle, offset = 0) {
  const s = Math.sin(angle), c = Math.cos(angle);
  const z = -10 + (22 + offset) * c;
  const bend = 0.59 + Math.sin((z + 6) * 0.17) * 1.05;
  const width = (s < 0 ? 4.2 : 5.1) + 0.51 * Math.sin(angle * 5.0) + 0.26 * Math.cos(angle * 9.0);
  const x = bend + (width + offset) * s;
  return new THREE.Vector3(x, WATER, z);
}

const wave = String.raw`
  uniform float uAge;
  uniform float uEcho;
  uniform vec3 uOrigin;
  uniform float uAim;
  uniform vec2 uHeading;
  float directionReturn(vec3 p) {
    if (uAim > 1.5) return 1.0;
    vec3 d = p - uOrigin;
    vec2 aimDirection = uHeading + vec2(-uHeading.y, uHeading.x) * uAim * 0.72;
    return 0.22 + 0.78 * smoothstep(0.50, 0.97, dot(normalize(d + vec3(0.001, 0.0, -0.001)),
      normalize(vec3(aimDirection.x, 0.07, aimDirection.y))));
  }
  float arrival(vec3 p) {
    vec3 offset = p - uOrigin;
    offset.y *= 0.52;
    return length(offset) / 2.78;
  }
  float reveal(vec3 p) {
    if (uAge < 0.0) return 0.0;
    float elapsed = uAge - arrival(p);
    return smoothstep(-0.075, 0.19, elapsed) * exp(-max(elapsed, 0.0) * 1.26) * directionReturn(p);
  }
  float crest(vec3 p, float pause) {
    if (uAge < 0.0) return 0.0;
    float delta = (uAge - arrival(p) - pause) * 8.50;
    return exp(-delta * delta) * directionReturn(p);
  }
`;

const moving = String.raw`
  uniform float uTime;
  uniform float uWind;
  uniform vec3 uPerch;
  uniform float uLanding;
  vec3 breeze(vec3 p) {
    float height = clamp(p.y + 1.38, 0.0, 6.0);
    float phase = p.x * 0.59 + p.z * 0.41;
    float sway = sin(0.94 * uTime + phase) + 0.31 * sin(1.91 * uTime + phase * 0.74);
    p.x += uWind * height * (2.1 - 0.85 * smoothstep(1.0, 3.0, height)) * sway;
    if (uLanding != 0.0) p.x += uLanding * uWind * height * (1.0 - smoothstep(0.13, 0.85, distance(p, uPerch)));
    p.z += uWind * height * 0.71 * cos(0.87 * uTime + phase);
    return p;
  }
`;

const vertexShader = String.raw`
  ${moving}
  varying vec3 vP;
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying vec3 vTint;
  varying vec2 vTexture;
  void main() {
    vec4 positionWorld = vec4(position, 1.0);
    vec3 normalWorld = normal;
    vTint = vec3(1.0);
    #ifdef USE_INSTANCING
      positionWorld = instanceMatrix * positionWorld;
      mat3 inst = mat3(instanceMatrix);
      normalWorld = inst * (normalWorld / vec3(dot(inst[0], inst[0]), dot(inst[1], inst[1]), dot(inst[2], inst[2])));
    #endif
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #endif
    vP = breeze((modelMatrix * positionWorld).xyz);
    vNormal = normalize(mat3(modelMatrix) * normalWorld);
    vLocal = position;
    vTexture = uv;
    gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0);
  }
`;

const fragmentShader = String.raw`
  ${wave}
  uniform vec3 uColor;
  uniform float uPattern, uReflectionPass, uPaintedLeaf, uWetLeaf, uOutlineInEcho;
  uniform sampler2D uReference;
  varying vec3 vP;
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying vec3 vTint;
  varying vec2 vTexture;
  void main() {
    if (uReflectionPass > 0.5 && vP.y < -1.421) discard;
    // The two broad dock leaves cross the flight path. Their traced edges
    // carry the echo while their daytime surfaces recede from the centre.
    if (uOutlineInEcho > 0.5 && uEcho > 0.15 &&
        abs(vTexture.y * 2.0 - 1.0) <= smoothstep(0.15, 0.72, uEcho)) discard;
    vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
    
        vec3 view = normalize(cameraPosition - vP);
    vec3 sun = normalize(vec3(-0.68, 0.68, 0.37));
    float diffuse = max(0.0, dot(n, sun));
    float rim = pow(1.0 - max(0.0, dot(n, view)), 2.8);
    float glint = pow(max(0.0, dot(n, normalize(sun + view))), 24.0);
    vec3 base = uColor * vTint;
    float axis = abs(vTexture.y - 0.5);
    float veins = (1.0 - smoothstep(0.006, 0.04, axis)) * 0.46
      + (1.0 - smoothstep(0.045, 0.17, abs(sin((vTexture.x * 10.0 + axis * 4.4) * 3.14159)))) * 0.32;
    if (uPattern > 0.5 && uPattern < 1.5) {
      float folds = sin(3.1416 * vTexture.y);
      float colorSheen = 0.5 + 0.5 * cos(vTexture.y * 10.0 - vTexture.x * 3.2);
      float textureGrain = sin(115.0 * vTexture.x + sin(vTexture.y * 53.0) * 1.6)
        * cos(152.0 * vTexture.y + vTexture.x * 30.0);
      base *= 0.74 + 0.39 * folds + veins * 0.22 + textureGrain * 0.035;
      base = mix(base, vec3(0.90, 0.32, 0.28), colorSheen * folds * 0.24);
      base += vec3(0.24, 0.09, 0.106) * rim;
      if (uPaintedLeaf > 0.5) {
        float t = vTexture.x;
        vec2 painted = vec2(0.045 + 0.386 * t,
          mix(0.255, 0.407, t) + (vTexture.y - 0.5) * (0.04 + 0.21 * (1.0 - t)));
        vec3 pigment = texture2D(uReference, painted).rgb;
        base = mix(base, pigment, 0.68 + 0.12 * diffuse);
      }
    }
    if (uPattern > 1.5 && uPattern < 2.5) {
      float grain = sin(vP.x * 61.0 + sin(vP.z * 8.0) + vP.y * 65.0);
      base *= 0.94 + 0.055 * grain + 0.019 * sin(vP.z * 107.0 + sin(vP.x * 28.0));
    }
    if (uPattern > 2.5 && uPattern < 3.5) {
      float rough = pow(abs(sin(vP.x * 21.0 + sin(vP.z * 8.3) * 2.1)
        * cos(vP.z * 17.2 - sin(vP.x * 5.1))), 1.8);
      float variation = 0.5 + 0.5 * sin(vP.x * 3.0 + sin(vP.z * 5.8)) * cos(vP.z * 4.2);
      base = mix(base, vec3(0.36, 0.21, 0.41), variation * 0.27 + rough * 0.28);
    }
    if (uPattern > 3.5) {
      float fleck = sin(vLocal.x * 31.0 + vLocal.y * 17.0) * cos(vLocal.z * 23.0 - vLocal.y * 21.0);
      base *= 0.91 + fleck * 0.08;
    }
    if (uWetLeaf > 0.5 && n.y > 0.25) {
      vec2 v = (vTexture - 0.5) * 2.0;
      float r = length(v);
      float theta = atan(v.y, v.x);
      float spokes = sin(theta * 7.0 + sin(theta * 3.0) * 0.58 + r * 0.26);
      float major = 1.0 - smoothstep(0.02, 0.14, abs(spokes));
      float branch = 1.0 - smoothstep(0.05, 0.16, abs(sin(theta * 16.0 - r * 5.8 + cos(theta * 5.0) * 0.35)));
      float network = (0.18 * major + 0.035 * branch * smoothstep(0.20, 0.67, r)) * (1.0 - smoothstep(0.75, 1.04, r));
      base = mix(base, vec3(0.58, 0.63, 0.32), network + smoothstep(0.82, 1.0, r) * 0.14);
    }
    vec3 day = base * (0.71 + 0.49 * diffuse)
      + vec3(0.115, 0.077, 0.117) * rim + vec3(0.24, 0.172, 0.25) * glint;
    float strength = reveal(vP);
    float front = crest(vP, 0.0);
    vec3 source = normalize(uOrigin - vP + vec3(0.00001));
    float incidence = pow(abs(dot(n, source)), 1.45);
    float spread = 0.5 + 0.5 * (sin(vP.x * 6.0 + vP.y * 6.6 + cos(vP.z * 5.2))
      * cos(vP.z * 8.6 - vP.y * 3.1 - vP.x * 4.5));
    float note = smoothstep(0.26, 0.70, spread);
    float stipple = 0.63 + 0.37 * smoothstep(-0.18, 0.63,
      sin(vP.x * 43.0 + sin(vP.y * 37.0)) * cos(vP.z * 29.0 - vP.y * 37.5));
    float distanceFade = 1.0 - 0.91 * smoothstep(5.2, 26.0, distance(vP, uOrigin));
    float nearGain = 0.52 + 0.48 * smoothstep(0.03, 0.78, incidence);
    float timber = step(1.5, uPattern) * (1.0 - step(2.5, uPattern));
    float ground = step(2.5, uPattern) * (1.0 - step(3.5, uPattern));
    float leaf = step(0.5, uPattern) * (1.0 - step(1.5, uPattern));
    float broken = mix(note, 0.72 + 0.28 * note, timber);
    broken = mix(broken, 0.42 + 0.58 * incidence, max(leaf, uWetLeaf));
    float frond = step(3.5, uPattern);
    float filaments = 0.5 + 0.5 * cos(vP.y * 19.0 + vP.x * 9.0 + vP.z * 3.0);
    float secondReturn = frond * crest(vP, 0.26) * filaments;
    float envelope = (strength * (0.39 + leaf * 0.13) + front * 0.64 + secondReturn * 0.56) * nearGain
      * distanceFade * (1.0 - ground * 0.82);
    vec3 shade = mix(vec3(0.034, 0.15, 0.36), vec3(0.49, 0.75, 0.94), clamp(front * 0.84 + incidence * 0.37, 0.0, 1.0));
    float edgeReturn = front * rim * 0.14 * distanceFade * (1.0 - ground);
    float foldReturn = leaf * reveal(vP) * rim * 0.4 * distanceFade;
    vec3 night = vec3(0.0014, 0.0012, 0.0045) + shade * (envelope * broken * stipple + edgeReturn)
      + vec3(0.22, 0.17, 0.48) * foldReturn;
    float nearField = 1.0 - smoothstep(3.0, 15.0, distance(cameraPosition, vP));
    night += vec3(0.018, 0.023, 0.060) * nearField * (0.10 + rim * (0.54 + 0.48 * leaf) + 0.17 * abs(n.y));
    night += vec3(0.22, 0.37, 0.61) * timber * front * (0.24 + 0.32 * rim);
    night += vec3(0.25, 0.16, 0.46) * secondReturn * distanceFade;
    float sweepFold = 1.0 - smoothstep(0.055, 0.32, abs(sin(vTexture.y * 9.42 + vTexture.x * 2.3)));
    night += vec3(0.08, 0.17, 0.34) * leaf * sweepFold * strength * (0.32 + rim) * distanceFade;
    float thresholdGlow = 4.0 * uEcho * (1.0 - uEcho);
    night += vec3(0.23, 0.42, 0.62) * thresholdGlow * uPaintedLeaf * rim;
    float fog = smoothstep(6.0, 40.0, distance(vP, cameraPosition));
    day = mix(day, vec3(0.55, 0.49, 0.75), fog * 0.96);
    night = mix(night, vec3(0.0005, 0.0012, 0.0025), fog * 0.86);
    gl_FragColor = vec4(mix(day, night, uEcho), 1.0);
    #include <colorspace_fragment>
  }
`;

export function makePond({ reflections = true, compact = false } = {}) {
  const scene = new THREE.Scene();
  const reference = { value: null }, painted = { value: 0 };
  new THREE.TextureLoader().load('./assets/sleeping-lotus.png', texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    reference.value = texture;
    painted.value = 1;
  }, undefined, () => console.warn('睡莲贴图未加载，继续使用程序生成的叶色。'));
  const uTime = { value: 0 }, uAge = { value: -1 }, uEcho = { value: 0 };
  const uOrigin = { value: ORIGIN.clone() };
  const uAim = { value: 2 };
  const uHeading = { value: new THREE.Vector2(0, -1) };
  const uReflectionPass = { value: 0 };
  const uPerch = { value: ORIGIN.clone() }, uLanding = { value: 0 };
  const shared = { uTime, uAge, uEcho, uOrigin, uAim, uHeading, uReflectionPass, uPerch, uLanding };

  function material(color, pattern = 0, wind = 0, paintedLeaf = false, wetLeaf = false) {
    return new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader, fragmentShader,
      uniforms: {
        ...shared, uWind: { value: wind }, uColor: { value: new THREE.Color(color) }, uPattern: { value: pattern },
        uReference: reference, uPaintedLeaf: paintedLeaf ? painted : { value: 0 }, uWetLeaf: { value: wetLeaf ? 1 : 0 },
        uOutlineInEcho: { value: 0 },
      },
    });
  }

  const sky = new THREE.Mesh(new THREE.SphereGeometry(82, 40, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime, uEcho },
    vertexShader: String.raw`
      varying vec3 vD;
      void main() {
        vD = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: String.raw`
      uniform float uTime, uEcho;
      varying vec3 vD;
      float haze(vec3 p) {
        return sin(p.x * 6.5 + p.y * 8.1) * cos(p.z * 7.7 - p.y * 5.4)
          + sin(p.z * 10.3 + p.x * 8.1) * 0.37 + cos(p.x * 19.0 - p.y * 10.0) * 0.17;
      }
      void main() {
        vec3 d = normalize(vD);
        float height = smoothstep(-0.065, 0.39, d.y);
        vec3 color = mix(vec3(0.72, 0.61, 0.90), vec3(0.15, 0.47, 0.96), height);
        vec3 a = d * vec3(1.0, 1.8, 1.0);
        a.x += uTime * 0.006;
        float cloud = smoothstep(0.38, 1.22, haze(a)) * (1.0 - smoothstep(0.25, 0.67, d.y));
        color = mix(color, vec3(0.84, 0.71, 0.92), cloud * 0.48);
        float sun = max(0.0, dot(normalize(vec3(-0.50, 0.33, -0.80)), d));
        color += vec3(0.27, 0.16, 0.16) * pow(sun, 10.0) + vec3(0.53, 0.40, 0.31) * pow(sun, 170.0);
        vec3 night = mix(vec3(0.0017, 0.0034, 0.0070), vec3(0.0007, 0.0011, 0.0026), height);
        gl_FragColor = vec4(mix(color, night, uEcho), 1.0);
        #include <colorspace_fragment>
      }
    `,
  }));
  sky.renderOrder = -100;
  scene.add(sky);

  const poolReflection = new THREE.WebGLRenderTarget(384, 216);
  const reflectionProjection = new THREE.Matrix4();
  const reflectedCamera = new THREE.PerspectiveCamera();
  const emissionDirection = new THREE.Vector3();
  const reflectedUp = new THREE.Vector3();
  const aim = new THREE.Vector3();
  let reflectedAt = -Infinity;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(143, 143), new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      ...shared, uPassage: {value:0}, uReflect: {value:0}, uReflectedScene: { value: poolReflection.texture }, uReflectionProjection: { value: reflectionProjection },
    },
    vertexShader: String.raw`
      varying vec3 vP;
      void main() {
        vP = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0);
      }
    `,
    fragmentShader: String.raw`
      ${wave}
      uniform float uTime;
      uniform float uPassage;
      uniform float uReflect;
      uniform sampler2D uReflectedScene;
      uniform mat4 uReflectionProjection;
      varying vec3 vP;
      void main() {
        float offsetX=(vP.x-.76)/2.62;
        float floorY=-1.27-4.05*smoothstep(17.7,27.,-vP.z);
        float roofY=floorY+.16+3.18*sqrt(max(0.,1.-offsetX*offsetX));
        if(uPassage>.5 && vP.z< -17.7 && abs(offsetX)<1. && floorY<vP.y && roofY>vP.y)discard;
        vec3 view = normalize(cameraPosition - vP);
        vec2 p = vP.xz;
        float r1 = sin(p.y * 8.2 + sin(p.x * 4.2 + uTime * 0.6) * 0.74 - uTime * 1.1);
        float r2 = sin(p.y * 17.0 + p.x * 2.1 + sin(p.x * 11.7 - uTime * 0.7) * 0.55 + uTime * 1.34);
        float fresnel = pow(1.0 - abs(view.y), 2.1);
        vec3 night = vec3(0.0010, 0.0021, 0.0047);
        float colorPatch = 0.5 + 0.5 * sin(p.x * 1.28 + 0.73 * sin(p.y * 0.73));
        vec3 day = mix(vec3(0.095, 0.27, 0.57), vec3(0.40, 0.36, 0.62), fresnel * 0.72);
        day = mix(day, vec3(0.57, 0.33, 0.55), colorPatch * fresnel * 0.29);
        float specular = pow(max(0.0, r1 * 0.53 + r2 * 0.47), 5.0);
        float shimmer = 0.24 + 0.43 * max(0.0, sin(p.x * 1.42 + 0.5));
        day += vec3(0.27, 0.22, 0.40) * (0.055 * r1 + specular * shimmer);
        if (uReflect > 0.5 && uEcho < 0.99) {
          vec4 plane = uReflectionProjection * vec4(vP, 1.0);
          vec2 sampleSpot = plane.xy / (2.0 * plane.w) + 0.5;
          sampleSpot += vec2(r1 * 0.0021 + r2 * 0.0014, r1 * 0.0036);
          float bounds = smoothstep(0.0, 0.045, sampleSpot.x) * (1.0 - smoothstep(0.955, 1.0, sampleSpot.x))
            * smoothstep(0.0, 0.035, sampleSpot.y) * (1.0 - smoothstep(0.965, 1.0, sampleSpot.y));
          vec3 reflected = texture2D(uReflectedScene, clamp(sampleSpot, 0.0, 1.0)).rgb;
          day = mix(day, reflected * vec3(0.77, 0.79, 0.94), bounds * (0.20 + fresnel * 0.34));
        }
        float nearWave = crest(vP, 0.0);
        float breaks = 0.38 + 0.62 * smoothstep(-0.15, 0.6, sin(p.x * 3.7 + p.y * 1.82) * cos(p.x * 2.3 - p.y * 0.6));
        float shore = smoothstep(1.9, 4.5, abs(p.x - 0.52));
        float bankMemory = (1.0 - smoothstep(3.0, 14.0, distance(cameraPosition, vP))) * (0.14 + shore * 0.51);
        night += vec3(0.009, 0.016, 0.034) * bankMemory * (0.72 + 0.28 * r1);
        night += vec3(0.10, 0.22, 0.47) * breaks * nearWave * (0.19 + 0.55 * shore);
        gl_FragColor = vec4(mix(day, night, uEcho), 1.0);
        #include <colorspace_fragment>
      }
    `,
  }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER;
  water.name='lake-surface';
  scene.add(water);

  function reflect(renderer, camera, milliseconds) {
    if (!reflections || uEcho.value > 0.86 || milliseconds - reflectedAt < 150) return;
    reflectedAt = milliseconds;
    camera.updateMatrixWorld();
    reflectedCamera.position.set(camera.position.x, 2 * WATER - camera.position.y, camera.position.z);
    camera.getWorldDirection(emissionDirection);
    emissionDirection.y = -emissionDirection.y;
    reflectedUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    reflectedUp.y = -reflectedUp.y;
    reflectedCamera.up.copy(reflectedUp);
    reflectedCamera.lookAt(aim.copy(reflectedCamera.position).add(emissionDirection));
    reflectedCamera.projectionMatrix.copy(camera.projectionMatrix);
    reflectedCamera.updateMatrixWorld();
    reflectionProjection.multiplyMatrices(reflectedCamera.projectionMatrix, reflectedCamera.matrixWorldInverse);
    const target = renderer.getRenderTarget();
    water.visible = false;
    uReflectionPass.value = 1;
    renderer.setRenderTarget(poolReflection);
    renderer.render(scene, reflectedCamera);
    water.material.uniforms.uReflect.value = 1;
    renderer.setRenderTarget(target);
    uReflectionPass.value = 0;
    water.visible = true;
  }

  const terrainVertices = [], terrainIndices = [];
  const segments = 180;
  const heights = [[-0.44, -0.18], [0.0, -0.028], [0.41, 0.15], [1.05, 0.35],
    [2.2, 0.40], [5.2, 0.57], [11, 0.86], [22, 1.14], [46, 1.55], [72, 1.84]];
  function landPoint(theta, offset, height) {
    const p = shore(theta, offset);
    const fold = 0.15 + 0.30 * Math.sin(theta * 5.54) ** 2 + 0.15 * Math.sin(theta * 11.11) ** 2;
    p.y += height + fold * Math.min(1.8, Math.max(0, offset) * 0.36);
    return p;
  }
  for (let level = 0; level < heights.length; level++) {
    for (let block = 0; block < segments; block++) {
      const point = landPoint(block / segments * Math.PI * 2, ...heights[level]);
      terrainVertices.push(...point.toArray());
      if (level < heights.length - 1) {
        const a = level * segments + block, b = level * segments + (block + 1) % segments;
        terrainIndices.push(a, b, a + segments, b, b + segments, a + segments);
      }
    }
  }
  const terrainGeometry = new THREE.BufferGeometry();
  terrainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(terrainVertices, 3));
  terrainGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(terrainVertices.length * 2 / 3), 2));
  terrainGeometry.setIndex(terrainIndices);
  terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeometry, material('#8f9b86', 3));
  scene.add(terrain);

  const fixedVeins = [], windVeins = [], leaves = [];
  const edge = (list, a, b, color) => {
    const c = new THREE.Color(color);
    list.push(...a.toArray(), ...c.toArray(), ...b.toArray(), ...c.toArray());
  };
  function trace(list, points, color) {
    for (let i = 1; i < points.length; i++) edge(list, points[i - 1], points[i], color);
  }
  function lines(data, wind) {
    const geometry = new THREE.BufferGeometry();
    const positions = [], colors = [];
    for (let i = 0; i < data.length; i += 6) {
      positions.push(data[i], data[i + 1], data[i + 2]);
      colors.push(data[i + 3], data[i + 4], data[i + 5]);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexColors: true,
      uniforms: { ...shared, uWind: { value: wind } },
      vertexShader: String.raw`
        ${moving}
        varying vec3 vP;
        varying vec3 vColor;
        void main() {
          vP = breeze((modelMatrix * vec4(position, 1.0)).xyz);
          vColor = color;
          gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0);
        }
      `,
      fragmentShader: String.raw`
        ${wave}
        varying vec3 vP;
        varying vec3 vColor;
        void main() {
          float response = reveal(vP);
          float front = crest(vP, 0.0);
          float fog = 1.0 - smoothstep(10.0, 36.0, distance(vP, cameraPosition));
          vec3 ink = mix(vec3(0.37, 0.61, 0.89), vec3(0.88, 0.95, 1.0), clamp(front * 0.62 + vColor.r * 0.27, 0.0, 1.0));
          gl_FragColor = vec4(ink, uEcho * fog * min(0.97, response * 0.90 + front * 0.58));
          #include <colorspace_fragment>
        }
      `,
    });
    const object = new THREE.LineSegments(geometry, mat);
    object.renderOrder = 4;
    scene.add(object);
    return object;
  }

  const coast = [];
  for (let i = 0; i <= 180; i++) coast.push(shore(i / 180 * Math.PI * 2, 0.08).add(new THREE.Vector3(0, 0.035, 0)));
  trace(fixedVeins, coast, '#849dda');

  const meshMatrix = new THREE.Matrix4();
  const identity = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const rounded = new THREE.DodecahedronGeometry(1, 1);
  const stemGeometry = new THREE.CylinderGeometry(1, 1, 1, 7);
  const twigs = [], fruits = [], rocks = [], reeds = [];
  const paint = (position, scale, color, rotation = identity) => ({ position, scale, color, rotation });

  function sprig(a, b, radius, color, list = twigs, outline = true) {
    const direction = b.clone().sub(a);
    list.push(paint(a.clone().lerp(b, 0.5), new THREE.Vector3(radius, direction.length(), radius), color,
      new THREE.Quaternion().setFromUnitVectors(up, direction.normalize())));
    if (outline) trace(windVeins, [a, b], '#99a6ec');
  }
  function instantiate(geometry, entries, mat) {
    const mesh = new THREE.InstancedMesh(geometry, mat, entries.length);
    entries.forEach((item, i) => {
      meshMatrix.compose(item.position, item.rotation, item.scale);
      mesh.setMatrixAt(i, meshMatrix);
      mesh.setColorAt(i, new THREE.Color(item.color));
    });
    scene.add(mesh);
    return mesh;
  }

  const swaying = 0.023;
  const rockColors = ['#f5d9d0', '#c9a7c4', '#dfd3e0', '#bab3cf'];
  const clusterColors = ['#ef9eb7', '#f7bed4', '#d79dd7', '#e2badf', '#f3c5c4', '#c2accf', '#e9b1da'];
  const reedColors = ['#9caf9d', '#c9add3', '#aaabc6', '#dca1b3', '#9eb8ae', '#ad96c3'];

  function blossomGeometry() {
    const primitive = new THREE.IcosahedronGeometry(1, 0);
    const original = primitive.getAttribute('position');
    const positions = [], normals = [], coordinates = [];
    const point = new THREE.Vector3(), normal = new THREE.Vector3();
    for (let flower = 0; flower < (compact ? 3 : 6); flower++) {
      const around = flower * 2.399;
      const breadth = flower === 0 ? 0.04 : 0.43 + noise(flower + 102) * 0.28;
      const center = new THREE.Vector3(Math.cos(around) * breadth,
        (noise(flower + 14) - 0.34) * 0.74, Math.sin(around) * breadth);
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        (noise(flower + 21) - 0.45) * 1.4, around, (noise(flower + 68) - 0.49) * 1.5));
      for (let petal = 0; petal < 5; petal++) {
        const a = petal / 5 * Math.PI * 2;
        const spin = new THREE.Quaternion().setFromAxisAngle(up, a);
        for (let vertex = 0; vertex < original.count; vertex++) {
          point.fromBufferAttribute(original, vertex);
          normal.set(point.x / 0.31, point.y / 0.126, point.z / 0.19).applyQuaternion(spin).applyQuaternion(tilt).normalize();
          point.set(point.x * 0.31 + 0.21, point.y * 0.126, point.z * 0.19).applyQuaternion(spin);
          point.y += 0.045;
          point.applyQuaternion(tilt).add(center);
          positions.push(...point.toArray());
          normals.push(...normal.toArray());
          coordinates.push(0.5, 0.5);
        }
      }
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    result.setAttribute('uv', new THREE.Float32BufferAttribute(coordinates, 2));
    return result;
  }

  for (let i = 0; i < 74; i++) {
    const angle = (i + noise(i + 3)) / 74 * Math.PI * 2;
    const root = landPoint(angle, 0.035 + noise(i + 40) * 0.47, 0.01);
    const size = 0.16 + noise(i + 70) ** 3 * 0.65;
    rocks.push(paint(root, new THREE.Vector3(size * 1.6, size * 0.57, size * 0.98),
      rockColors[i % rockColors.length], new THREE.Quaternion().setFromAxisAngle(up, angle + i)));
  }
  rocks.push(paint(new THREE.Vector3(-1.84, -1.44, -2.14), new THREE.Vector3(1.11, 0.44, 0.83), '#a694b6'));
  rocks.push(paint(new THREE.Vector3(3.18, -1.39, -6.75), new THREE.Vector3(1.10, 0.47, 0.81), '#efccd0'));

  function floweringTree(root, height, seed) {
    const drift = noise(seed + 4) * 0.7 - 0.35;
    const mid = root.clone().add(new THREE.Vector3(drift * height * 0.28, height * 0.49, 0.04));
    const top = root.clone().add(new THREE.Vector3(drift * height * 0.5, height * 0.87, 0.06));
    sprig(root, mid, height * 0.019, '#9b829d');
    sprig(mid, top, height * 0.012, '#a383ac');
    for (let branch = 0; branch < 5; branch++) {
      const index = seed * 17 + branch * 9;
      const a = branch * 2.399 + seed;
      const stem = mid.clone().lerp(top, 0.29 + 0.6 * noise(index));
      const extent = height * (0.12 + noise(index + 1) * 0.17);
      const crown = stem.clone().add(new THREE.Vector3(Math.cos(a) * extent, height * (0.12 + noise(index + 2) * 0.20), Math.sin(a) * extent));
      const fork = stem.clone().lerp(crown, 0.51).add(new THREE.Vector3(0, -height * 0.028, 0));
      sprig(stem, fork, height * 0.009, '#9f7aa3');
      sprig(fork, crown, height * 0.006, '#af90b7');
      for (let bloom = 0; bloom < 5; bloom++) {
        const offset = height * (0.043 + noise(index + bloom + 6) * 0.064);
        const h = 0.15 + bloom * 2.399 + index;
        const spot = crown.clone().add(new THREE.Vector3(Math.cos(h) * offset, height * (noise(h) - 0.3) * 0.065, Math.sin(h) * offset));
        const size = height * (0.076 + noise(h + 7) * 0.051);
        fruits.push(paint(spot, new THREE.Vector3(size * 1.32, size * 0.87, size), clusterColors[(bloom + branch + seed) % clusterColors.length]));
        edge(windVeins, crown, spot, '#c4a2f3');
      }
    }
  }

  for (let i = 0; i < 38; i++) {
    const angle = (i / 38 + (noise(i + 700) - 0.5) * 0.016) * Math.PI * 2;
    const offset = 1.3 + noise(i + 52) * 3.5;
    floweringTree(landPoint(angle, offset, 0.32), 1.6 + noise(i + 23) * 3.1, i + 2);
  }
  floweringTree(new THREE.Vector3(4.1, -1.0, -7.7), 3.15, 19);
  floweringTree(new THREE.Vector3(-4.1, -0.95, -8.64), 4.0, 24);

  for (let i = 0; i < 214; i += compact ? 2 : 1) {
    const theta = noise(i + 91) * Math.PI * 2;
    const offset = 0.18 + noise(i + 56) * 2.75;
    const root = landPoint(theta, offset, 0.15 + offset * 0.09);
    if (root.z > -6.0 && root.z < -3.6 && root.x > -3.65 && root.x < -2.54) continue;
    const height = 0.11 + noise(i + 78) ** 2 * 0.77;
    for (let j = 0; j < 3; j++) {
      const a = i * 0.7 + j * 2.4;
      const length = height * (0.69 + noise(a + 14) * 0.42);
      const top = root.clone().add(new THREE.Vector3(Math.cos(a) * length * 0.41, length, Math.sin(a) * length * 0.41));
      const direction = top.clone().sub(root);
      const width = length * (0.085 + noise(a) * 0.09);
      reeds.push(paint(root.clone().lerp(top, 0.54), new THREE.Vector3(width, direction.length() * 0.59, width * 0.60),
        reedColors[(i + j) % reedColors.length], new THREE.Quaternion().setFromUnitVectors(up, direction.normalize())));
      if (height > 0.39) trace(windVeins, [root, top], '#bca0f2');
    }
    if (i % 5 === 0) {
      const head = root.clone().add(new THREE.Vector3(0.11, height + 0.21, -0.04));
      sprig(root, head, 0.012, '#8e9880', twigs, height > 0.30);
      for (let j = 0; j < 3; j++) {
        const center = head.clone().add(new THREE.Vector3((j - 1) * 0.055, noise(i + j) * 0.08, (j % 2) * 0.05));
        fruits.push(paint(center, new THREE.Vector3(0.080, 0.054, 0.077), clusterColors[(i + j) % clusterColors.length]));
      }
    }
  }

  function watersideGarden(root, size, seed) {
    for (let j = 0; j < 11; j++) {
      const angle = seed + 2.399 * j;
      const r = size * (0.18 + noise(seed + j) * 0.60);
      const branch = root.clone().add(new THREE.Vector3(Math.cos(angle) * r * 0.22, -0.13, Math.sin(angle) * r * 0.22));
      const duration = size * (0.58 + noise(seed * 2 + j) * 0.71);
      const tip = branch.clone().add(new THREE.Vector3(Math.cos(angle) * r, duration, Math.sin(angle) * r));
      const elbow = branch.clone().lerp(tip, 0.57).add(new THREE.Vector3(Math.cos(angle) * 0.08, 0, Math.sin(angle) * 0.08));
      sprig(branch, elbow, 0.012 + size * 0.007, '#9b7f9d');
      sprig(elbow, tip, 0.008 + size * 0.004, '#d58dae');
      for (const [k, connect] of [branch.clone().lerp(elbow, 0.6), elbow.clone(), elbow.clone().lerp(tip, 0.55)].entries()) {
        const direction = angle + (k % 2 === 0 ? 1.20 : -1.51);
        const length = size * (0.31 + 0.13 * noise(direction));
        const end = connect.clone().add(new THREE.Vector3(Math.cos(direction) * length * 0.68, length * 0.52, Math.sin(direction) * length * 0.68));
        reeds.push(paint(connect.clone().lerp(end, 0.50), new THREE.Vector3(length * 0.19, length * 0.53, length * 0.075),
          reedColors[(seed + j + 2 * k) % reedColors.length],
          new THREE.Quaternion().setFromUnitVectors(up, end.sub(connect).normalize())));
      }
      const color = clusterColors[(seed + j) % clusterColors.length];
      const blossoming = size * (0.112 + 0.11 * noise(seed * 3 + j));
      fruits.push(paint(tip, new THREE.Vector3(blossoming, blossoming, blossoming), color));
    }
  }
  for (const [side, from, to, step, seed] of [[1, -4.2, -17, -0.72, 17], [-1, -5.1, -17, -0.81, 74]]) {
    for (let z = from, n = 0; z > to; z += step, n++) {
      const theta = side * Math.acos(Math.max(-1, Math.min(1, (z + 10) / 22)));
      const root = landPoint(theta, 0.53 + noise(n + seed) * 0.83, 0.15);
      watersideGarden(root, 0.54 + noise(n * 5 + seed) * 0.54, seed + n);
    }
  }
  watersideGarden(new THREE.Vector3(-2.56, -1.22, -2.45), 0.72, 99);
  for (const [x, z, size, seed] of [[-1.46, -7.3, 0.87, 108], [-1.81, -8.4, 1.12, 109],
    [2.47, -12.46, 0.91, 113], [2.97, -13.05, 1.05, 116], [2.20, -16.58, 1.25, 121]]) {
    watersideGarden(new THREE.Vector3(x, WATER, z), size, seed);
  }

  const wood = material('#d2aa9e', 2);
  const endWood = material('#a58185', 2);
  function box(x, y, z, w, h, d, surface, glowing = false) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const tile = new THREE.Mesh(geometry, surface);
    tile.position.set(x, y, z);
    scene.add(tile);
    if (!glowing) return tile;
    const upper = y + h / 2 + 0.008;
    const points = [[x - w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2],
      [x + w / 2, z - d / 2], [x - w / 2, z - d / 2]].map(([a, b]) => new THREE.Vector3(a, upper, b));
    trace(fixedVeins, points, '#86d5ff');
    return tile;
  }

  for (let i = 0; i < 5; i++) {
    box(-1.89, -1.09, -4.59 - i * 0.155, 4.18, 0.13, 0.149, wood, true);
    if (i < 4) box(-2.65, -0.95, -5.39 - i * 0.145, 2.66, 0.15, 0.141, wood, true);
  }
  for (let i = 0; i < 5; i++) box(-3.34, -1.09, -3.63 - i * 0.166, 1.23, 0.13, 0.161, wood, true);
  for (const [x, z] of [[-3.78, -3.63], [-2.88, -3.79], [-3.09, -5.14], [-1.50, -4.65], [-0.08, -4.7], [-1.51, -5.74]]) {
    box(x, -1.49, z, 0.15, z < -5.32 ? 0.98 : 0.69, 0.15, endWood);
  }

  function blade(path, width, side, depth, mat, color) {
    const curve = new THREE.CatmullRomCurve3(path);
    const rows = 28, cols = 16;
    const pushThrough = new THREE.Vector3(0, 0.35, 0.93).normalize();
    function locate(t, u, face) {
      const widen = Math.max(0.0015, Math.pow(Math.max(0.0, Math.sin(t * Math.PI)), 0.84) * (0.78 + 0.22 * t));
      const point = curve.getPoint(t).addScaledVector(side, width * widen * u);
      point.addScaledVector(pushThrough, (0.054 + width * 0.24) * u * u * widen + (0.009 + depth * widen * (1.0 - Math.abs(u))) * face);
      return point;
    }
    const positions = [], uv = [], indices = [];
    const layer = (rows + 1) * (cols + 1);
    const locateIndex = (v, u, side) => v * (cols + 1) + u + side * layer;
    for (let surface = 0; surface < 2; surface++) {
      for (let v = 0; v <= rows; v++) {
        for (let u = 0; u <= cols; u++) {
          const t = v / rows, q = (u / cols) * 2 - 1;
          positions.push(...locate(t, q, surface === 0 ? 1 : -1).toArray());
          uv.push(t, u / cols);
          if (v === rows || u === cols) continue;
          const a = locateIndex(v, u, surface), b = a + 1, c = a + cols + 1, d = c + 1;
          if (!surface) indices.push(a, c, b, b, c, d);
          else indices.push(a, b, c, b, d, c);
        }
      }
    }
    function bridge(a, b) { indices.push(a, b, b + layer, a, b + layer, a + layer); }
    for (let row = 0; row < rows; row++) {
      bridge(locateIndex(row, 0, 0), locateIndex(row + 1, 0, 0));
      bridge(locateIndex(row + 1, cols, 0), locateIndex(row, cols, 0));
    }
    for (let col = 0; col < cols; col++) {
      bridge(locateIndex(0, col + 1, 0), locateIndex(0, col, 0));
      bridge(locateIndex(rows, col, 0), locateIndex(rows, col + 1, 0));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mat);
    leaves.push(mesh);
    scene.add(mesh);
    const run = (f, color) => trace(windVeins, Array.from({ length: 30 }, (_, k) => f(k / 29)), color);
    for (const face of [1, -1]) for (const side of [-1, 1]) run(t => locate(t, side, face * 1.18), color);
    return locate;
  }

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const roseLeaf = material('#e66f9c', 1, swaying, true);
  const lilacLeaf = material('#d475a6', 1, swaying);
  roseLeaf.uniforms.uOutlineInEcho.value = lilacLeaf.uniforms.uOutlineInEcho.value = 1;
  const crownPaint = '#d9e8ff';
  blade([
    V(-2.22, -1.14, -2.45), V(-1.52, -0.59, -2.69), V(-0.91, -0.32, -2.98),
    V(-0.36, -0.21, -3.31), V(0.12, -0.032, -3.68),
  ], 0.59, V(-0.31, 0.74, -0.59), 0.031, roseLeaf, crownPaint);
  blade([V(-2.33, -1.13, -2.62), V(-1.98, -0.61, -2.77), V(-1.97, -0.19, -2.62), V(-2.18, 0.39, -2.78)],
    0.51, V(0.86, 0.13, 0.47), 0.023, lilacLeaf, crownPaint);

  for (let stem = 0; stem < 9; stem++) {
    const root = V(2.42 + noise(178 + stem) * 0.72, WATER - 0.07, -9.0 - noise(198 + stem) * 1.65);
    const joint = root.clone().add(V(0.07, 0.46 + noise(221 + stem) * 0.25, -0.06));
    const tip = joint.clone().add(V(0.11 + 0.07 * Math.sin(stem), 0.37 + noise(250 + stem) * 0.28, 0.02));
    sprig(root, joint, 0.014, '#8e9691');
    sprig(joint, tip, 0.011, '#aaa0ad');
    fruits.push(paint(tip, V(0.048, 0.13, 0.05), '#e4b8d5'));
  }

  const bankRoot = V(-2.91, -1.04, -5.78);
  const bend = V(-2.20, -0.47, -5.81);
  const crest = V(-1.44, -0.30, -5.82);
  const bloomTip = V(-0.64, -0.51, -5.64);
  const hook = V(-0.31, -0.71, -5.51);
  sprig(bankRoot, bend, 0.030, '#968e65');
  sprig(bend, crest, 0.020, '#a78b79');
  sprig(crest, bloomTip, 0.015, '#ad987d');
  sprig(bloomTip, hook, 0.011, '#be9b88');
  const petalMauve = material('#f3accd', 1, swaying);
  for (const [start, end, width] of [[bloomTip, V(-0.25, -0.60, -5.58), 0.119], [hook, V(0.06, -0.98, -5.28), 0.169]]) {
    const center = start.clone().lerp(end, 0.52).add(V(0.02, 0.045, 0));
    blade([start, center, end], width, V(0.52, 0.79, 0.23), 0.011, petalMauve, '#dcecff');
  }

  const ribbons = [material('#d996dc', 1, swaying), material('#f8b0b8', 1, swaying)];
  for (let i = 0; i < 5; i++) {
    const root = V(3.42 + i * 0.16, -1.32, -7.12 + i * 0.092);
    const top = root.clone().add(V((i - 2) * 0.31, 1.05 + noise(i + 39) * 0.62, -0.18 + i * 0.11));
    const curve = root.clone().lerp(top, 0.48).add(V(0.13, 0.08, 0.17));
    const tip = top.clone().add(V(0.35 - i * 0.19, -0.35 + i * 0.032, 0.13));
    blade([root, curve, top, tip], 0.19 + 0.065 * noise(i + 8), V(0.57, 0.31, 0.75), 0.013,
      ribbons[i % 2], '#cbe3ff');
  }

  // Closed petal meshes on rooted stems frame the insect's lower routes.
  const hanging = [material('#eed5f2', 1, swaying), material('#ffc6ce', 1, swaying), material('#c6b9fa', 1, swaying)];
  const blooms = [
    { root: V(-2.21, -1.24, -6.39), span: 0.82, height: 1.06, angle: 0.39 },
    { root: V(-1.82, -1.14, -6.85), span: 1.38, height: 1.34, angle: -0.19 },
    { root: V(-1.58, -1.29, -7.08), span: 1.08, height: 1.14, angle: 0.58 },
    { root: V(3.95, -1.42, -7.33), span: 0.94, height: 1.32, angle: 2.76 },
    { root: V(4.31, -1.31, -8.35), span: 0.99, height: 1.63, angle: 2.43 },
    { root: V(3.64, -1.34, -7.52), span: 0.91, height: 0.89, angle: 3.74 },
  ];
  for (const [i, { root, span, height, angle }] of blooms.entries()) {
    const grow = (u, rise) => root.clone().add(V(span * Math.cos(angle) * u, height * rise, span * Math.sin(angle) * u));
    const stem = [root, grow(0.23, 0.64), grow(0.66, 0.96), grow(0.96, 0.85), grow(1.12, 0.58)];
    const arc = new THREE.CatmullRomCurve3(stem).getPoints(8);
    for (let j = 1; j < arc.length; j++) sprig(arc[j - 1], arc[j], 0.021 - j * 0.0015, '#ab9386');
    for (let j = 0; j < 3; j++) {
      const start = grow(0.50 + j * 0.27, [0.89, 0.95, 0.73][j]);
      const offset = V((j - 1) * 0.12 + Math.cos(angle) * 0.16, -0.21 - j * 0.062, Math.sin(angle) * 0.13 + 0.20);
      const middle = start.clone().addScaledVector(offset, 0.55).add(V(0.07, 0.035, 0));
      const tip = start.clone().add(offset);
      blade([start, middle, tip], 0.066 + (i % 3) * 0.014 + j * 0.009,
        V(0.78, 0.31, 0.53), 0.008, hanging[(i + j) % 3], '#d2e6ff');
    }
  }
  rocks.push(paint(V(3.35, -1.43, -7.27), V(0.88, 0.53, 0.58), '#f7dfeb'));
  for (const [x, z, size] of [[-1.83, -6.90, .54], [-2.54, -6.13, .60], [4.14, -7.79, .72], [3.54, -8.62, .55]]) {
    watersideGarden(V(x, -1.33, z), size, Math.round((x + 9) * 11));
  }

  const petal = material('#f9a9cd', 0, swaying);
  const petalLight = material('#fbc6d9', 0, swaying);
  const heart = material('#f7bd70', 0, swaying);
  const lilyGreen = material('#99ae84', 0, swaying, false, true);
  function lotus(baseX, baseZ, lift, size, angle) {
    const foot = V(baseX, WATER - 0.03, baseZ);
    const root = V(baseX, WATER + lift, baseZ);
    sprig(foot, root, size * 0.045, '#8a946b');
    for (let row = 0; row < 3; row++) {
      const scale = size * (1 - row * 0.23);
      const count = 9 - row * 2;
      for (let i = 0; i < count; i++) {
        const a = angle + (i + row * 0.4) / count * Math.PI * 2;
        const direction = V(Math.cos(a), 0, Math.sin(a));
        const across = V(-Math.sin(a), 0.23, Math.cos(a)).normalize();
        const point = (length, y) => root.clone().addScaledVector(direction, scale * length).add(V(0, scale * y, 0));
        const geom = new THREE.SphereGeometry(1, 14, 10);
        const vertices = geom.getAttribute('position');
        for (let vertex = 0; vertex < vertices.count; vertex++) {
          const along = vertices.getX(vertex);
          const cross = vertices.getZ(vertex);
          vertices.setXYZ(vertex, along, vertices.getY(vertex) + 0.9 * along * along + 0.65 * cross * cross,
            cross * (0.92 - 0.44 * along));
        }
        geom.computeVertexNormals();
        const petalRadius = scale * 0.52;
        const center = point(0.55, 0.29 + row * 0.51);
        const piece = new THREE.Mesh(geom, row ? petalLight : petal);
        piece.geometry.scale(petalRadius, scale * 0.119, scale * 0.27);
        piece.geometry.rotateZ(0.38 + row * 0.31);
        piece.rotation.y = -a;
        piece.position.copy(center);
        scene.add(piece);
        const elongated = [point(0.14, 0.10 + row * 0.26), point(0.61, 0.41 + row * 0.55), point(1.05, 0.54 + row * 0.53)];
        for (const side of [-1, 1]) {
          const border = elongated.map((p, j) => p.clone().addScaledVector(across, side * scale * (j === 1 ? 0.28 : 0.032)));
          trace(windVeins, new THREE.CatmullRomCurve3(border).getPoints(10), '#fda9fc');
        }
      }
    }
    const seed = new THREE.Mesh(new THREE.SphereGeometry(size * 0.32, 13, 8), heart);
    seed.position.copy(root).y += size * 0.33;
    scene.add(seed);
  }
  function pad(x, z, size, rotation) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (let i = 0; i <= 42; i++) {
      const t = 0.17 + i / 42 * 5.93;
      const r = size * (0.95 + Math.sin(i * 0.41) * 0.051);
      shape.lineTo(Math.cos(t) * r, Math.sin(t) * r);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.022, steps: 1, bevelEnabled: false });
    const position = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < position.count; i++) {
      uv.setXY(i, 0.5 + position.getX(i) / (2 * size), 0.5 + position.getY(i) / (2 * size));
    }
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(rotation);
    const mesh = new THREE.Mesh(geo, lilyGreen);
    mesh.position.set(x, WATER + 0.018, z);
    scene.add(mesh);
    const origin = mesh.position.clone().add(V(0, 0.028, 0));
    const rim = [];
    for (let i = 0; i <= 42; i++) {
      const t = 0.17 + i / 42 * 5.93;
      const r = size * (0.95 + Math.sin(i * 0.41) * 0.051);
      const p = origin.clone().add(V(Math.cos(t + rotation) * r, 0, -Math.sin(t + rotation) * r));
      rim.push(p);
    }
    trace(windVeins, [origin, ...rim, origin], '#97dbfa');
  }

  lotus(-0.51, -4.008, 0.32, 0.25, 2.1);
  lotus(-1.03, -3.65, 0.18, 0.19, 0.5);
  lotus(0.23, -4.12, 0.18, 0.193, 0.7);
  lotus(0.22, -7.14, 0.16, 0.177, 1.58);
  lotus(-0.43, -7.73, 0.19, 0.173, 0.48);
  pad(-1.03, -3.47, 0.33, 1.4);
  pad(-0.49, -4.00, 0.29, 3.4);
  pad(0.45, -4.13, 0.31, 4.8);
  pad(0.99, -6.2, 0.22, 5.1);
  pad(-0.12, -6.87, 0.28, 0.18);
  pad(0.49, -7.03, 0.24, 2.1);
  pad(-0.60, -7.74, 0.26, 0.76);
  pad(0.27, -8.02, 0.24, 4.3);

  instantiate(rounded, rocks, material('#ffffff'));
  instantiate(stemGeometry, twigs, material('#ffffff', 0, swaying));
  instantiate(blossomGeometry(), fruits, material('#ffffff', 4, swaying));
  instantiate(rounded, reeds, material('#ffffff', 0, swaying));
  const staticLines = lines(fixedVeins, 0);
  const livingLines = lines(windVeins, swaying);

  function haloTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 47);
    gradient.addColorStop(0, '#fff6e7ff');
    gradient.addColorStop(0.18, '#fff2bfde');
    gradient.addColorStop(0.33, '#ffe3a84c');
    gradient.addColorStop(1, '#ffd78600');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 96, 96);
    return new THREE.CanvasTexture(canvas);
  }
  const halo = haloTexture();
  const bug = new THREE.Group();
  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.038, 18, 12),
    new THREE.MeshBasicMaterial({ color: '#ffcc68', transparent: true, depthWrite: false }));
  abdomen.scale.set(1, 0.83, 1.5);
  abdomen.position.z = 0.037;
  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#784b43', transparent: true, depthWrite: false }));
  thorax.position.z = -0.019;
  const wingMaterial = new THREE.MeshBasicMaterial({
    color: '#fee0ff', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
  });
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.bezierCurveTo(0.043, -0.023, 0.142, 0.03, 0.125, 0.055);
  wingShape.bezierCurveTo(0.10, 0.075, 0.041, 0.053, 0, 0);
  const wings = [-1, 1].map(side => {
    const hinge = new THREE.Group();
    hinge.position.x = side * 0.018;
    hinge.scale.x = side;
    const wing = new THREE.Mesh(new THREE.ShapeGeometry(wingShape, 12), wingMaterial);
    wing.rotation.x = Math.PI * 0.26;
    hinge.add(wing);
    return hinge;
  });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: halo, color: '#ffa935', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  bug.add(abdomen, thorax, glow, ...wings);
  scene.add(bug);

  // Short wing-light trail, only along the active flight.
  const trail=Array.from({length:7},(_,i)=>{
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:halo,color:'#ffe6aa',transparent:true,depthTest:false,depthWrite:false}));
    sprite.scale.setScalar(.15-i*.013);sprite.material.opacity=.52-i*.055;sprite.visible=false;
    scene.add(sprite);return sprite;
  });
  let lastTrail=-Infinity;
  const returnAccent = new THREE.Group();
  const wingEcho = new THREE.SpriteMaterial({ map: halo, color: '#b3e3ff', transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  for (const side of [-1, 1]) {
    const spark = new THREE.Sprite(wingEcho);
    spark.renderOrder = 6;
    returnAccent.add(spark);
  }
  scene.add(returnAccent);

  const ray = new THREE.Raycaster();
  const sight = new THREE.Vector3();
  function canSee(eye, insect) {
    sight.copy(insect).sub(eye);
    const distance = sight.length();
    ray.set(eye, sight.normalize());
    ray.far = Math.max(0, distance - 0.07);
    return ray.intersectObjects(leaves, false).length === 0;
  }

  const shorelinePad = 0.52;
  const obstacles = [
    { axis: new THREE.Line3(V(-2.22, 0, -2.45), V(0.12, 0, -3.68)), clearance: 0.72 },
    { axis: new THREE.Line3(V(3.35, 0, -6.68), V(4.1, 0, -7.70)), clearance: 0.72 },
  ];
  const nearest = new THREE.Vector3();
  const bias = new THREE.Vector3();
  function steer(position) {
    const clipToWater = () => {
      position.z = THREE.MathUtils.clamp(position.z, -28.6, 7.8);
      const angle = Math.acos((position.z + 10) / 22);
      position.x = THREE.MathUtils.clamp(position.x, shore(-angle).x + shorelinePad, shore(angle).x - shorelinePad);
    };
    clipToWater();
    for (const { axis, clearance } of obstacles) {
      axis.closestPointToPoint(position, true, nearest);
      bias.copy(position).sub(nearest);
      if (bias.lengthSq() >= clearance * clearance) continue;
      if (bias.lengthSq() < 0.00001) bias.set(0.45, 0, 0.89);
      position.copy(nearest).addScaledVector(bias.normalize(), clearance);
    }
    clipToWater();
  }

  function info(index, listener = null, yaw = 0, movingPoint = null) {
    const target = movingPoint ? { point: movingPoint.clone() } : TARGETS[index];
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const origin = listener ? V(listener.x, WATER, listener.z) : ORIGIN;
    const dx = target.point.x - origin.x, dz = target.point.z - origin.z;
    const right = dx * cos - dz * sin;
    const ahead = -dx * sin - dz * cos;
    const bearing = Math.atan2(right, ahead);
    const sector = Math.abs(bearing) < 0.148 ? 0 : bearing < 0 ? -1 : 1;
    const pan = THREE.MathUtils.clamp(right / 4.3, -0.8, 0.8);
    return { ...target, sector, pan, behind: ahead < 0, origin, heading: { x: -sin, y: -cos },
      delay: travelTime(target.point, origin) + 0.24 };
  }

  function update(seconds, amount, age, insect, visible, pulse, camera, landingAge, guidePhase, phaseAge, wingExposed) {
    if(guidePhase==='flight'){
      if(seconds-lastTrail>.1 || seconds<lastTrail){
        for(let i=trail.length-1;i>0;i--){trail[i].position.copy(trail[i-1].position);trail[i].visible=trail[i-1].visible;}
        trail[0].position.copy(insect);trail[0].visible=true;lastTrail=seconds;
      }
    }else for(const sprite of trail)sprite.visible=false;
    uPerch.value.copy(insect);
    uLanding.value = landingAge >= 0 && landingAge < 1 ? 3 * Math.sin(landingAge * 21) * Math.exp(-landingAge * 4) : 0;
    uTime.value = seconds;
    uEcho.value = amount;
    const pulsing = age >= 0 && age <= ECHO_DURATION;
    uAge.value = pulsing ? age : -1;
    uAim.value = pulse?.aim ?? 2;
    if (pulse) {
      uOrigin.value.copy(pulse.marker.origin);
      uHeading.value.copy(pulse.marker.heading);
    }
    staticLines.visible = livingLines.visible = pulsing && amount > 0.015;
    const detected = pulse && pulse.kind !== 'miss' ? pulse.marker : null;
    const elapsed = detected ? age - detected.delay : Infinity;
    const confirmed = pulse?.kind === 'confirm';
    const length = confirmed ? 1.46 : 1.12;
    const firstReturn = elapsed >= 0 && elapsed < length
      ? THREE.MathUtils.smoothstep(elapsed, 0, 0.13) * (1 - THREE.MathUtils.smoothstep(elapsed, length * 0.44, length))
      : 0;
    const afterglow = firstReturn || (detected && elapsed >= length ? 0.37 + 0.26 * Math.cos(elapsed * 4.2) : 0);
    const departure = guidePhase === 'flight' ? Math.max(0, 1 - phaseAge / 1.25) : 0;
    const response = guidePhase === 'end' ? amount : guidePhase === 'found' ? 1 : guidePhase === 'flight'
      ? Math.max(departure, pulse?.kind === 'passage' ? afterglow : 0) : afterglow * (wingExposed ? 1 : 0.48);
    const daylight = (guidePhase==='daylight' || guidePhase==='end' || guidePhase==='idle' ? visible : 0) * (1 - amount);
    const searching = ['hunt','found','flight'].includes(guidePhase);
    const returnVisible = searching || (confirmed && response > 0);
    const perched=guidePhase==='hunt'&&phaseAge>=.9;
    let intensity=daylight;
    if(guidePhase==='hunt')intensity=perched?.93+.07*Math.sin(seconds*3):.48+.15*Math.cos(seconds*7);
    if(guidePhase==='flight')intensity=.44+.14*Math.sin(seconds*7)+.20*THREE.MathUtils.smoothstep(phaseAge,3.3,4.4);
    if(guidePhase==='descent')intensity=.70+.08*Math.sin(seconds*5);
    if(guidePhase==='teach')intensity=.48*(1-THREE.MathUtils.smoothstep(phaseAge,0,2.4));
    bug.visible = intensity > 0.014;
    returnAccent.visible = searching && guidePhase!=='found' && firstReturn>.05;
    if (bug.visible) {
      bug.position.copy(returnVisible && detected && !guidePhase ? detected.point : insect);
      bug.rotation.set(0.25 + Math.sin(seconds * 3.6) * 0.12, seconds * 1.6, Math.sin(seconds * 2.8) * 0.18);
      for (const wing of wings) wing.rotation.z = Math.sin(seconds * (perched?6:64)) * (perched?.06:.51);
      abdomen.material.color.set(perched?'#ffdf89':'#f9ce77');
      thorax.material.color.set(returnVisible ? '#bedfff' : '#784b43');
      glow.material.color.set(perched?'#ffc45e':'#efd096');
      abdomen.material.depthTest = thorax.material.depthTest = wingMaterial.depthTest = glow.material.depthTest = !returnVisible;
      abdomen.material.opacity = thorax.material.opacity = intensity;
      wingMaterial.opacity = intensity * 0.91;
      glow.material.opacity = intensity * (returnVisible ? 0.57 : 0.74);
      glow.scale.setScalar(perched?.86+.07*Math.cos(seconds*3):.48+intensity*.18);
    }
    if (returnAccent.visible) {
      const beat = guidePhase ? phaseAge : elapsed;
      returnAccent.position.copy(guidePhase ? insect : detected.point);
      returnAccent.position.x += 0.06 * Math.sin(beat * 3.8);
      returnAccent.position.y += 0.04 * Math.sin(beat * 6.4);
      returnAccent.quaternion.copy(camera.quaternion);
      const opening = guidePhase === 'found' ? THREE.MathUtils.smoothstep(phaseAge, 0.12, 0.55) : 1;
      const span = 0.025 + opening * (0.073 + 0.021 * Math.cos(beat * 24));
      returnAccent.children.forEach((spark, index) => {
        spark.position.set((index * 2 - 1) * span, 0.025 * Math.sin(beat * 24), 0);
        spark.scale.set(0.132, 0.086, 1);
      });
      wingEcho.opacity = response * (0.80 + 0.20 * Math.cos(beat * 24));
    }
  }

  bug.traverse(o=>o.layers.enable(1));
  bug.visible = returnAccent.visible = staticLines.visible = livingLines.visible = false;
  return { scene, update, info, reflect, canSee, steer, targetCount: TARGETS.length };
}
