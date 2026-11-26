import { pilotLamp, pathX, floorAt, scanDuration } from './cabin-route.mjs?survey=9';
import * as THREE from './vendor/three.module.js';
import { ReachGrab, EyeAim, Pinch, handCursor } from './gesture.mjs?survey=2';
import { ECHO_DURATION, keepDockClear, makePond, shore } from './pond.mjs?survey=9';
import { eyeCenter, HeadWindow, WindowProjection, quietLook, followAngle } from './window-view.mjs?survey=9';

const $ = id => document.getElementById(id);
const enableSound = $('enableSound');
const video = $('camera');
const canvas = $('world'), overlay = $('trackingOverlay'), pen = overlay.getContext('2d');
const startup = window.lotusStartup;
$('startup').dataset.modules='ready';
startup.stage('正在绘制湖面和睡莲…','湖面场景准备超时，请重新加载。');
await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
const compact = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !compact, powerPreference: 'low-power' });
} catch (error) {
  console.error(error);
  startup.problem('无法启动 WebGL。请检查浏览器的图形加速，或换用支持 WebGL 2 的浏览器后重试。');
  throw error;
}
const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.07, 110);
const viewShift = new THREE.Vector3(), desiredShift = new THREE.Vector3();
const windowView = new WindowProjection(camera);
const tracker = new HeadWindow();
const { scene, update: updatePond, info: locate, reflect, steer, targetCount } = makePond({ reflections: !compact, compact });
canvas.addEventListener('webglcontextlost',event=>{
  event.preventDefault();
  releaseCamera();
  $('intro').hidden=false;
  startup.problem('图形连接已中断，请重新加载场景。');
});

