import { makeCabin, pilotLamp, floorAt } from './cabin.mjs';
import * as THREE from './vendor/three.module.js';
import { ReachGrab, EyeAim } from './gesture.mjs';
import { ECHO_DURATION, makePond, shore } from './pond.mjs';
import { eyeCenter, HeadWindow, WindowProjection } from './window-view.mjs';

const $ = id => document.getElementById(id);
const video = $('camera');
const canvas = $('world'), overlay = $('trackingOverlay'), pen = overlay.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.07, 110);
const windowView = new WindowProjection(camera);
const tracker = new HeadWindow();
const { scene, update: updatePond, info: locate, reflect, steer, targetCount } = await makePond();

const detector=new ReachGrab(), eyes=new EyeAim();
const explorer=new THREE.Vector3(), insect=new THREE.Vector3(), waypoint=new THREE.Vector3(), projected=new THREE.Vector3();
const currentNotes=new Set();
const handPaths=[[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[17,0]];
const cabinPhases=['descent','teach','walk','inspect','complete'];
const greenhousePhase=()=>cabinPhases.includes(phase);
const clamp=THREE.MathUtils.clamp;
let stream,hand,face,files,vision,facePoints,handPoints,house;
let audio,gain,habitat,nextBird=0,soundOn=true;
let phase='idle',phaseAt=0,started=false,foundCount=0,phaseTime=0,gameTime=0;
let yaw=0,pitch=0,turnTo=0,tiltTo=0,headYaw=0,headTilt=0,echo=0,pulse=null,nextEcho=0;
let flightStart=new THREE.Vector3(),destination=new THREE.Vector3();
let lastFrame=performance.now(),lastFaceAt=-Infinity,lastHandAt=-Infinity,lastVideo=-1,faceNext=true;

let screen=null,palm=null,ready=false,lockUntil=0,missUntil=0,feedback='',noteUntil=0,anchored=false;
let cameraBusy=false, retryAt=0, startupProblem='', generation=0;

const tasks={teach:'看向入口铃兰，学习比对轮廓',walk:'前往半圆花台',inspect:'从 5 株中找出 2 株变异植物',daylight:'环顾木台、睡莲与花廊',hunt:'捕捉萤火虫',found:'留意它飞往哪里',flight:'跟随萤火虫',end:'跟随萤火虫前往入口巡检灯',descent:'循灯前往温室 · 找出 2 株变异植物',survey:'前往 2 号标本架',rescan:'从右侧复测嫩梢',mark:'标记伸出支架的嫩梢',catalog:'前往 3 号标本架',third:'查看花心断层',section:'记录内部异变',complete:'巡检完成'};
function headingTo(target){
  const dx=target.x-explorer.x,dz=target.z-explorer.z;
  const angle=Math.atan2(-dx,-dz)-yaw;
  turnTo=yaw+Math.atan2(Math.sin(angle),Math.cos(angle));
  tiltTo=Math.atan2(target.y-explorer.y,Math.hypot(dx,dz));
}
let saved=false;
try{saved=localStorage.getItem('lotus-bay:glasshouse')==='1';}catch{}
let menu=false, focusPlant=null, viewed=null, dwell=0, actionKey='', finishAt=Infinity;
const checkpoints=['backDoor','fromBay','fromHouse','resumeRun'];
function resetFocus(){focusPlant=viewed=null;dwell=0;ready=false;detector.reset();screen=null;}
function openMenu(open){
  menu=open;ready=false;
  $('menuTitle').textContent=phase==='complete'?'巡检完成 · 找到了两株变异植物':'选择体验起点';
  $('fromBay').textContent=phase==='complete'?'回到睡莲湾':'从睡莲湾开始';actionKey='';detector.reset();silence();
  $('chapterMenu').hidden=!open;$('marker').hidden=open;$('fromHouse').classList.toggle('locked',!saved);
  $('fromHouse').textContent=saved?(phase==='complete'?'再巡检一次':'从温室开始'):'到达温室后解锁';
  $('resumeRun').textContent=phase==='complete'?'回看两处发现':'继续当前体验';
  for(const id of checkpoints)$(id).classList.toggle('hot',false);
  if(open)audio?.suspend();else if(soundOn)ensureAudio();
}
function chapterAction(id){
  if(id==='backDoor'){openMenu(true);return;}
  if(id==='fromHouse'&&!saved)return;
  openMenu(false);
  if(id==='fromBay')begin();
  if(id==='fromHouse')enterHouse();
}
function controlAt(point){
  if(!point)return '';
  for(const id of menu?checkpoints.slice(1):['backDoor']){
    if(id==='fromHouse'&&!saved)continue;
    const r=(menu&&['fromBay','fromHouse'].includes(id)?$(id).parentElement:$(id)).getBoundingClientRect(),x=point.x*innerWidth,y=point.y*innerHeight;
    if(x>=r.left-7&&x<=r.right+7&&y>=r.top-6&&y<=r.bottom+6)return id;
  }
  return '';
}
function menuHand(now){
  const id=controlAt(palm)||controlAt(eyes.point);
  if(actionKey!==id){detector.reset();actionKey=id;}
  for(const k of checkpoints)$(k).classList.toggle('hot',k===id);
  if(!id&&!menu)return false;
  const g=detector.update(handPoints,video.videoWidth/video.videoHeight,!!id,now);
  if(id&&g?.action==='grab'&&now-lastFaceAt<420)chapterAction(id);
  return true;
}
function enterHouse(){
  house??=makeCabin(scene);house.open();house.arrange();
  resetFocus();finishAt=Infinity;pulse=null;echo=0;
  explorer.set(.95,0,-18);headingTo(house.teacher.group.position);yaw=turnTo;pitch=tiltTo;
  changePhase('descent');labelsReady();
}
function labelsReady(){
  const root=$('plantLabels');root.replaceChildren();
  for(const plant of house.pots){
    const tag=document.createElement('span');tag.className='plantLabel';root.appendChild(tag);plant.tag=tag;
  }
}
function plantPoint(p,detail=false){
  const point=p.group.position.clone();
  return point.add(detail?p.target:new THREE.Vector3(0,.46,0));
}
function plantProgress(){return house.pots.filter(p=>p.marked).length;}
function markPlant(){
  const p=focusPlant;
  if(phase!=='inspect'||!p||!p.scanned||p.marked||menu)return;
  p.age=0;
  if(!p.extra){signalText('两次轮廓吻合，这株健康');return;}
  p.marked=true;
  signalText(p.kind==='鹿角蕨'?'已标记 · 额外长出一支':'已标记 · 一茎分出两个卷芽');
  $('count').textContent='已标记 '+plantProgress()+' / 2';
  note(0,850,.16,.14);note(.15,1140,.19,.12);
  if(plantProgress()===2){changePhase('complete');finishAt=gameTime+3200;}
}
function progressHouse(dt){
  const teaching=phase==='descent'||phase==='teach';
  const dest=teaching?-27.05:-33.85;
  explorer.z+=clamp(dest-explorer.z,-dt*1.8,dt*1.8);explorer.x=.78;explorer.y=floorAt(explorer.z)+1.25;
  headingTo(teaching?plantPoint(house.teacher):new THREE.Vector3(.72,-4.18,-37.7));
  if(phase==='descent'&&Math.abs(dest-explorer.z)<.07)changePhase('teach');
  if(phase==='teach'&&house.teacher.scanned&&house.teacher.age>4.7){resetFocus();changePhase('walk');return;}
  if(phase==='walk'&&Math.abs(dest-explorer.z)<.07){resetFocus();changePhase('inspect');}
  if(phase==='complete'&&gameTime>=finishAt){finishAt=Infinity;openMenu(true);}
}
function observeBeds(dt){
  if(!greenhousePhase())return;
  const candidates=phase==='teach'?[house.teacher]:phase==='inspect'?house.pots.slice(1):[];
  const sight=eyes.point||{x:.5,y:.5};
  let chosen=null,nearest=Infinity;
  for(const p of house.pots){
    const pt=projectTarget(plantPoint(p));
    const visible=!menu && pt.inside && (p.demo?phase==='teach':['inspect','complete'].includes(phase));
    const tag=p.tag;tag.hidden=!visible;
    if(visible){
      tag.style.left=pt.x*100+'%';tag.style.top=pt.y*100+'%';
      tag.textContent=(p.demo?'示范':p.number+' 号')+' · '+p.kind+(p.marked?' ✓ 已标记':p.scanned?' · 已扫描':'');
      const dist=Math.hypot((pt.x-sight.x)*innerWidth,(pt.y-sight.y)*innerHeight);
      if(candidates.includes(p)&&dist<nearest&&dist<innerHeight*.14){chosen=p;nearest=dist;}
    }
  }
  if(chosen!==focusPlant){if(phase==='inspect')noteUntil=0;focusPlant=chosen;dwell=0;viewed=null;detector.reset();}
  if(!chosen)return;
  dwell+=dt;
  if(dwell>.48&&viewed!==chosen){
    viewed=chosen;chosen.age=0;scanSound();
  }
  if(viewed===chosen && chosen.age>=1.8)chosen.scanned=true;
}


function scanSound(){
  const tones=[520,810,1160,1250,1390,860];
  [0,.18,.34,.40,.46,.72].forEach((t,i)=>note(t,tones[i],.055,.054,(i-2.5)*.14,.96));
}
function fitPreview() {
  if (!video.videoWidth || !video.videoHeight) return;
  overlay.width = 320;
  overlay.height = Math.round(320 * video.videoHeight / video.videoWidth);
  $('cameraPicture').style.setProperty('--camera-ratio', video.videoWidth + ' / ' + video.videoHeight);
}
video.addEventListener('loadedmetadata', fitPreview);
video.addEventListener('resize', fitPreview);

function drawPreview() {
  pen.clearRect(0, 0, overlay.width, overlay.height);
  if (!stream || $('previewDetails').hidden) return;
  const pointX = point => point.x * overlay.width;
  const pointY = point => point.y * overlay.height;
  function path(points, color, width) {
    pen.beginPath();
    points.forEach((p, i) => i === 0 ? pen.moveTo(pointX(p), pointY(p)) : pen.lineTo(pointX(p), pointY(p)));
    pen.strokeStyle = color;
    pen.lineWidth = width;
    pen.lineCap = 'round';
    pen.lineJoin = 'round';
    pen.stroke();
  }
  function mark(point, radius, color, fill = true) {
    pen.beginPath();
    pen.arc(pointX(point), pointY(point), radius, 0, Math.PI * 2);
    if (fill) {
      pen.fillStyle = color;
      pen.fill();
    } else {
      pen.lineWidth = 1.4;
      pen.strokeStyle = color;
      pen.stroke();
    }
  }
  for (const i of [468,473]) if (facePoints?.[i]) mark(facePoints[i],3,'#a2f9f0');
  if (handPoints) {
    for (const chain of handPaths) path(chain.map(i => handPoints[i]), '#ffd88a', 1.8);
    handPoints.forEach((joint, i) => mark(joint, i % 4 === 0 ? 2.4 : 1.65, '#fff1cf'));
  }
}

function ensureAudio() {
  if (!soundOn) return;
  try {
    if (!audio) {
      audio = new AudioContext();
      gain = audio.createGain();
      gain.gain.value = 0.17;
      gain.connect(audio.destination);
      habitat = makeHabitat();
    }
    audio.resume().catch(() => {});
  } catch {}
}

function makeHabitat() {
  const mix = audio.createGain();
  mix.gain.value = 0;
  mix.connect(gain);
  const bed = audio.createBuffer(2, Math.floor(audio.sampleRate * 5.4), audio.sampleRate);
  for (let c = 0; c < 2; c++) {
    const samples = bed.getChannelData(c);
    let low = 0;
    for (let i = 0; i < samples.length; i++) {
      low = low * 0.77 + (Math.random() * 2 - 1) * 0.23;
      const fade = Math.min(i / 1700, (samples.length - 1 - i) / 1700, 1);
      samples[i] = low * fade;
    }
  }
  function bedLayer(type, frequency, level, pace, depth, offset, pan) {
    const source = audio.createBufferSource();
    source.buffer = bed;
    source.loop = true;
    const filter = audio.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.56;
    const air = audio.createGain(), sway = audio.createOscillator(), amount = audio.createGain();
    air.gain.value = level;
    sway.frequency.value = pace;
    amount.gain.value = depth;
    const stereo = audio.createStereoPanner();
    stereo.pan.value = pan;
    source.connect(filter).connect(air).connect(stereo).connect(mix);
    sway.connect(amount).connect(air.gain);
    source.start(0, offset);
    sway.start();
    return stereo;
  }
  const water = bedLayer('lowpass', 550, 0.30, 0.29, 0.17, 0, -0.24);
  bedLayer('bandpass', 1580, 0.22, 0.71, 0.102, 1.31, 0.19);
  bedLayer('bandpass', 810, 0.18, 0.14, 0.108, 2.03, -0.52);
  bedLayer('bandpass', 2980, 0.097, 0.41, 0.059, 3.20, 0.47);
  return { mix, water, mode: '', lastPan: -Infinity };
}

function soundscape(now, listening) {
  if (!habitat || !audio || audio.state !== 'running') return;
  const mode = !started ? 'quiet' : listening ? 'dark' : greenhousePhase() && explorer.y < -1.42 ? 'submerged' : 'day';
  if (mode === 'day' && now - habitat.lastPan > 160) {
    const dockX = -1.6 - explorer.x, dockZ = -5.7 - explorer.z;
    const side = (dockX * Math.cos(yaw) - dockZ * Math.sin(yaw)) / Math.max(1, Math.hypot(dockX, dockZ));
    habitat.water.pan.setTargetAtTime(side * 0.78, audio.currentTime, 0.13);
    habitat.lastPan = now;
  }
  if (mode !== habitat.mode) {
    habitat.mode = mode;
    habitat.mix.gain.setTargetAtTime(mode === 'day' ? 0.79 : mode === 'dark' ? 0.085 : mode==='submerged'?.20:0,
      audio.currentTime, mode === 'dark' ? 0.13 : 0.42);
    if (mode === 'day') nextBird = now + 1800 + Math.random() * 3200;
  }
  if (mode === 'day' && now > nextBird && soundOn) {
    const side = (Math.random() - 0.5) * 1.35;
    const pitch = 2120 + Math.random() * 830;
    note(0, pitch, 0.14, 0.061, side, 1.28);
    note(0.17, pitch * 1.11, 0.12, 0.049, side, 0.86);
    if (Math.random() > 0.55) note(0.34, pitch * 0.91, 0.18, 0.044, side, 0.73);
    nextBird = now + 4600 + Math.random() * 4900;
  }
}

function note(offset, pitch, duration, amount, pan = 0, drop = 0.71) {
  if (audio?.state !== 'running' || !soundOn) return;
  const at = audio.currentTime + offset;
  const tone = audio.createOscillator(), level = audio.createGain(), stereo = audio.createStereoPanner();
  tone.type = 'sine';
  tone.frequency.setValueAtTime(pitch, at);
  tone.frequency.exponentialRampToValueAtTime(pitch * drop, at + duration);
  stereo.pan.value = pan;
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(amount, at + 0.009);
  level.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  tone.connect(level);
  level.connect(stereo);
  stereo.connect(gain);
  currentNotes.add(tone);
  tone.start(at);
  tone.stop(at + duration + 0.012);
  tone.onended = () => { currentNotes.delete(tone); tone.disconnect(); level.disconnect(); stereo.disconnect(); };
}

function silence() {
  for (const tone of currentNotes) {
    try { tone.stop(); } catch {}
  }
  currentNotes.clear();
}

async function makeTracker(kind) {
  vision ||= import('./vendor/vision_bundle.mjs');
  const { FilesetResolver, HandLandmarker, FaceLandmarker } = await vision;
  files ||= FilesetResolver.forVisionTasks('./vendor/wasm');
  const fileset = await files;
  const faceKind = kind === 'face';
  const engine = faceKind ? FaceLandmarker : HandLandmarker;
  const options = {
    baseOptions: { modelAssetPath: faceKind ? './vendor/face_landmarker.task' : './vendor/hand_landmarker.task',
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

function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.15));
  renderer.setSize(innerWidth,innerHeight,false);
  windowView.setViewport(innerWidth,innerHeight);
}
window.addEventListener('resize',resize);
function signalText(text) { feedback=text; noteUntil=gameTime+1800; }
function changePhase(next,now=gameTime) {
  phase=next; phaseTime=0; phaseAt=now;
  lockUntil=missUntil=0; ready=false; detector.reset();
  feedback=''; noteUntil=0;
  $('mode').textContent=greenhousePhase()?'水下观测舱':['end','daylight'].includes(phase)?'日常视角 · 睡莲湾':'蝙蝠 · 自动回声';
  const stop=foundCount<targetCount?locate(foundCount).name:'水下观测舱';
  $('task').textContent=phase==='hunt'?stop+' · 捕捉萤火虫':phase==='flight'?'跟随萤火虫前往'+stop:tasks[phase] || '';
  $('mode').textContent=greenhousePhase()?'温室 · 激光巡检':$('mode').textContent;
  $('count').textContent=greenhousePhase()?'已标记 '+plantProgress()+' / 2':foundCount+' / '+targetCount+' 处已捕捉';

}
function begin() {
  resetFocus();$('plantLabels').replaceChildren();foundCount=0; explorer.set(0,0,0); house?.reset();
  insect.copy(locate(0).point);
  turnTo=yaw=0;tiltTo=pitch=0;
  started=true; nextEcho=0; pulse=null; echo=0;

  $('intro').hidden=true; $('experience').hidden=false; changePhase('daylight');
  ensureAudio();
}
function releaseCamera(){
  generation++;
  stream?.getTracks().forEach(t=>t.stop()); stream=null;video.srcObject=null;
  tracker.reset();eyes.reset();detector.reset();facePoints=handPoints=palm=null;ready=false;
  headYaw=headTilt=0;anchored=false;lastVideo=-1; $('cameraPreview').hidden=true;
}
async function startCamera(){
  if(cameraBusy||stream||document.hidden)return;
  cameraBusy=true; const request=++generation;
  $('startup').textContent='请允许摄像头访问，然后看向屏幕中央。';
  try{
    const acquired=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
    if(request!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;video.srcObject=acquired;await video.play();
    $('startup').textContent='正在加载眼部与手掌识别…';
    const models=await Promise.allSettled([face||makeTracker('face'),hand||makeTracker('hand')]);
    if(models[0].status==='fulfilled')face=models[0].value;
    if(models[1].status==='fulfilled')hand=models[1].value;
    if(request!==generation)return;
    if (!face||!hand)throw Error('model');
    fitPreview(); $('cameraPreview').hidden=false; startupProblem='';
    acquired.getVideoTracks()[0].addEventListener('ended',()=>{if(stream===acquired)cameraProblem('摄像头已断开，重新连接后将自动继续。');});
    if(!started){begin();if(saved)openMenu(true);}
    $('intro').hidden=true;$('experience').hidden=false;
  }catch(e){
    if(request===generation)cameraProblem(e.name==='NotAllowedError'?'请在浏览器地址栏允许摄像头访问，授权后将自动进入。':e.name==='NotFoundError'?'请连接摄像头，连接后会自动进入。':e.name==='NotReadableError'?'摄像头被占用，请关闭其他占用它的程序。':'识别暂时不可用，正在重新连接…');
  }finally{cameraBusy=false;}
}
function cameraProblem(text){
  releaseCamera();startupProblem=text;retryAt=performance.now()+6000;
  $('startup').textContent=text;$('intro').hidden=false;$('experience').hidden=true;
}
document.addEventListener('visibilitychange',()=>{
  lastFrame=performance.now();detector.reset();eyes.reset();tracker.reset();
  palm=null;ready=false;anchored=false;facePoints=null;lastFaceAt=lastHandAt=-Infinity;
  if(document.hidden){silence();audio?.suspend();}else{if(started)ensureAudio();if(!stream)startCamera();}
});
window.addEventListener('pagehide',()=>{releaseCamera();face?.close();hand?.close();audio?.close();});
function palmCenter(joints){
  return [0,5,9,13,17].reduce((s,i)=>({x:s.x+(1-joints[i].x)/5,y:s.y+joints[i].y/5}),{x:0,y:0});
}
function distanceTo(point){return screen&&point?Math.hypot((point.x-screen.x)*innerWidth,(point.y-screen.y)*innerHeight):Infinity;}
function track(now){
  if(!stream||cameraBusy||video.readyState<2||video.currentTime===lastVideo)return;
  lastVideo=video.currentTime;faceNext=!faceNext;
  if(faceNext){
    facePoints=face.detectForVideo(video,now).faceLandmarks[0];
    tracker.update(facePoints,video.videoWidth/video.videoHeight,now);eyes.update(facePoints);
    if(facePoints && tracker.neutral){
      const c=eyeCenter(facePoints),w=Math.hypot(c.eyes[3].x-c.eyes[0].x,(c.eyes[3].y-c.eyes[0].y)*video.videoHeight/video.videoWidth);
      headYaw=clamp(((facePoints[1].x-c.x)/w-tracker.neutral.yaw)*2.2,-1.45,1.45);
      const relativeY=(facePoints[1].y-c.y)/w;
      if(!anchored){tracker.noseY=relativeY;anchored=true;}
      headTilt=clamp((tracker.noseY-relativeY)*1.65,-.48,.48);
      lastFaceAt=now;
    } else if(!facePoints){lastFaceAt=-Infinity;}
  }else{
    handPoints=hand.detectForVideo(video,now).landmarks[0];
    palm=handPoints?palmCenter(handPoints):null;lastHandAt=now;
    if(menuHand(now)){drawPreview();return;}
    const active=screen?.inside && (catchAvailable()||(phase==='inspect' && focusPlant?.scanned)) && now-lastFaceAt<420;
    const radius=clamp(innerHeight*.16,58,155)*(gameTime<lockUntil?1.4:1);
    const gesture=detector.update(handPoints,video.videoWidth/video.videoHeight,active && distanceTo(palm)<radius,now);
    ready=!!gesture?.ready;
    if(active && gesture?.action==='grab' && distanceTo(palm)<radius*1.45){
      if(catchAvailable()){
        foundCount++;changePhase('found');note(0,760,.13,.17);note(.14,1110,.22,.15);
      }else markPlant();
    }else if(phase==='hunt'&&gesture?.action==='miss'){missUntil=gameTime+1400;}
  }
  drawPreview();
}
function catchAvailable(){return phase==='hunt' && phaseTime>=(foundCount===0?6000:3000);}
function autoEcho(){
  const marker=locate(Math.min(foundCount,targetCount-1),explorer,yaw,insect);
  pulse={kind:phase==='flight'?'passage':'confirm',aim:2,marker,at:gameTime};
  nextEcho=gameTime+3000;
  note(0,1510,.085,.16);note(.22,700,.09,.055,-.3);
  note(Math.min(2.5,marker.delay),1030,.16,.17,marker.pan);
}
function advance(dt){
  if(phase==='daylight'){
    const t=THREE.MathUtils.smoothstep(phaseTime,9000,20000);
    insect.set(.52+Math.sin(t*Math.PI)*.65,.14+.11*Math.sin(phaseTime*.0015),-2.65);
    insect.lerp(locate(0).point,t);
    if(phaseTime>=20000){changePhase('hunt');nextEcho=gameTime;}
    return;
  }
  if(phase==='found'&&phaseTime>2700){
    flightStart.copy(insect);destination.copy(foundCount<targetCount?locate(foundCount).point:pilotLamp);
    changePhase('flight');
  }
  if(phase==='flight'){
    const t=clamp(phaseTime/7000,0,1);
    insect.lerpVectors(flightStart,destination,t*t*(3-2*t));insect.y+=.48*Math.sin(Math.PI*t);
    waypoint.copy(insect);waypoint.z+=3.05;waypoint.y=0;
    explorer.lerp(waypoint,1-Math.exp(-dt*2));steer(explorer);
    headingTo(insect);
    if(t===1){
      if(foundCount===targetCount){house??=makeCabin(scene);house.open();changePhase('end');}
      else changePhase('hunt');
    }
  }else if(phase==='hunt'){
    insect.copy(locate(foundCount).point);
    insect.y+=.065*Math.sin(gameTime*.0018);insect.x+=.05*Math.sin(gameTime*.0014);
    headingTo(insect);
  }else if(phase==='end'){
    waypoint.set(pathX(-18),0,-18);
    explorer.lerp(waypoint,1-Math.exp(-dt*.8));
    if(explorer.z< -17.65 && phaseTime>4500){
      let stored=true;try{localStorage.setItem('lotus-bay:glasshouse','1');}catch{stored=false;}
      saved=true;enterHouse();note(0,912,.18,.16);note(.21,1230,.25,.11);signalText(stored?'已到达温室 · 起点已保存':'已到达温室 · 本次体验已解锁');
    }
  }
  if(greenhousePhase())progressHouse(dt);
}
function focusTarget(){
  if(!greenhousePhase())return insect;
  return plantPoint(focusPlant||house.teacher,!!focusPlant?.marked);
}
function projectTarget(target=focusTarget()){
  projected.copy(target).applyMatrix4(camera.matrixWorldInverse);
  const rear=projected.z>=0;
  const lateral=projected.x,up=projected.y;
  projected.copy(target).project(camera);
  const x=.5+projected.x/2,y=.5-projected.y/2;
  const inside=!rear && x>.065&&x<.935&&y>.1&&y<.91;
  if(inside)return {x,y,inside};
  let dx=rear?(Math.abs(lateral)<.001?1:lateral):x-.5,dy=rear?-up:y-.5;
  const scale=Math.max(Math.abs(dx)/.42,Math.abs(dy)/.36,.001);
  return {x:.5+dx/scale,y:.5+dy/scale,inside,angle:Math.atan2(dy*innerHeight,dx*innerWidth)*180/Math.PI};
}
function drawMap(){
  const ctx=$('map').getContext('2d');
  const at=v=>[13+(12-v.z)*5.98,76+v.x*6.1];
  const line=(list)=>{ctx.beginPath();list.forEach((v,i)=>ctx[i?'lineTo':'moveTo'](...at(v)));};
  ctx.clearRect(0,0,352,146);
  const shorePoints=Array.from({length:100},(_,i)=>shore(i*2*Math.PI/100));
  line(shorePoints);ctx.closePath();ctx.fillStyle='#28515a';ctx.fill();ctx.strokeStyle='#688a86';ctx.lineWidth=1.5;ctx.stroke();
  const stops=Array.from({length:targetCount},(_,i)=>locate(i).point);
  const corridor=[{x:-1,z:-18},{x:2.6,z:-18},{x:2.6,z:-41.3},{x:-1,z:-41.3}];
  line(corridor);ctx.closePath();ctx.fillStyle='#45535b';ctx.fill();ctx.stroke();
  const route=[{x:0,z:0},...stops.map(v=>({x:v.x,z:v.z+3.05})),pilotLamp,{x:.78,z:-27.05},{x:.78,z:-33.85}];
  line(route);ctx.lineWidth=4;ctx.strokeStyle='#97c7b9';ctx.stroke();
  const places=[...stops,pilotLamp,{x:.72,z:-29.1},{x:.72,z:-38}];
  const index=greenhousePhase()?(['descent','teach'].includes(phase)?4:5):Math.min(foundCount,3);
  places.forEach((v,i)=>{ctx.beginPath();ctx.arc(...at(v),i===index?5:3,0,Math.PI*2);ctx.fillStyle=i===index?'#ffc76f':'#9db4ae';ctx.fill();});
  ctx.font='16px "Microsoft YaHei", sans-serif';ctx.fillStyle='#dcece6';
  ctx.fillText('睡莲湾',55,28);ctx.fillText('坡道',181,126);ctx.fillText('温室',267,52);
  const [x,y]=at(camera.position);
  const dir=camera.getWorldDirection(projected);const facing=Math.atan2(dir.x,-dir.z);
  ctx.beginPath();ctx.moveTo(x,y);ctx.arc(x,y,23,facing-.52,facing+.52);ctx.closePath();ctx.fillStyle='#e4fff494';ctx.fill();
  ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
}

function drawUI(now,dt,present){
  const marker=$('marker'); marker.hidden=!present||phase==='daylight';
  const handVisible=present&&palm&&now-lastHandAt<350;
  $('palm').hidden=!handVisible;
  if(handVisible){$('palm').style.left=palm.x*100+'%';$('palm').style.top=palm.y*100+'%';}
  $('tracking').textContent=present?'':tracker.status(now)==='calibrating'||facePoints?'请看屏幕中央，保持一瞬':'请让脸回到画面中';
  if(!present)return;
  if(greenhousePhase())observeBeds(dt);
  screen=projectTarget();
  if(phase==='walk'||phase==='complete'||(phase==='inspect'&&!focusPlant))marker.hidden=true;
  const gaze=eyes.point;
  const gazed=screen.inside&&distanceTo(gaze)<innerHeight*.19;
  if(gazed)lockUntil=gameTime+650;
  marker.className=[greenhousePhase()?'botanical':'',dwell>.2?'observing':'',screen.inside?'':'edge',gameTime<lockUntil?'focus':'',ready?'ready':''].join(' ');
  marker.style.left=screen.x*100+'%';marker.style.top=screen.y*100+'%';
  const arrow=$('arrow'),bubble=$('bubble');
  arrow.hidden=screen.inside && phase!=='hunt' && !greenhousePhase();
  arrow.style.transform=screen.inside?'translate(-34px, 0)':'rotate('+screen.angle+'deg)';
  let text='';
  if(!screen.inside)text='朝箭头方向转头';
  else if(phase==='hunt'&&!catchAvailable())text=foundCount===0&&phaseTime<3000?'回声掠过木台与睡莲':'听，叶片间有振翅声';
  else if(phase==='hunt')text=ready?'轻轻合拢手指':gameTime<missUntil?'再试一次，先把手掌伸进光圈':foundCount===0?'张开手，向光点伸过去':'伸手捕捉';
  else if(phase==='found')text='抓到了！ '+foundCount+' / '+targetCount;
  else if(phase==='flight')text='跟着这道光';
  else if(phase==='end')text='巡检灯亮了 · 跟着光进入温室';
  else if(gameTime<noteUntil)text=feedback;
  else if(phase==='descent')text='前往入口示范株';
  else if(phase==='teach')text=house.teacher.scanned?'两次轮廓吻合，这株健康':'看向铃兰 · 观察灰白旧轮廓和青色新点';
  else if(phase==='inspect'&&focusPlant)text=focusPlant.marked?'已标记':focusPlant.scanned?'发现变异？伸手合拢标记':'看稳这株，激光正在扫描';
  if(bubble.textContent!==text)bubble.textContent=text;
  const width=bubble.offsetWidth, x=screen.x*innerWidth;
  bubble.style.left=clamp(-width/2,8-x,innerWidth-width-8-x)+'px';
  bubble.style.top=screen.y>.79?'-48px':'23px';
  $('palmStatus').textContent=ready?'可以合拢':handVisible?'已看到手掌':'待伸手';
  drawMap();
}
function frame(now){
  requestAnimationFrame(frame);
  const elapsedFrame=now-lastFrame;
  const dt=Math.min(.08,elapsedFrame/1000);lastFrame=now;
  if(document.hidden)return;
  if(startupProblem && !stream && !cameraBusy && now>=retryAt)startCamera();
  try{track(now);}catch(error){console.warn(error);cameraProblem('识别中断，正在重新连接…');}
  const present=started && stream && !cameraBusy && tracker.status(now)==='ready' && now-lastFaceAt<420;
  const pos=tracker.step(dt,now);
  if(menu){
    $('palm').hidden=!present||!palm;
    if(palm){$('palm').style.left=palm.x*100+'%';$('palm').style.top=palm.y*100+'%';}
    return;
  }
  if(present){gameTime+=elapsedFrame;phaseTime+=dt*1000;advance(dt);}
  yaw+=(turnTo+headYaw-yaw)*(1-Math.exp(-dt*7));pitch+=(tiltTo+headTilt-pitch)*(1-Math.exp(-dt*7));
  windowView.viewFrom(pos,yaw,pitch,explorer);camera.updateMatrixWorld();

  const listening=['hunt','found','flight'].includes(phase);
  if(present && listening && gameTime>=nextEcho)autoEcho();
  echo+=((listening?1:0)-echo)*(1-Math.exp(-dt*(listening?.65:1.3)));
  const age=pulse?(gameTime-pulse.at)/1000:-1;
  updatePond(gameTime/1000,echo,age,insect,started?1:0,listening?pulse:null,camera,-1,phase,phaseTime/1000,true);
  soundscape(now,listening);
  if(started)drawUI(now,dt,present);

  const submerged=greenhousePhase() && explorer.y < -1.65;
  scene.fog=submerged?house.waterFog:null;
  if(house?.room.visible)house.tick(present?dt:0,gameTime);
  camera.layers.set(submerged?1:0);
  if(!submerged)reflect(renderer,camera,now);
  renderer.render(scene,camera);
  camera.layers.set(0);
}
resize();
requestAnimationFrame(frame);
startCamera();
