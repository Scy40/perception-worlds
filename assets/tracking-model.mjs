let files,vision;
export async function makeTracker(kind) {
  vision ||= import('../vendor/vision_bundle.mjs');
  const { FilesetResolver, HandLandmarker, FaceLandmarker } = await vision;
  files ||= FilesetResolver.forVisionTasks(new URL('../vendor/wasm',import.meta.url).href);
  const fileset = await files;
  const faceKind = kind === 'face';
  const engine = faceKind ? FaceLandmarker : HandLandmarker;
  const options = {
    baseOptions: { modelAssetPath: new URL(faceKind ? '../vendor/face_landmarker.task' : '../vendor/hand_landmarker.task',import.meta.url).href,
      delegate: faceKind ? 'CPU' : 'GPU' },
    runningMode: 'VIDEO',
    minTrackingConfidence: 0.56,
    ...(faceKind ? { numFaces: 1 } : { numHands: 1, minHandDetectionConfidence: 0.60, minHandPresenceConfidence: 0.60 }),
  };
  try {
    return await engine.createFromOptions(fileset, options);
  } catch (error) {
    if (faceKind) throw error;
    options.baseOptions.delegate = 'CPU';
    return await engine.createFromOptions(fileset, options);
  }
}

