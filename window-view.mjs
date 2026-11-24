import * as THREE from './vendor/three.module.js';

const MAX_SHIFT = { x: 0.46, y: 0.26, z: 0.40 };
const REFERENCE_ASPECT = 1672 / 941;
const DEAD_ZONE = 0.033;
const HOLD_MS = 560;
const EYE_CORNERS = [33, 133, 362, 263];

export function eyeCenter(landmarks) {
  if (!landmarks) return null;
  const eyes = EYE_CORNERS.map(i => landmarks[i]);
  if (eyes.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  return {
    eyes,
    x: eyes.reduce((sum, point) => sum + point.x, 0) / eyes.length,
    y: eyes.reduce((sum, point) => sum + point.y, 0) / eyes.length,
  };
}

export class HeadWindow {
  constructor() {
    this.target = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.neutral = null;
    this.samples = [];
    this.lastSeen = -Infinity;
    this.target.set(0, 0, 0);
  }

  update(landmarks, videoRatio, now) {
    const center = eyeCenter(landmarks);
    if (!center || !Number.isFinite(landmarks[1]?.x)) return;
    const { eyes, x, y } = center;
    const [outerLeft, , , outerRight] = eyes;
    const width = Math.hypot(outerLeft.x - outerRight.x, (outerLeft.y - outerRight.y) / videoRatio);
    if (width < 0.04 || width > 0.64) return;
    const yaw = (landmarks[1].x - x) / width;

    this.lastSeen = now;
    if (!this.neutral) {
      this.samples.push({ x, y, width, yaw });
      if (this.samples.length >= 6) {
        const getMedian = key => this.samples.map(sample => sample[key]).sort((a, b) => a - b)[3];
        this.neutral = { x: getMedian('x'), y: getMedian('y'), width: getMedian('width'), yaw: getMedian('yaw') };
        this.samples = [];
      }
      return;
    }

    const base = this.neutral;
    const relativeDistance = base.width / width;
    const quiet = value => Math.sign(value) * Math.max(0, Math.abs(value) - DEAD_ZONE);
    const clamp = (value, limit) => THREE.MathUtils.clamp(value, -limit, limit);
    this.target.x = clamp(quiet((base.x - x) * relativeDistance * 5.0), MAX_SHIFT.x);
    this.target.y = clamp(quiet((base.y - y) * relativeDistance * 3.6), MAX_SHIFT.y);
    if (Math.abs(yaw - base.yaw) < 0.23) {
      this.target.z = clamp(quiet((relativeDistance - 1) * 2.2), MAX_SHIFT.z);
    }
  }

  step(dt, now) {
    if (now - this.lastSeen > HOLD_MS) this.target.set(0, 0, 0);
    const distance = this.position.distanceTo(this.target);
    const response = now - this.lastSeen > HOLD_MS ? 5 : 7 + 9 * THREE.MathUtils.smoothstep(distance, 0.02, 0.16);
    const smoothing = 1 - Math.exp(-dt * response);
    for (const [axis, speed] of [['x', 1.52], ['y', 0.98], ['z', 1.02]]) {
      this.position[axis] += THREE.MathUtils.clamp((this.target[axis] - this.position[axis]) * smoothing, -speed * dt, speed * dt);
    }
    return this.position;
  }

  status(now) {
    if (now - this.lastSeen > HOLD_MS) return 'searching';
    return this.neutral ? 'ready' : 'calibrating';
  }
}

// Calibrated head angles and normalized gaze each have their own quiet zone.
// The curve preserves the outer range so end pots can still be brought into view.
export function quietLook(value, deadZone, limit){
  const t=THREE.MathUtils.clamp((Math.abs(value)-deadZone)/(limit-deadZone),0,1);
  return Math.sign(value)*limit*t*(.40+.60*t);
}

export function followAngle(current, target, dt, maxSpeed){
  const step=(target-current)*(1-Math.exp(-dt*4));
  return current+THREE.MathUtils.clamp(step,-maxSpeed*dt,maxSpeed*dt);
}

export class WindowProjection {
  constructor(camera, fov = 46) {
    this.camera = camera;
    this.planeDistance = 3.9;
    this.halfHeight = this.planeDistance * Math.tan(THREE.MathUtils.degToRad(fov / 2));
    this.aspect = REFERENCE_ASPECT;
  }

  setViewport(width, height) {
    this.aspect = width / Math.max(height, 1);
  }

  viewFrom(position, yaw = 0, pitch = 0, origin = null) {
    const crop = THREE.MathUtils.clamp(REFERENCE_ASPECT / this.aspect, 0.70, 1);
    const halfHeight = this.halfHeight * crop;
    const drawnWidth = halfHeight * this.aspect;
    const { near, far } = this.camera;
    const scale = near / (this.planeDistance + position.z);
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
    this.camera.position.copy(position).applyQuaternion(this.camera.quaternion);
    if (origin) this.camera.position.add(origin);
    this.camera.projectionMatrix.makePerspective(
      (-drawnWidth - position.x) * scale,
      (drawnWidth - position.x) * scale,
      (halfHeight - position.y) * scale,
      (-halfHeight - position.y) * scale,
      near,
      far
    );
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
  }
}
