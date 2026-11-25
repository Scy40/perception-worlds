let files,vision;
export async function downloadModels(signal){
  const kinds=['face','hand'];
  const buffers=await Promise.all(kinds.map(async kind=>{
    const url=new URL('../vendor/'+kind+'_landmarker.task',import.meta.url);
    const response=await fetch(url,{signal});
    if(!response.ok)throw Error(kind+' model HTTP '+response.status);
    return new Uint8Array(await response.arrayBuffer());
  }));
  return {face:buffers[0],hand:buffers[1]};
}

export async function makeTracker(kind,buffer,{ preferCPU=false }={}){
  vision ||= import('../vendor/vision_bundle.mjs');
  const { FilesetResolver, HandLandmarker, FaceLandmarker } = await vision;
  files ||= FilesetResolver.forVisionTasks(new URL('../vendor/wasm',import.meta.url).href);
  const fileset = await files;
  const faceKind = kind === 'face';
  const engine = faceKind ? FaceLandmarker : HandLandmarker;
  const options = {
    baseOptions: { modelAssetBuffer: buffer,
      delegate: faceKind || preferCPU ? 'CPU' : 'GPU' },
    runningMode: 'VIDEO',
    minTrackingConfidence: 0.56,
    ...(faceKind ? { numFaces: 1 } : { numHands: 1, minHandDetectionConfidence: 0.60, minHandPresenceConfidence: 0.60 }),
  };
  try {
    return await engine.createFromOptions(fileset, options);
  } catch (error) {
    if (options.baseOptions.delegate==='CPU') throw error;
    options.baseOptions.delegate = 'CPU';
    return await engine.createFromOptions(fileset, options);
  }
}

