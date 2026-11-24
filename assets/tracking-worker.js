// Classic worker because the bundled WASM loader uses importScripts.
let face,hand;
self.onmessage=async ({data})=>{
  const {kind,bitmap,now,generation}=data;
  try{
    if(data.init){
      const {makeTracker}=await import('./tracking-model.mjs');
      face=await makeTracker('face');
      hand=await makeTracker('hand');
      self.postMessage({ready:true});
      return;
    }
    const points=kind==='face'?face.detectForVideo(bitmap,now).faceLandmarks[0]:hand.detectForVideo(bitmap,now).landmarks[0];
    self.postMessage({kind,points,now,generation,epoch:data.epoch});
  }catch(error){self.postMessage({error:String(error)});}
  finally{bitmap?.close();}
};