const pinch=new Pinch();
let ringFlashUntil=-Infinity;
let releaseSince=0;
let routeStop=0,optionalWait=0,heldOpen=0,handGone=0;
const detector=new ReachGrab(), eyes=new EyeAim();
const explorer=new THREE.Vector3(), insect=new THREE.Vector3(), waypoint=new THREE.Vector3(), projected=new THREE.Vector3();
const currentNotes=new Set();
const handPaths=[[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[17,0]];
const cabinPhases=['descent','observe','teach','choose','walk','inspect','complete'];
const greenhousePhase=()=>cabinPhases.includes(phase);
const clamp=THREE.MathUtils.clamp;
let stream,hand,face,facePoints,handPoints,house;
let audio,gain,habitat,nextBird=0,soundOn=true;
let phase='idle',phaseAt=0,started=false,foundCount=0,phaseTime=0,gameTime=0;
let yaw=0,pitch=0,turnTo=0,tiltTo=0,headYaw=0,headTilt=0,echo=0,pulse=null,nextEcho=0;
let flightStart=new THREE.Vector3(),destination=new THREE.Vector3();
let lastFrame=performance.now(),lastFaceAt=-Infinity,lastHandAt=-Infinity,lastVideo=-1,faceNext=true;

let faceHold=420, handHold=400, previousFace=-Infinity, previousHand=-Infinity;
let briefOcclusionUntil=-Infinity, missingFace=false;
let visibilityEpoch=0;
const facePresent=now=>tracker.neutral && (missingFace?now<briefOcclusionUntil:now-lastFaceAt<faceHold);
let screen=null,palm=null,ready=false,lockUntil=0,missUntil=0,feedback='',noteUntil=0,anchored=false;
let cameraBusy=false, retryAt=0, startupProblem='', generation=0;
let introDrawn=false;

const tasks={daylight:'沿湖看日落',firstEcho:'听第一声回声',discovery:'发现萤火虫',hunt:'张手靠近，合手接住萤火虫',found:'张开手，让它带路',flight:'循着回声与光迹前进',end:'前往巡检灯',descent:'沿玻璃坡道进入水下温室',observe:'先看铃兰的外形',teach:'扫描并比对铃兰',choose:'自由选择下一处花台',walk:'沿步道前往花台',inspect:'每个花台归档一处发现',complete:'自由探索'};
function headingTo(target){
  const dx=target.x-explorer.x,dz=target.z-explorer.z;
  const angle=Math.atan2(-dx,-dz)-yaw;
  turnTo=yaw+Math.atan2(Math.sin(angle),Math.cos(angle));
  tiltTo=Math.atan2(target.y-explorer.y,Math.hypot(dx,dz));
}
let saved=false;
try{saved=localStorage.getItem('lotus-bay:glasshouse')==='1';}catch{}
let menu=false, focusPlant=null, viewed=null, dwell=0, actionKey='';
const checkpoints=['backDoor','fromBay','fromHouse','resumeRun'];
function resetFocus(){focusPlant=viewed=null;dwell=0;ready=false;detector.reset();screen=null;}
function openMenu(open){
  menu=open;ready=false;pinch.reset();
  if(anomalyArrow)anomalyArrow.hidden=true;
  $('scanRecord').hidden=true;
  $('menuTitle').textContent=phase==='complete'?'温室 · 自由探索':'选择体验起点';
  $('fromBay').textContent=phase==='complete'?'回到睡莲湾':'从睡莲湾开始';actionKey='';detector.reset();silence();
  $('plantLabels').hidden=open;$('guideText').hidden=open;$('echoStatus').hidden=open;$('aimDot').hidden=true;
  $('chapterMenu').hidden=!open;$('marker').hidden=open;$('fromHouse').classList.toggle('locked',!saved);
  $('fromHouse').textContent=saved?(phase==='complete'?'再巡检一次':'从温室开始'):'到达温室后解锁';
  $('resumeRun').textContent=phase==='complete'?'继续探索':'继续当前体验';
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
function menuHand(now,pressed){
  const id=controlAt(palm);
  if(actionKey!==id){detector.reset();actionKey=id;}
  for(const k of checkpoints)$(k).classList.toggle('hot',k===id);
  if(!id&&!menu)return false;
  const g=detector.update(handPoints,video.videoWidth/video.videoHeight,!!id,now,handHold);
  if(id&&(pressed||(!greenhousePhase()&&g?.action==='grab'))&&facePresent(now))chapterAction(id);
  return true;
}
const stationNames = ['育苗台', '水培台'];
const stationViews = [
  {z:-31.7, aim:new THREE.Vector3(-.92,-4.14,-33.15)},
  {z:-37.2, aim:new THREE.Vector3(2.30,-4.14,-38.5)}
];
const junctionZ = -27.65;
const entranceAim = new THREE.Vector3(.02,-4.05,-33);
const stationSigns = [
  {name:'育苗台', point:new THREE.Vector3(-.78,-3.98,-32.3), station:0},
  {name:'水培台', point:new THREE.Vector3(2.22,-3.98,-32.3), station:1}
];
let station=-1, chosenSign=null, scanning=null, focusAge=0;
let nextHouseFocus=null, nextHouseFocusAge=0;
const crossSign={name:'',point:new THREE.Vector3(),station:0};
let anomalyArrow;
const returnSign={name:'回到过道',point:new THREE.Vector3(),station:-1};
let cabinLoad, cabinAttempts=0, enteringHouse=false;
function loadCabin(){
  if(!cabinLoad){
    const attempt=cabinAttempts++;
    cabinLoad=withTimeout(import('./cabin.mjs?survey=9&attempt='+attempt),30000)
      .catch(error=>{cabinLoad=null;throw error;});
  }
  return cabinLoad;
}
async function enterHouse(){
  if(enteringHouse)return;
  enteringHouse=true;
  $('intro').hidden=false;
  startup.stage('正在准备第二幕 · 水下温室…','温室加载超时，请重试。',32000);
  try{
    const {makeCabin}=await loadCabin();
    house??=makeCabin(scene,{compact});
  }catch(error){
    console.warn(error);
    startup.problem('温室加载失败，请检查网络后重试。',enterHouse);
    return;
  }finally{enteringHouse=false;}
  startup.done();$('intro').hidden=true;
  house.restartSurvey();house.open();house.arrange();
  try{localStorage.setItem('lotus-bay:glasshouse','1');}catch{}
  saved=true;
  resetFocus();station=-1;scanning=chosenSign=null;pulse=null;echo=0;
  explorer.set(pathX(-18),0,-18);insect.copy(pilotLamp);
  headingTo(entranceAim);yaw=turnTo;pitch=tiltTo;
  changePhase('descent');labelsReady();
}
function labelsReady(){
  const root=$('plantLabels');root.replaceChildren();
  anomalyArrow=document.createElement('span');anomalyArrow.className='anomalyArrow';
  anomalyArrow.setAttribute('aria-hidden','true');anomalyArrow.hidden=true;root.appendChild(anomalyArrow);
  for(const item of [...house.pots,...stationSigns,crossSign,returnSign]){
    const tag=document.createElement('span');
    tag.className='plantLabel';tag.hidden=true;root.appendChild(tag);item.tag=tag;
  }
}
function plantPoint(p){
  return p.group.position.clone().add(new THREE.Vector3(0,.43,0));
}
function plantProgress(){return house.pots.filter(p=>p.marked).length;}
function bedsRecorded(){return new Set(house.pots.filter(p=>p.marked).map(p=>p.station)).size;}
function recordCount(){return '花台 '+bedsRecorded()+'/2 · 发现 '+plantProgress()+'/'+house.pots.filter(p=>p.extra).length;}
function markPlant(p){
  if(!p.extra||p.marked)return;
  p.marked=true;
  if(bedsRecorded()===2 && phase!=='complete')changePhase('complete');
  signalText(p.kind+' · '+p.finding[0]+'已归档');
  $('count').textContent=recordCount();
  note(0,850,.16,.14);note(.15,1140,.19,.12);
}
function moveStation(next){
  if(anomalyArrow)anomalyArrow.hidden=true;
  station=next;viewed=focusPlant=chosenSign=null;focusAge=0;
  house.restoreView();
  changePhase('walk');
}
function confirmHouse(){
  if(menu||scanning||house.radar.visible)return;
  if(chosenSign && focusAge<.12)return;
  if(chosenSign){moveStation(chosenSign.station);return;}
  const p=focusPlant;
  if(!p || !['teach','inspect','complete'].includes(phase) || (p.demo && p.scanned))return;
  if(p.scanned && p.extra && !p.marked){markPlant(p);return;}
  scanning=p;house.scanAt(explorer,p);p.age=0;scanSound();
}
function progressHouse(dt){
  const atEntrance=['descent','observe','teach'].includes(phase);
  const dest=atEntrance||station<0?junctionZ:stationViews[station].z;
  explorer.z+=clamp(dest-explorer.z,-dt*2.4,dt*2.4);
  explorer.x=pathX(explorer.z);explorer.y=floorAt(explorer.z)+1.3;
  const aim=atEntrance?(innerWidth<innerHeight?plantPoint(house.teacher):entranceAim):
    station<0?entranceAim:stationViews[station].aim;
  headingTo(aim);
  if(phase==='descent'){
    const t=clamp((-18-explorer.z)/(-18-junctionZ),0,1);
    insect.lerpVectors(pilotLamp,house.teacher.group.position,t);
    insect.y+=.30*t+.45*Math.sin(t*Math.PI);
    if(t>=.999)changePhase('observe');
  }
  if(phase==='observe'&&phaseTime>=3600)changePhase('teach');
  if(phase==='walk'&&Math.abs(dest-explorer.z)<.05){
    if(station>=0){
      const right=new THREE.Vector3(explorer.z-aim.z,0,aim.x-explorer.x).normalize();
      crossSign.station=1-station;
      crossSign.name=station===0?'水培台 →':'← 育苗台';
      crossSign.point.copy(aim).addScaledVector(right,station===0?.82:-.82);
      crossSign.point.y+=.48;
      returnSign.point.copy(aim);returnSign.point.y-=.61;
    }
    changePhase(station<0?'choose':bedsRecorded()===2?'complete':'inspect');
  }
  if(scanning&&scanning.age>=scanDuration){
    viewed=scanning;scanning.scanned=true;
    if(scanning.extra){
      signalText('变异警示 · '+scanning.finding[0]+(scanning.marked?' · 已归档':''));
    }else{
      signalText(scanning.kind+' · 与上次记录相符');
      note(0,615,.19,.085,0,.995);
    }
    scanning=null;
  }
  if(phase==='teach'&&house.teacher.scanned&&!house.radar.visible){
    house.restoreView();resetFocus();focusAge=0;changePhase('choose');
  }
}
function observeBeds(dt){
  let candidate=null, best=Infinity;
  const gaze=eyes.point;
  const old=focusPlant||chosenSign;
  const items=[...house.pots,...stationSigns,crossSign,returnSign];
  for(const item of items){
    const sign=!!item.point;
    const allowed=sign?(item===returnSign?['inspect','complete'].includes(phase):item===crossSign?['inspect','complete'].includes(phase):phase==='choose'):
      item.demo?phase==='teach':station===item.station&&['inspect','complete'].includes(phase);
    if(!allowed){item.tag.hidden=true;continue;}
    const pt=projectTarget(sign?item.point:plantPoint(item));
    const visible=item===returnSign||pt.inside;
    item.tag.hidden=!visible;
    if(!visible)continue;
    item.tag.classList.toggle('returnControl',item===returnSign);
    item.tag.style.left=item===returnSign?'68%':pt.x*100+'%';item.tag.style.top=item===returnSign?'8%':pt.y*100+'%';
    item.tag.classList.toggle('discovery',!!(item.scanned && item.extra));
    const caption=sign?item.name:item.marked?item.kind+' · 异常已归档':!item.scanned?item.kind:
      item.extra?item.kind+' · 记录异常':item.kind+' · 正常';
    if(item.tag.textContent!==caption)item.tag.textContent=caption;
  }
  // Position every label first, then read hit boxes in one layout pass.
  if(scanning || house.radar.visible)candidate=scanning||viewed;
  else if(old && pinch.target===old)candidate=old;
  else{
    const visible=items.filter(item=>!item.tag.hidden).map(item=>[item,item.tag.getBoundingClientRect()]);
    for(const sight of [gaze,palm]){
      if(!sight)continue;
      const reach=sight===gaze?clamp(innerHeight*.10,44,84):clamp(innerHeight*.042,24,42);
      const px=sight.x*innerWidth,py=sight.y*innerHeight;
      for(const [item,bounds] of visible){
        const gap=Math.hypot(Math.max(bounds.left-px,0,px-bounds.right),Math.max(bounds.top-py,0,py-bounds.bottom));
        const center=Math.hypot(px-(bounds.left+bounds.right)/2,py-(bounds.top+bounds.bottom)/2);
        const score=gap+center*.22;
        if(gap<reach && score<best){candidate=item;best=score;}
      }
      if(candidate)break;
    }
    if(candidate!==nextHouseFocus){
      nextHouseFocus=candidate;
      nextHouseFocusAge=0;
    }
    nextHouseFocusAge+=dt;
    if(candidate!==old && old && !old.tag.hidden && nextHouseFocusAge<(candidate?.point ? .16 : candidate ? .18 : .28)){
      candidate=old;
    }else if(!old && nextHouseFocusAge<.16)candidate=null;
  }
  focusAge=old===candidate?focusAge+dt:0;
  focusPlant=candidate?.group?candidate:null;
  chosenSign=candidate?.point?candidate:null;
  for(const item of [...house.pots,...stationSigns,crossSign,returnSign]){
    item.tag.classList.toggle('selected',item===candidate);
  }
  showAnomalyHint(dt);
  for(let i=0;i<house.bedLights.length;i++)house.bedLights[i].material.opacity=chosenSign?.station===i ? .95 : .26;
}


function showAnomalyHint(dt){
  anomalyArrow.hidden=true;
  if(!['inspect','complete'].includes(phase)||scanning||house.radar.visible)return;
  const plant=focusPlant||viewed;
  if(!plant?.scanned || !plant.extra || plant.station!==station)return;
  const tip=projectTarget(plant.group.localToWorld(plant.target.clone()));
  if(!tip.inside)return;
  anomalyArrow.style.left=tip.x*100+'%';anomalyArrow.style.top=tip.y*100+'%';
  anomalyArrow.textContent=plant.finding[0];
  anomalyArrow.hidden=false;
}
function houseTarget(){
  if(scanning||house.radar.visible)return null;
  if(chosenSign)return chosenSign;
  if(focusPlant?.demo && focusPlant.scanned)return null;
  return focusPlant;
}
function drawPinchRing(now,target){
  const cursor=$('palm'),done=now<ringFlashUntil;
  cursor.classList.toggle('onTarget',!!target && !done);
  cursor.classList.toggle('ringDone',done);
  cursor.style.setProperty('--sweep',(done?360:360*pinch.progress(now))+'deg');
}

function scanSound(){
  note(0,208,.18,.15,0,1.16);
  note(.15,520,.10,.09,0,1.14);
}
function playScanCue({pitch,duration,bend,position,warning}){
  let pan=0;
  if(position){
    const dx=position.x-camera.position.x,dz=position.z-camera.position.z;
    pan=clamp((dx*Math.cos(yaw)-dz*Math.sin(yaw))/Math.max(.4,Math.hypot(dx,dz)),-.70,.70);
  }
  note(0,pitch,duration,warning?.20:.10,pan,bend);
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
enableSound?.addEventListener('click',ensureAudio);

function makeHabitat() {
  const mix = audio.createGain();
  mix.gain.value = 0;
  const waterFilter=audio.createBiquadFilter();
  waterFilter.type='lowpass';
  waterFilter.frequency.value=5800;
  mix.connect(waterFilter);
  waterFilter.connect(gain);
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
  return { mix, water, waterFilter, mode: '', lastPan: -Infinity };
}

function soundscape(now, listening) {
  if (!habitat || !audio || audio.state !== 'running') return;
  const mode = !started?'quiet':house?.radar.visible&&greenhousePhase()?'scanning':greenhousePhase()&&explorer.y<-1.42?'submerged':listening?'dark':'day';
  if (mode === 'day' && now - habitat.lastPan > 160) {
    const dockX = -1.6 - explorer.x, dockZ = -5.7 - explorer.z;
    const side = (dockX * Math.cos(yaw) - dockZ * Math.sin(yaw)) / Math.max(1, Math.hypot(dockX, dockZ));
    habitat.water.pan.setTargetAtTime(side * 0.78, audio.currentTime, 0.13);
    habitat.lastPan = now;
  }
  if (mode !== habitat.mode) {
    habitat.mode = mode;
    habitat.waterFilter.frequency.setTargetAtTime(mode==='submerged'?960:mode==='scanning'?650:5800,
      audio.currentTime,.30);
    habitat.mix.gain.setTargetAtTime(mode==='day'?.79:mode==='dark'?.085:mode==='submerged'?.20:mode==='scanning'?.072:0,
      audio.currentTime, mode==='dark'||mode==='scanning'?.13:.42);
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

let trackingWorker, pendingFrame=false, lastSample=-Infinity;
let fallbackTracking=false;
let trackingAttempts=0;
let modelDownload;
function getModelFiles(){
  if(!modelDownload){
    const attempt=trackingAttempts++;
    modelDownload=import('./assets/tracking-model.mjs?models=parallel&attempt='+attempt)
      .then(async module=>{
        const controller=new AbortController();
        const timeout=setTimeout(()=>controller.abort(),35000);
        try{return {module,models:await module.downloadModels(controller.signal)};}
        finally{clearTimeout(timeout);controller.abort();}
      }).catch(error=>{modelDownload=null;throw error;});
  }
  return modelDownload;
}
function withTimeout(promise,ms){
  let timeout;
  return Promise.race([promise,new Promise((_,reject)=>{
    timeout=setTimeout(()=>reject(Error('Timed out')),ms);
  })]).finally(()=>clearTimeout(timeout));
}

async function prepareTracking(){
  if(trackingWorker || (face && hand))return;
  const {module,models}=await getModelFiles();
  startup.stage('正在启动眼动与手势识别…','设备正在初始化识别，请稍候。');
  if(!fallbackTracking && typeof Worker==='function' && typeof createImageBitmap==='function'){
    let worker;
    try{
      worker=new Worker('./assets/tracking-worker.js?models=parallel');
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(Error('Tracker startup timed out')),12000);
        worker.onmessage=({data})=>{clearTimeout(timeout);data.ready?resolve():reject(Error(data.error));};
        worker.onerror=e=>{clearTimeout(timeout);reject(Error(e.message));};
        worker.postMessage({init:true,models,preferCPU:compact});
      });
      trackingWorker=worker;
      worker.onerror=useFallback;
      worker.onmessage=({data})=>{
        pendingFrame=false;
        if(data.error){useFallback();return;}
        if(data.generation===generation && data.epoch===visibilityEpoch && stream && !document.hidden)
          receiveTracking(data.kind,data.points,data.now);
      };
      return;
    }catch(error){worker?.terminate();console.warn('Background tracking unavailable',error);}
  }
  fallbackTracking=true;
  startup.stage('正在兼容模式中启动识别…','兼容模式仍在初始化，请稍候。');
  const {makeTracker}=module;
  let expired=false;
  const create=kind=>makeTracker(kind,models[kind],{preferCPU:compact}).then(model=>{
    if(expired){model.close();throw Error('Tracker initialization expired');}
    return model;
  });
  const pending=(async()=>{
    const results=[];
    for(const kind of ['face','hand']){
      if(expired)break;
      try{results.push({status:'fulfilled',value:await create(kind)});}
      catch(error){results.push({status:'rejected',reason:error});break;}
    }
    return results;
  })();
  let results;
  try{results=await withTimeout(pending,18000);}
  catch(error){
    expired=true;
    pending.then(items=>{for(const item of items)item.value?.close();});
    throw error;
  }
  if(results.some(result=>result.status==='rejected')){
    for(const result of results)result.value?.close();
    throw Error('Tracker initialization failed');
  }
  [face,hand]=results.map(result=>result.value);
}
function useFallback(){
  trackingWorker?.terminate();trackingWorker=null;pendingFrame=false;fallbackTracking=true;
  cameraProblem('正在切换摄像头识别模式…');
}

function resize() {
  introDrawn=false;
  renderer.setPixelRatio(Math.min(devicePixelRatio,compact?.8:1,Math.sqrt(1500000/(innerWidth*innerHeight))));
  renderer.setSize(innerWidth,innerHeight,false);
  windowView.setViewport(innerWidth,innerHeight);
}
window.addEventListener('resize',resize);
function signalText(text) { feedback=text; noteUntil=gameTime+1800; }
function changePhase(next,now=gameTime) {
  phase=next; phaseTime=0; phaseAt=now;
  nextHouseFocus=null;nextHouseFocusAge=0;
  lockUntil=missUntil=0; ready=false;
  if(next!=='found')detector.reset();
  feedback=''; noteUntil=0;
  $('mode').textContent=greenhousePhase()?'水下观测舱':
    ['end','daylight'].includes(phase)?'日常视角 · 睡莲湾':'蝙蝠 · 自动回声';
  $('task').textContent=phase==='hunt'&&routeStop>0?'可再捕捉，也可跟随':tasks[phase]||'';
  $('mode').textContent=greenhousePhase()?'温室 · 激光巡检':$('mode').textContent;
  $('count').textContent=greenhousePhase()?recordCount():'已捧起 '+foundCount+' 次';

}
function begin() {
  resetFocus();$('plantLabels').replaceChildren();foundCount=routeStop=optionalWait=0;station=-1;scanning=chosenSign=null;pinch.reset(); explorer.set(0,0,0); house?.reset();
  insect.copy(locate(0).point);
  turnTo=yaw=0;tiltTo=pitch=0;
  started=true; nextEcho=0; pulse=null; echo=0;

  $('intro').hidden=true; $('experience').hidden=false; changePhase('daylight');
  ensureAudio();
}
function resetTracking(){
  briefOcclusionUntil=-Infinity;missingFace=false;
  previousFace=previousHand=lastFaceAt=lastHandAt=-Infinity;
  faceHold=420;handHold=400;
  tracker.reset();eyes.reset();pinch.reset();detector.reset();
  facePoints=handPoints=palm=null;ready=anchored=false;
  releaseSince=heldOpen=handGone=0;
}
function releaseCamera(){
  generation++;resetTracking();
  stream?.getTracks().forEach(t=>t.stop()); stream=null;video.srcObject=null;
  headYaw=headTilt=0;anchored=false;lastVideo=-1; $('cameraPreview').hidden=true;
}
async function startCamera(){
  if(cameraBusy||document.hidden)return;
  cameraBusy=true; const request=++generation;
  let step='camera';
  try{
    if(!stream){
      getModelFiles().catch(()=>{});
      startup.stage('湖面已就绪，请允许摄像头访问。','请在浏览器的摄像头提示中选择允许。');
      let expired=false;
      const permission=navigator.mediaDevices.getUserMedia({video:{width:{ideal:compact?480:640},height:{ideal:compact?360:480},facingMode:'user'},audio:false}).then(acquired=>{
        if(expired || request!==generation){acquired.getTracks().forEach(t=>t.stop());throw Error('Camera request expired');}
        return acquired;
      });
      stream=await withTimeout(permission,45000).finally(()=>{expired=true;});
      video.srcObject=stream;
      await withTimeout(video.play(),15000);
      const acquired=stream;
      acquired.getVideoTracks()[0].addEventListener('ended',()=>{if(stream===acquired)cameraProblem('摄像头已断开，请重新连接后重试。');});
    }
    step='models';
    startup.stage('正在并行下载眼动与手势模型…','识别模型仍在下载，请稍候。',12000);
    await withTimeout(prepareTrackingOnce(),69000);
    if(request!==generation)return;
    startup.done();fitPreview(); $('cameraPreview').hidden=false; startupProblem='';
    $('intro').hidden=true;$('experience').hidden=false;
    if(!started)enterExperience();
  }catch(e){
    if(request!==generation)return;
    if(step==='models'){
      console.warn(e);
      releaseCamera();
      startup.problem('眼动与手势识别未能启动，请点击重试识别。',startCamera);
      $('startupRetry').textContent='重试识别';
    }else cameraProblem(e.name==='NotAllowedError'?'请在浏览器地址栏允许摄像头访问，再点击重试。':e.name==='NotFoundError'?'请连接摄像头，再点击重试。':'摄像头连接失败或超时，请检查设备后重试。',false);
  }finally{cameraBusy=false;}
}
function enterExperience(){
  begin();
  if(new URLSearchParams(location.search).get('start')==='greenhouse')enterHouse();
  else if(saved)openMenu(true);
}
let trackingLoad;
function prepareTrackingOnce(){
  return trackingLoad??=prepareTracking().finally(()=>{trackingLoad=null;});
}
function cameraProblem(text,auto=true){
  releaseCamera();startupProblem=text;retryAt=auto?performance.now()+6000:Infinity;
  startup.problem(text,startCamera);$('intro').hidden=false;$('experience').hidden=true;
}
document.addEventListener('visibilitychange',()=>{
  visibilityEpoch++;lastFrame=performance.now();resetTracking();
  if(document.hidden){silence();audio?.suspend();}
  else{if(started)ensureAudio();if(!stream)startCamera();}
});
window.addEventListener('pagehide',()=>{releaseCamera();trackingWorker?.terminate();face?.close();hand?.close();audio?.close();});
function distanceTo(point){return screen&&point?Math.hypot((point.x-screen.x)*innerWidth,(point.y-screen.y)*innerHeight):Infinity;}
function track(now){
  if(trackingWorker && pendingFrame && now-lastSample>6000){
    useFallback();
    return;
  }
  if(!stream||cameraBusy||(!trackingWorker&&!(face&&hand))||pendingFrame||video.readyState<2||video.currentTime===lastVideo)return;
  if(now-lastSample<(trackingWorker?(compact?55:32):85))return;
  lastSample=now;lastVideo=video.currentTime;faceNext=!faceNext;
  const kind=faceNext?'face':'hand';
  if(trackingWorker){
    const request=generation, epoch=visibilityEpoch, worker=trackingWorker;
    pendingFrame=true;
    createImageBitmap(video).then(bitmap=>{
      if(request!==generation || epoch!==visibilityEpoch || document.hidden){bitmap.close();pendingFrame=false;return;}
      worker.postMessage({kind,bitmap,now,generation:request,epoch},[bitmap]);
    }).catch(()=>{if(worker===trackingWorker)useFallback();});
    return;
  }
  const result=(faceNext?face:hand).detectForVideo(video,now);
  receiveTracking(kind,(faceNext?result.faceLandmarks:result.landmarks)[0],now);
}
function receiveTracking(kind,points,sampledAt){
  const now=performance.now(), latency=now-sampledAt;
  // Face and hand share one inference slot. Allow a full round trip to each.
  const previous=kind==='face'?previousFace:previousHand;
  const interval=Number.isFinite(previous)?now-previous:0;
  const hold=clamp(Math.max(latency*2,interval)*1.4+100,kind==='face'?420:400,4000);
  if(kind==='face'){previousFace=now;faceHold=hold;}
  else{previousHand=now;handHold=hold;}
  applyTracking(kind,latency<=4000?points:null,now);
}
function applyTracking(kind,points,now){
  if(kind==='face'){
    facePoints=points;
    const seen=tracker.update(facePoints,video.videoWidth/video.videoHeight,now);
    eyes.update(facePoints);
    if(seen && tracker.neutral){
      const c=eyeCenter(facePoints),w=Math.hypot(c.eyes[3].x-c.eyes[0].x,(c.eyes[3].y-c.eyes[0].y)*video.videoHeight/video.videoWidth);
      headYaw=clamp(((facePoints[1].x-c.x)/w-tracker.neutral.yaw)*2.2,-1.45,1.45);
      const relativeY=(facePoints[1].y-c.y)/w;
      if(!anchored){tracker.noseY=relativeY;anchored=true;}
      headTilt=clamp((tracker.noseY-relativeY)*1.65,-.48,.48);
      lastFaceAt=now;
      missingFace=false;briefOcclusionUntil=-Infinity;
    }else{
      if(!missingFace && now-lastFaceAt<faceHold && (pinch.target||phase==='found')){
        briefOcclusionUntil=now+260;
      }
      missingFace=true;
      if(now<briefOcclusionUntil)return;
      lastFaceAt=-Infinity;
      ready=false;palm=null;pinch.reset();detector.reset();releaseSince=heldOpen=handGone=0;
    }
  }else{
    handPoints=points;
    const aspect=video.videoWidth/video.videoHeight;
    const nextPalm=handPoints?handCursor(handPoints,tracker.neutral,aspect):null;
    if(palm && nextPalm && now-lastHandAt<250){
      const weight=1-Math.exp(-(now-lastHandAt)/55);
      palm.x+=(nextPalm.x-palm.x)*weight;
      palm.y+=(nextPalm.y-palm.y)*weight;
    }else palm=nextPalm;
    lastHandAt=now;
    const indoors=greenhousePhase();
    const heldTarget=!menu && indoors && pinch.target===houseTarget() ? pinch.target : null;
    const control=heldTarget?'':controlAt(palm);
    if(indoors && !menu && !control && facePresent(now))observeBeds(0);
    const target=heldTarget || control || (!menu && indoors?houseTarget():null);
    const pressed=pinch.update(handPoints,aspect,now,facePresent(now)?target:null,indoors?320:55,handHold);
    if(pressed && indoors)ringFlashUntil=performance.now()+240;
    if(!heldTarget&&menuHand(now,pressed)){drawPreview();return;}
    if(!facePresent(now)){ready=false;return;}
    if(greenhousePhase()){if(pressed)confirmHouse();drawPreview();return;}
    const radius=clamp(innerHeight*(ready?.21:.17),60,185);
    const near=catchAvailable()&&screen?.inside&&distanceTo(palm)<radius;
    const gesture=detector.update(handPoints,aspect,near,now,handHold);
    ready=!!gesture?.ready;
    if(phase==='found'){
      if(gesture?.open){if(!releaseSince)releaseSince=now;heldOpen=(now-releaseSince)/1000;}
      else {releaseSince=0;heldOpen=0;}
    }else if(near&&gesture?.action==='grab'){releaseSince=0;captureFirefly();}
    else if(phase==='hunt'&&gesture?.action==='miss')missUntil=gameTime+1000;

  }
  drawPreview();
}
function catchAvailable(){return phase==='hunt'&&phaseTime>=900;}
const sunsetDuration=18400;
const sunsetView=new THREE.Vector3(-8.1,1.15,-36);
const duskFirefly=new THREE.Vector3(1.7,-.68,-5.4);
const discoveryStart=new THREE.Vector3(1.75,-.79,-5.55);
function echoActive(){
  return ['firstEcho','discovery','hunt','found','flight'].includes(phase);
}
function startFlight(){
  flightStart.copy(insect);
  routeStop++;
  if(routeStop===targetCount)loadCabin().catch(console.warn);
  destination.copy(routeStop<targetCount?locate(routeStop).point:pilotLamp);
  changePhase('flight');
  nextEcho=gameTime;
}
function captureFirefly(){
  foundCount++;heldOpen=0;handGone=0;
  if(screen&&palm){
    const spark=document.createElement('i');spark.className='caughtGlow';
    spark.style.left=screen.x*100+'%';spark.style.top=screen.y*100+'%';
    $('experience').appendChild(spark);
    const motion=spark.animate([
      {transform:'translate(-50%,-50%) scale(1)',opacity:1},
      {transform:'translate(calc(-50% + '+((palm.x-screen.x)*innerWidth)+'px),calc(-50% + '+((palm.y-screen.y)*innerHeight)+'px)) scale(.45)',opacity:.25}
    ],{duration:240,easing:'ease-out'});
    motion.onfinish=()=>spark.remove();
  }
  changePhase('found');note(0,760,.13,.17);note(.14,1110,.22,.15);
}
const handWorld=new THREE.Vector3();
function underPalm(depth){
  const p=palm||{x:.5,y:.55};
  handWorld.set(2*p.x-1,1-2*p.y,.5).unproject(camera).sub(camera.position).normalize();
  return handWorld.multiplyScalar(depth).add(camera.position);
}
function advanceBay(dt){
  if(phase==='daylight'){
    const travel=THREE.MathUtils.smoothstep(phaseTime,0,sunsetDuration-800);
    explorer.set(1.62*travel,.13*Math.sin(Math.PI*travel),-2.72*travel);
    keepDockClear(explorer);
    headingTo(sunsetView);
    insect.copy(duskFirefly);
    insect.x+=.68*Math.sin((phaseTime-11000)*.00085);
    insect.y+=.16*Math.sin(phaseTime*.002);
    if(phaseTime>=sunsetDuration+1000){
      insect.copy(locate(0).point);
      echo=1;
      changePhase('firstEcho');
      nextEcho=gameTime;
    }
  }else if(phase==='firstEcho'){
    if(pulse && gameTime-pulse.at>=Math.max(2100,(pulse.marker.delay+1.0)*1000)){
      insect.copy(discoveryStart);
      changePhase('discovery');
    }
  }else if(phase==='discovery'){
    const t=THREE.MathUtils.smoothstep(phaseTime,0,2700);
    insect.lerpVectors(discoveryStart,locate(0).point,t);
    insect.y+=.37*Math.sin(Math.PI*t);
    headingTo(insect);
    if(phaseTime>=2700)changePhase('hunt');
  }else if(phase==='hunt'){
    waypoint.copy(locate(routeStop).point);
    const settle=1-THREE.MathUtils.smoothstep(phaseTime,0,900);
    waypoint.y+=.018*Math.sin(gameTime*.003)+.17*settle;
    waypoint.x+=.19*settle*Math.sin(phaseTime*.004);
    if(catchAvailable()&&palm&&distanceTo(palm)<innerHeight*.24){
      waypoint.lerp(underPalm(camera.position.distanceTo(waypoint)),.21);
    }
    insect.lerp(waypoint,1-Math.exp(-dt*9));headingTo(locate(routeStop).point);
    if(routeStop>0){
      const reaching=palm&&distanceTo(palm)<innerHeight*.23;
      if(reaching)optionalWait=0;else optionalWait+=dt;
      // Later stops offer another catch. A resting hand cannot hold the route forever.
      if(optionalWait>5.8 || phaseTime>=10000)startFlight();
    }
  }else if(phase==='found'){
    if(palm){
      handGone=0;insect.lerp(underPalm(1.5),1-Math.exp(-dt*12));
    }else handGone+=dt;
    if(phaseTime>520 && (heldOpen>=.1||handGone>.95))startFlight();
  }else if(phase==='flight'){
    const t=clamp(phaseTime/4400,0,1);
    insect.lerpVectors(flightStart,destination,t*t*(3-2*t));insect.y+=.44*Math.sin(Math.PI*t);
    waypoint.copy(insect);waypoint.z=Math.min(explorer.z,waypoint.z+3.05);waypoint.y=0;
    explorer.lerp(waypoint,1-Math.exp(-dt*2));steer(explorer);keepDockClear(explorer);headingTo(insect);
    if(t===1){
      if(routeStop===targetCount)changePhase('end');
      else {optionalWait=0;changePhase('hunt');}
    }
  }else if(phase==='end'){
    waypoint.set(pathX(-18),0,-18);explorer.lerp(waypoint,1-Math.exp(-dt*1.35));
    if(explorer.z< -17.65 && phaseTime>2200){
      if(!enteringHouse && $('intro').hidden){enterHouse();note(0,912,.18,.16);}
    }
  }
}
function advance(dt){
  if(greenhousePhase())progressHouse(dt);else advanceBay(dt);
}


function autoEcho(){
  const marker=locate(Math.min(routeStop,targetCount-1),explorer,yaw,phase==='flight'?destination:insect);
  pulse={kind:phase==='flight'?'passage':'confirm',aim:2,marker,at:gameTime};
  nextEcho=gameTime+3000;
  note(0,1510,.085,.16);note(.22,700,.09,.055,-.3);
  note(Math.min(2.5,marker.delay),1030,.16,.17,marker.pan);
}

function projectTarget(target){
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
let lastMapAt=-Infinity;
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
  const index=greenhousePhase()?(['descent','observe','teach'].includes(phase)?4:5):Math.min(routeStop,3);
  places.forEach((v,i)=>{ctx.beginPath();ctx.arc(...at(v),i===index?5:3,0,Math.PI*2);ctx.fillStyle=i===index?'#ffc76f':'#9db4ae';ctx.fill();});
  ctx.font='16px "Microsoft YaHei", sans-serif';ctx.fillStyle='#dcece6';
  ctx.fillText('睡莲湾',55,28);ctx.fillText('坡道',181,126);ctx.fillText('温室',267,52);
  const [x,y]=at(camera.position);
  const dir=camera.getWorldDirection(projected);const facing=Math.atan2(dir.x,-dir.z);
  ctx.beginPath();ctx.moveTo(x,y);ctx.arc(x,y,23,facing-.52,facing+.52);ctx.closePath();ctx.fillStyle='#e4fff494';ctx.fill();
  ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
}

let drawnRecord=null;
function showRecord(){
  const p=focusPlant||viewed;
  const visible=['teach','inspect','complete'].includes(phase) && !scanning && p?.scanned && !chosenSign;
  $('scanRecord').hidden=!visible;
  if(!visible || drawnRecord===p)return;
  drawnRecord=p;
  $('scanRecord').classList.toggle('anomaly',p.extra);
  $('scanName').textContent=p.kind+' · '+(p.extra?'变异警示':'记录相符');
  $('scanDetail').textContent=p.finding?.[1]||'这株植物的形态与上次扫描相符。';
}
function drawUI(now,dt,present){
  if(enableSound)enableSound.hidden=audio?.state!=='suspended';
  const marker=$('marker'),handVisible=present&&palm;
  const trackingHint=present?'':facePoints && tracker.status(now)==='calibrating'?'正在校准视线，请看屏幕中央':'已暂停，正在等待人脸识别';
  if($('tracking').textContent!==trackingHint)$('tracking').textContent=trackingHint;
  $('palm').hidden=!handVisible;
  if(handVisible){$('palm').style.left=palm.x*100+'%';$('palm').style.top=palm.y*100+'%';}
  $('palm').classList.toggle('holding',phase==='found');
  $('palm').classList.toggle('reaching',phase==='hunt'&&ready);
  $('palm').textContent=phase==='found'?'':'✧';
  $('palmStatus').textContent=phase==='found'?'掌心有光':handVisible?'已看到手':'待伸手';
  $('maskEdge').style.opacity=greenhousePhase()?house.lensShade():0;
  marker.hidden=true;
  $('aimDot').hidden=true;
  if(!present){
    if(anomalyArrow)anomalyArrow.hidden=true;
    focusPlant=chosenSign=nextHouseFocus=null;focusAge=nextHouseFocusAge=0;return;
  }
  if(greenhousePhase()){
    $('mode').textContent=house.radar.visible?'激光雷达 · 点云视野':'温室 · 日常视野';
    observeBeds(dt);
  }
  showRecord();
  drawPinchRing(now,greenhousePhase() && (controlAt(palm)||houseTarget()));
  const target=chosenSign?.point||(focusPlant?plantPoint(focusPlant):insect);
  screen=projectTarget(target);
  let hint='';
  if(phase==='daylight')hint=phaseTime<9000?'夕阳正在落下，沿着湖岸看看':phaseTime<14500?'太阳沉到岸线后，水边有一点光':'夜色渐深，岸边的路慢慢隐去';
  if(phase==='firstEcho')hint='夜色遮住了湖岸，听听蝙蝠的第一声回响';
  if(phase==='discovery')hint='水边有一点光，跟着它看';
  if(phase==='hunt')hint=!catchAvailable()?'它正在落下':ready?'手指轻轻合拢，像捧住一点光':gameTime<missUntil?'再张开手，让掌心光标靠近它':
    routeStop===0?'手放在脸侧或胸前，把掌心光标移近萤火虫':'再捧一次，或放下手跟它走';
  if(phase==='found')hint='移动掌心带着它走 · 张开手放飞';
  if(phase==='flight')hint=routeStop===1&&phaseTime<2500?'蝙蝠用回声辨认水岸 · 跟着回声与光迹走':'跟着光迹，听回声掠过湖面';
  if(phase==='end')hint='萤火虫飞向巡检灯，跟着它去看看';
  if(phase==='descent')hint='跟着巡检灯，沿玻璃步道下潜';
  if(phase==='observe')hint=phaseTime<1600?'先看巡检台旁的铃兰':'水纹晃过枝头，确认这串花和上次记录是否一样';
  if(phase==='teach')hint=house.teacher.scanned?'铃兰与上次记录相符':scanning?house.scanStage():focusPlant===house.teacher?'在胸前轻捏，启用巡检头盔':'看向「铃兰」，手放在胸前';
  if(phase==='choose')hint=chosenSign?'轻捏前往'+chosenSign.name:'选择花台';
  if(phase==='walk')hint=station<0?'返回过道':'前往'+stationNames[station];
  if(['inspect','complete'].includes(phase)){
    if(scanning)hint=house.scanStage();
    else if(chosenSign)hint='轻捏'+chosenSign.name;
    else if(focusPlant)hint=focusPlant.scanned && focusPlant.extra && !focusPlant.marked?'再捏归档':'轻捏'+(focusPlant.scanned?'重看':'扫描')+focusPlant.kind;
    else hint=phase==='complete'?'自由探索 · 轻捏植物扫描':'看向植物卡片，再在胸前轻捏';
  }
  if(house?.radar.visible&&greenhousePhase()&&!scanning)hint=house.scanStage();
  if(gameTime<noteUntil)hint=feedback;
  $('guideText').textContent=hint;
  $('guideText').classList.toggle('pinchDemo',phase==='teach'&&!scanning&&!house.teacher.scanned);
  const related=['discovery','hunt','flight','end','descent'].includes(phase);
  if(related){
    marker.hidden=false;
    marker.className=[screen.inside?'':'edge',ready?'ready':'',phase==='flight'?'flying':''].join(' ');
    marker.style.left=screen.x*100+'%';marker.style.top=screen.y*100+'%';
    $('arrow').hidden=screen.inside;
    $('arrow').style.transform='rotate('+(screen.angle||0)+'deg)';
    $('bubble').hidden=true;
  }
  const listening=echoActive();
  const echoAge=pulse?(gameTime-pulse.at)/1000:-1;
  $('echoStatus').textContent=listening&&echoAge>=0?
    echoAge<.48?'回声发出':echoAge<pulse.marker.delay?'声波掠过水面':echoAge<pulse.marker.delay+1.05?'回声返回 · '+(pulse.marker.name||'前方'):'':'';
  if(!$('aimDot').hidden){
    const eye=eyes.point;
    $('aimDot').style.left=(.5+clamp((eye?.x??.5)-.5,-.35,.35)*.55)*100+'%';
    $('aimDot').style.top=(.5+clamp((eye?.y??.5)-.5,-.3,.3)*.6)*100+'%';
  }
  if(now-lastMapAt>=100){drawMap();lastMapAt=now;}
}


function frame(now){
  requestAnimationFrame(frame);
  const frameSeconds=clamp((now-lastFrame)/1000,0,.75);
  const dt=Math.min(.08,frameSeconds);lastFrame=now;
  if(document.hidden)return;
  if(startupProblem && !stream && !cameraBusy && now>=retryAt)startCamera();
  // Leave CPU and GPU time for model initialization behind the startup panel.
  if(!started && introDrawn)return;
  try{track(now);}catch(error){console.warn(error);cameraProblem('识别中断，正在重新连接…');}
  now=performance.now();
  const present=started && stream && !cameraBusy && facePresent(now);
  if(now-lastHandAt>=handHold){palm=null;ready=false;detector.reset();pinch.reset();releaseSince=heldOpen=0;}
  const pos=tracker.step(dt,now,faceHold);
  if(menu){
    $('tracking').textContent=present?'':'正在等待人脸识别，请看向屏幕中央';
    drawPinchRing(now,controlAt(palm));
    $('palm').hidden=!present||!palm;
    if(palm){$('palm').style.left=palm.x*100+'%';$('palm').style.top=palm.y*100+'%';}
    return;
  }
  if(present && !enteringHouse && $('intro').hidden){
    // Keep route time in real seconds even when rendering or CPU inference is slow.
    let remaining=frameSeconds;
    while(remaining>0){
      const step=Math.min(.08,remaining);
      gameTime+=step*1000;phaseTime+=step*1000;advance(step);remaining-=step;
    }
  }
  const indoors=greenhousePhase();
  const comparison=indoors?house.comparisonTarget():null;
  if(comparison&&present)headingTo(comparison);
  const gaze=eyes.point;
  const touring=phase==='daylight'||phase==='firstEcho';
  const catching=phase==='hunt'||phase==='found';
  const eyeWeight=comparison?.24:indoors?.64:touring?.88:catching?.29:.42;
  const gazeRange=phase==='firstEcho'?.53:touring?1-0.42*THREE.MathUtils.smoothstep(phaseTime,3100,8400):1;
  const headWeight=indoors?.15:touring?.08:catching?.23:.56;
  const lookYaw=headWeight*quietLook(headYaw,.10,1.45)+gazeRange*quietLook(.5-(gaze?.x??.5),indoors?.14:.09,.46)*1.55*eyeWeight;
  const lookPitch=headWeight*quietLook(headTilt,.055,.48)+gazeRange*quietLook(.5-(gaze?.y??.5),indoors?.12:.07,.45)*.95*eyeWeight;
  const selected=focusPlant||chosenSign;
  const aiming=indoors && selected && !scanning;
  // Keep the camera stable while the hand confirms the selected card.
  const settle=(aiming && (focusAge<.45 || pinch.target===selected))
    || (indoors && house.scanSettling()) || (phase==='hunt' && ready);
  if(!settle){
    yaw=followAngle(yaw,turnTo+lookYaw,dt,indoors?(aiming?.30:.58):catching?.42:.92);
    pitch=followAngle(pitch,tiltTo+lookPitch,dt,indoors?(aiming?.20:.38):catching?.32:.62);
    const weight=1-Math.exp(-dt*(aiming?2.2:5));
    viewShift.lerp(desiredShift.copy(pos).multiplyScalar(indoors?.17:catching?.25:.32),weight);
  }
  windowView.viewFrom(viewShift,yaw,pitch,explorer);camera.updateMatrixWorld();

  const listening=echoActive();
  if(present && listening && !['found','discovery'].includes(phase) && gameTime>=nextEcho &&
      (phase!=='firstEcho'||!pulse))autoEcho();
  const dusk=phase==='daylight'?clamp((phaseTime-1300)/(sunsetDuration-1300),0,1):0;
  if(phase==='daylight')echo=THREE.MathUtils.smoothstep(dusk,.60,1);
  else if(present)echo+=((listening||phase==='end'||phase==='descent'?1:0)-echo)*(1-Math.exp(-frameSeconds*2.3));
  const age=pulse?(gameTime-pulse.at)/1000:-1;
  updatePond(gameTime/1000,echo,age,insect,started?1:0,listening?pulse:null,camera,phase=== 'hunt'?phaseTime/1000:-1,phase,phaseTime/1000,true,dusk);
  const submerged=greenhousePhase() && explorer.y < -1.65;
  scene.fog=submerged?house.waterFog:null;
  if(house?.room.visible){
    house.setObservation(phase==='observe'||phase==='teach'&&!house.teacher.scanned&&!scanning);
    house.tick(present?frameSeconds:0,gameTime,playScanCue);
  }
  soundscape(now,listening||echo>.48);
  if(started)drawUI(now,dt,present);
  camera.layers.set(submerged?1:0);
  if(started && present && !submerged && !compact)reflect(renderer,camera,now);
  renderer.render(scene,camera);
  if(!started)introDrawn=true;
  camera.layers.set(0);
}
resize();
requestAnimationFrame(frame);
startCamera();
