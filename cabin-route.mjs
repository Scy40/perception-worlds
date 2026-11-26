import { MathUtils, Vector3 } from './vendor/three.module.js';

export const scanDuration = 4.35;
export const pathX = z => .82 + .31 * Math.sin((z + 20) * .43);
export const floorAt = z => -1.27 - 4.05 * MathUtils.smoothstep(-z, 17.7, 27);
export const pilotLamp = new Vector3(1.02, -.27, -17.8);
