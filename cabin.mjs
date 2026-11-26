import * as T from './vendor/three.module.js';
import { scanDuration, pathX, floorAt, pilotLamp } from './cabin-route.mjs?survey=9';
export { scanDuration, pathX, floorAt, pilotLamp };

const V=(x,y,z)=>new T.Vector3(x,y,z);
const clamp=T.MathUtils.clamp, tau=2*Math.PI;
export const samples=[-29.7,-34.8,-39.2].map(z=>V(-.26,-4.12,z));
export const flower=samples[0];
export const tip=samples[1].clone().add(V(.76,.28,.28));

function sheet(n,m,fn){
  const verts=[],indices=[];
  for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){
    verts.push(...fn(i/n,j/m));
    if(i&&j){const k=i*(m+1)+j;indices.push(k-m-2,k-1,k,k-m-2,k,k-m-1);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));
  g.setIndex(indices);g.computeVertexNormals();return g;
}
export function makeCabin(scene,{compact=false}={}){
  const room=new T.Group(),exterior=new T.Group();
  scene.add(room);room.add(exterior);
  const time={value:0},age={value:9},origin={value:flower.clone()},scanBlend={value:0};
  const observation={value:0},observationTarget={value:V(-.62,-4.05,-29.86)};
  let observing=false;
  const sweepDistance={value:-2};
  const sweep=`
    uniform vec3 sweepOrigin;
    uniform float sweepDistance;
    float scanEdge(vec3 p){
      vec3 d=(p-sweepOrigin)*vec3(.85,.72,1.);
      return sweepDistance-length(d);
    }`;
  let seed=4287;
  const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const caustic=`
    float lattice(vec2 p,float t){
      vec2 q=p+vec2(.28*sin(p.y*2.+t),.29*sin(p.x*1.8-t*.77));
      float d=abs(sin(q.x*2.7+t*.44)+.74*sin(q.y*3.1-t*.53)+.28*sin(q.x*4.+q.y*2.+t*.2));
      return .66*exp(-d*16.)+.18*exp(-d*3.);
    }`;
  function finish(color,metalness=0,roughness=.4){
    const mat=new T.MeshStandardMaterial({color,metalness,roughness,side:T.DoubleSide});
    mat.onBeforeCompile=sh=>{
      sh.uniforms.waterTime=time;
      sh.uniforms.scanBlend=scanBlend;
      sh.uniforms.sweepOrigin=origin;
      sh.uniforms.sweepDistance=sweepDistance;
      sh.uniforms.observation=observation;
      sh.uniforms.observationTarget=observationTarget;
      sh.vertexShader='varying vec3 waterPos;\n'+sh.vertexShader.replace('#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvec4 waterVertex=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nwaterVertex=instanceMatrix*waterVertex;\n#endif\nwaterPos=(modelMatrix*waterVertex).xyz;');
      sh.fragmentShader='varying vec3 waterPos; uniform float waterTime, scanBlend, observation; uniform vec3 observationTarget;\n'+caustic+sweep+'\n'+sh.fragmentShader.replace('#include <opaque_fragment>',
        `outgoingLight+=vec3(.13,.31,.28)*lattice(waterPos.xz+waterPos.y*vec2(.43,.35),waterTime)*smoothstep(1.,5.,-waterPos.y);
        vec3 fromPlant=waterPos-observationTarget;
        float onFlower=1.-smoothstep(.25,.91,length(fromPlant*vec3(1.,.81,1.)));
        float ripple=pow(.5+.5*sin(waterPos.y*18.+waterPos.x*7.+waterTime*2.2),5.);
        float glare=onFlower*ripple*observation*(1.-scanBlend);
        outgoingLight=mix(outgoingLight,vec3(.48,.73,.68),glare*.68);
        float fade=smoothstep(-.20,.72,scanEdge(waterPos));
        outgoingLight=mix(outgoingLight,vec3(.0023,.005,.010),fade);
        #include <opaque_fragment>`);
    };return mat;
  }
  const alloy=finish(0x89a8ab,.42), enamel=finish(0x254653,.3), bronze=finish(0xb19876,.45), deck=finish(0x809ca0,.16);
  const leaf=finish(0x76bca5), vein=finish(0xa6cbb4), petal=finish(0xe8b8ce), amber=finish(0xe9c187);
  const pane=new T.MeshPhysicalMaterial({color:0x90d2d7,transparent:true,opacity:.085,depthWrite:false,side:T.DoubleSide,roughness:.2,clearcoat:.7});
  const lights=new T.Group();lights.add(new T.HemisphereLight(0xdeffff,0x8191a6,1.55));
  const sun=new T.DirectionalLight(0xd8faf2,1.8);sun.position.set(-3,6,-2);lights.add(sun);room.add(lights);
  const batches=new Map();
  function mesh(g,mat,density=0){
    if(mat.transparent){const obj=new T.Mesh(g,mat);room.add(obj);return obj;}
    const batch=batches.get(mat)??[[],[]];batches.set(mat,batch);
    const pos=g.attributes.position,norm=g.attributes.normal,idx=g.index,sz=idx?.count??pos.count;
    for(let i=0;i<sz;i+=3){
      for(let j=0;j<3;j++){
        const k=idx?idx.getX(i+j):i+j;

        batch[0].push(pos.getX(k),pos.getY(k),pos.getZ(k));batch[1].push(norm.getX(k),norm.getY(k),norm.getZ(k));
      }
    }
    g.dispose();
  }
  function box(x,y,z,w,h,d,m=alloy,den=55){mesh(new T.BoxGeometry(w,h,d).translate(x,y,z),m,den);}
  function tube(pts,radius,m=alloy,den=220){
    const c=new T.CatmullRomCurve3(pts.map(pt=>V(...pt)));
    mesh(new T.TubeGeometry(c,pts.length===2?1:Math.min(48,pts.length*4),radius,8,false),m,den);
  }
  function disc(x,y,z,r,h,m){mesh(new T.CylinderGeometry(r,r*.98,h,32).translate(x,y,z),m,180);}
  function ring(x,y,z,r,t,m){mesh(new T.TorusGeometry(r,t,8,64).rotateX(Math.PI/2).translate(x,y,z),m,300);}
  const strip=(a,b)=>mesh(sheet(46,1,(s,t)=>[a+(b-a)*t,floorAt(-16-26*s),-16-26*s]),deck,90);
  strip(-1.85,3.38);
  const arch=(z,t)=>[.76+2.62*Math.cos(t*Math.PI),floorAt(z)+.16+3.18*Math.sin(t*Math.PI),z];
  mesh(sheet(34,28,(s,t)=>arch(-17.7-24.3*s,t)),pane,0);
  for(let i=0;i<=12;i++){
    const z=-17.7-i*2;
    tube(Array.from({length:25},(_,j)=>arch(z,j/24)),.056,enamel,250);
    for(const t of [.18,.82]){
      const [x,y]=arch(z,t);
      box(x,y,z,.13,.19,.13,alloy);
      for(const off of [-.05,.05])box(x,y+off,z+.074,.035,.035,.02,bronze);
    }
  }
  for(const t of [.12,.5,.87])tube(Array.from({length:23},(_,i)=>arch(-17.7-i*1.1,t)),.036,alloy);
  for(const x of [.57,2.42]){
    tube(Array.from({length:20},(_,i)=>[pathX(-17-i*1.28)+x-1.45,floorAt(-17-i*1.28)+.018,-17-i*1.28]),.016,bronze);
    for(let i=0;i<9;i++){const z=-18.6-i*.91;box(x,floorAt(z)+.08,z,.06,.12,.26,bronze);}
  }
  const lamp=new T.MeshBasicMaterial({color:0x836e45});
  disc(pilotLamp.x,-.77,pilotLamp.z,.053,1.,enamel);
  mesh(new T.SphereGeometry(.079,16,12).translate(...pilotLamp.toArray()),lamp);
  // The pressure bulkhead, seam bolts and three specimen cradles stay fixed across readings.
  box(.76,-3.8,-42,5.2,3.4,.19,enamel);

  // The inspection visor sits beside the first specimen, within the same view.
  const consoleX=1.67,consoleZ=-30.03;
  const shell=finish(0x435760,.34,.42),visor=finish(0x192b3c,.49,.2);
  const sensor=finish(0x8598a2,.63,.23);
  box(consoleX,-4.93,consoleZ,.39,.72,.40,enamel);
  mesh(new T.BoxGeometry(.69,.09,.47).translate(consoleX,-4.54,consoleZ),alloy);
  mesh(new T.SphereGeometry(1,24,12).scale(.30,.175,.186).translate(consoleX,-4.34,consoleZ),shell);
  mesh(sheet(12,28,(t,s)=>{
    const a=(s-.5)*2.58, y=(t-.5)*2;
    return [consoleX+.316*Math.sin(a),-4.33+y*(.09+.037*Math.cos(a)),
      consoleZ+.055+.166*Math.cos(a)-.025*y*y];
  }),visor);
  for(const side of [-1,1]){
    const x=consoleX+side*.284;
    mesh(new T.SphereGeometry(1,12,8).scale(.060,.060,.055).translate(x,-4.33,consoleZ+.105),sensor);
    mesh(new T.SphereGeometry(.023,12,8).translate(x,-4.33,consoleZ+.148),lamp);
  }

  const scanRailY=-2.58;
  for(const x of [.20,.44])tube([[x,scanRailY,-27.5],[x,scanRailY,-41]],.039,alloy);
// These fictional specimens compare shape, without assigning a medical cause.
  const findings={
    '鹿角蕨':['扇状叶冠','上次叶尖分成两叉；本次末端展宽，长出梳齿状叶冠。'],
    '羽叶蕨':['叶轴下卷','上次羽叶向上展开；本次一整片叶轴向下反卷，小叶随之翻转。'],
    '铃兰':['花器叶化','上次枝头垂着钟形花；本次顶端两朵花的位置展开了叶片。'],
    '披针叶草':['基部丛芽','上次是五片高叶；本次叶基多出一团密集的短芽。']
  };
  const soil=finish(0x344e48), fern=finish(0x65af85), midrib=finish(0xb5cc89), bell=finish(0xf3ded5);
  const warpedLeaf=finish(0x678580), warpedRib=finish(0x867c8e);

  const warningCues={
    '鹿角蕨':[[.27,.73,425,.32,1.53]],
    '羽叶蕨':[[.19,.49,680,.16,.89],[.76,.52,475,.22,.78]],
    '铃兰':[[.16,.38,780,.12,.96],[.81,.42,593,.17,.94]],
    '披针叶草':[[.12,.31,360,.12,.91],[.48,.31,325,.13,.89],[.92,.41,287,.18,.83]]
  };
  const pots=[];
  function specimen(kind,extra,demo=false){
    const group=new T.Group();
    room.add(group);
    const target=V(0,.47,0),archive=[];
    function part(geometry,material,changed=false,warningBand=0){
      if(changed==='past'){archive.push(geometry);return;}
      const piece=new T.Mesh(geometry,material);
      piece.userData.changed=changed;
      piece.userData.warningBand=warningBand;
      group.add(piece);
    }

    function stem(pts,r,m=midrib,newGrowth=false){
      const curve=new T.CatmullRomCurve3(pts.map(p=>V(...p)));
      part(new T.TubeGeometry(curve,48,r,7,false),m,newGrowth);
    }
    function blade(x,y,dx,dy,w,newGrowth=false,z=.02,warningBand=0){
      function surface(t,s){
        const side=(s-.5)*2*w*Math.pow(Math.sin(Math.PI*t),.62);
        const twist=newGrowth===true?1.25*Math.sin(t*3.5):0;
        const curl=newGrowth===true?.09*t*t*Math.sin(t*4.5):0;
        return [x+dx*t+side*Math.cos(twist),y+dy*t-side*dx*.55+curl,
          z+.085*Math.sin(t*Math.PI)+.024*(1-Math.abs(s*2-1))+side*Math.sin(twist)];
      }
      part(sheet(16,4,surface),newGrowth?warpedLeaf:fern,newGrowth,warningBand);
      if(newGrowth===true)target.set(...surface(.72,.5));
      if(extra&&kind==='披针叶草'&&!newGrowth)archive.push(sheet(7,4,(t,s)=>surface(t*.32,s)));
    }
    if(kind==='鹿角蕨'){
      for(const side of [-1,1]){
        blade(0,.01,side*.17,.43,.095);
        const oldTip=extra && side===1?'past':false;
        blade(side*.17,.42,side*.14,.26,.067,oldTip);
        blade(side*.17,.42,-side*.065,.32,.052,oldTip);
      }
      if(extra){
        // A broad corrugated fan replaces the two terminal lobes.
        function fan(t,u){
          const edge=1-u*u;
          const folds=Math.cos(u*Math.PI*4);
          return [.17+.21*t+u*(.018+.32*t),.42+t*(.18+.17*edge-.09*u+.052*folds),
            .03+t*(.08+.045*edge+.062*u)+.05*Math.sin(t*Math.PI)+.029*t*folds];
        }
        part(sheet(18,40,(t,s)=>fan(t,2*s-1)),warpedLeaf,true);
        target.set(...fan(.8,0));
      }
    }else if(kind==='羽叶蕨'){
      for(const side of [-1,1]){
        const curled=extra && side===1;
        const axis=new T.CatmullRomCurve3([V(0,0,0),V(side*.06,.24,0),V(side*.16,.47,.025),V(side*.27,.64,.035)]);
        part(new T.TubeGeometry(axis,30,.015,7,false),midrib,curled?'past':false);
        for(let j=0;j<6;j++){
          const y=.12+j*.078,x=side*(.025+j*.032);
          for(const wing of [-1,1])blade(x,y,wing*(.16-j*.018),.10,.026,curled?'past':false,.025);
        }
      }
      if(extra){
        const arc=new T.CatmullRomCurve3([V(0,0,0),V(.09,.29,.03),V(.28,.48,.06),V(.53,.36,.16),V(.46,.13,.24),V(.29,.12,.21)]);
        part(new T.TubeGeometry(arc,42,.017,8,false),warpedRib,true);
        for(let i=1;i<=7;i++){
          const t=i/8,at=arc.getPoint(t),dir=arc.getTangent(t);
          for(const wing of [-1,1])blade(at.x,at.y,.07*dir.x+wing*.13*dir.y,.07*dir.y-wing*.13*dir.x,.031,true,at.z,i/8);
        }
        target.copy(arc.getPoint(.84));
      }
    }else if(kind==='披针叶草'){
      for(let j=0;j<5;j++)blade(0,.01,(j-2)*.085,.48+(.12*(j%2)),.04);
      if(extra){
        for(let j=0;j<15;j++){
          const angle=j*2.4,r=.037+.009*j,h=.125+.13*(1-j/16)+.038*Math.sin(j*1.8);
          blade(.16+r*Math.cos(angle),.016,Math.cos(angle)*.115,h,.031,true,.12+r*Math.sin(angle));
        }
        target.set(.17,.16,.16);
      }
    }else{
      for(let j=0;j<2;j++)blade(0,.01,j?.16:-.15,.42,.055);
      stem([[0,0,0],[-.05,.36,0],[.01,.64,0],[.12,.73,0]],.017);
      for(let j=0;j<4;j++){
        const x=.03+j*.03,y=.41+j*.09;
        stem([[0,y,0],[x+.07,y+.04,0],[x+.09,y+.01,0]],.009);
        const replaced=extra && j>=2;
        const bellSurface=(t,s)=>{const a=s*tau,r=.045*(.18+Math.sin(t*1.9)+.28*t**4);return [x+.09+r*Math.cos(a),y-.082*t+.007*t**3*Math.cos(6*a),r*Math.sin(a)];};
        part(sheet(10,20,bellSurface),bell,replaced?'past':false);
        if(replaced){
          blade(x+.09,y+.01,.26,.15,.085,true,.02,j-2);
          blade(x+.09,y+.01,-.13,.17,.06,true,.02,j-2);
        }
      }
    }
    const tray=new T.Mesh(new T.CylinderGeometry(.39,.30,.16,40),alloy);tray.position.y=-.10;group.add(tray);
    const foot=new T.Mesh(new T.CylinderGeometry(.13,.18,.54,20),enamel);foot.position.y=-.41;group.add(foot);
    const bed=new T.Mesh(new T.CylinderGeometry(.355,.35,.025,36),soil);bed.position.y=-.012;group.add(bed);
    const plant={group,kind,extra,demo,target,archive,finding:extra?findings[kind]:null,
      scanned:false,marked:false,age:Infinity};
    pots.push(plant);return plant;
  }
const bedLights=[];
  const lilac=finish(0xb1a0ce), sage=finish(0x739b7d), moss=finish(0x628268), blossom=finish(0xdbaec1);
  const damp=finish(0x568e8c,.38,.18);
  const plantingX=(side,z)=>side===0?-.80+.18*Math.sin((z+29)*.62):2.40+.12*Math.sin(z*.56);
  for(const side of [0,1]){
    const start=side===0?-27.8:-30.4,end=side===0?-40.1:-41;
    const line=Array.from({length:26},(_,i)=>start+(end-start)*i/25);
    for(const [width,y,mat] of [[1.12,-4.74,enamel],[1.02,-4.67,side===0?moss:damp]]){
      mesh(sheet(30,2,(t,s)=>{const z=start+(end-start)*t;return [plantingX(side,z)+(s-.5)*width,y,z];}),mat);
    }
    for(const sign of [-1,1]){
      const rim=line.map(z=>[plantingX(side,z)+sign*.56,-4.68,z]);
      tube(rim,.042,alloy);
      tube(rim.map(([x,y,z])=>[x,y-.12,z]),.037,enamel);
    }
    for(let z=start-.6;z>end;z-=1.8){
      box(plantingX(side,z),-5.02,z,.13,.53,.13,enamel);
    }
    const lit=new T.MeshBasicMaterial({color:0xa7f5da,transparent:true,opacity:.26});
    const rail=line.map(z=>V(plantingX(side,z)+(side===0?.57:-.57),-4.655,z));
    const obj=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(rail),36,.017,6,false),lit);
    room.add(obj);bedLights.push(obj);
  }
  const seats=[[-.91,-31.1],[-.85,-32.35],[-.92,-33.6],[-.86,-34.85],[2.36,-36.5],[2.39,-37.75],[2.36,-39],[2.40,-40.25]];
  const teacher=specimen('铃兰',false,true);
  teacher.group.position.set(-.62,-4.65,-29.86);
  for(const [side,kinds] of [[0,['鹿角蕨','鹿角蕨','铃兰','披针叶草']],[1,['羽叶蕨','羽叶蕨','铃兰','披针叶草']]]){
    kinds.forEach((kind,i)=>{const p=specimen(kind,i===1 || (side===0?i===2:i===3));p.station=side;});
  }
  function arrange(){
    for(const side of [0,1]){
      const row=pots.filter(p=>!p.demo&&p.station===side);
      // Keep specimen positions stable so the room scan matches each pot.
      row.forEach((p,i)=>{const [x,z]=seats[side*4+i];p.group.position.set(x,-4.65,z);p.number=i+1;});
    }
    for(const p of pots){p.scanned=p.marked=false;p.examined=false;p.away=0;p.watch=0;p.hintAge=-1;p.hintPlayed=false;p.age=Infinity;}
  }
  arrange();
  // Vegetation is batched by material. Leave viewing windows around the six interactive plants.
  function leafBlade(x,y,z,angle,length,width,lift,mat){
    const c=Math.cos(angle),s=Math.sin(angle);
    mesh(sheet(8,4,(t,v)=>{
      const w=(v-.5)*2*width*Math.sin(Math.PI*t)**.75;
      return [x+c*t*length-s*w,y+lift*Math.sin(t*2.1)+.035*(1-Math.abs(v*2-1))*Math.sin(Math.PI*t),z+s*t*length+c*w];
    }),mat);
  }
  const cushion=finish(0x90a885), softPink=finish(0xedc1c3), pollen=finish(0xe5cf87);
  for(let side=0;side<2;side++){
    for(let j=0;j<105;j++){
      const z=(side===0?-27.95:-30.65)-rand()*(side===0?11.9:9.95);
      const x=plantingX(side,z)+(rand()-.5)*.88;
      if([[-.69,-29.15],...seats].some(([px,pz])=>Math.hypot(x-px,z-pz)<.43))continue;
      if(side===1 && j%4!==0)continue; // Leave visible water between floating seedling islands.
      const r=.055+rand()*.12;
      mesh(new T.IcosahedronGeometry(r,1).scale(1.4,.43,1).translate(x,-4.654,z),j%3?moss:cushion);
      for(let k=0;k<3;k++)leafBlade(x,-4.63,z,k*2.1+j,.09+rand()*.07,.029,.055+rand()*.10,leaf);
      if(j%5===0){
        const y=-4.53+rand()*.07;
        tube([[x,-4.64,z],[x+.02,y-.04,z],[x,y,z]],.004,vein);
        for(let k=0;k<5;k++){
          const a=k*tau/5;
          mesh(new T.SphereGeometry(.025,8,5).scale(1,.46,.82).translate(x+.021*Math.cos(a),y,z+.021*Math.sin(a)),softPink);
        }
        mesh(new T.SphereGeometry(.011,7,5).translate(x,y+.009,z),pollen);
      }
    }
  }
  for(let side=0;side<2;side++){
    const end=side===0?-39.9:-40.8;
    for(let z=side===0?-27.95:-30.9;z>end;z-=.39+rand()*.38){
      const x=plantingX(side,z)+(rand()-.5)*.54,y=-4.65;
      if([[-.69,-29.15],...seats].some(([px,pz])=>Math.hypot(x-px,z-pz)<.57))continue;
      const size=.55+rand()*.63;
      if(rand()<.48){
        for(let j=0;j<4;j++){
          const a=j*1.53+rand(),c=Math.cos(a),s=Math.sin(a),h=(.24+rand()*.27)*size;
          const stalk=Array.from({length:6},(_,k)=>[x+c*k*.057,y+h*Math.sin(k*.34),z+s*k*.057]);
          tube(stalk,.006,vein);
          for(let k=1;k<6;k++)for(const turn of [-1,1]){
            const [px,py,pz]=stalk[k];leafBlade(px,py,pz,a+turn*.94,(.18-.019*k)*size,.022,.032,sage);
          }
        }
      }else{
        for(let k=0;k<6;k++)leafBlade(x,y,z,k*1.04+rand()*.38,(.19+rand()*.16)*size,.075*size,(.22+rand()*.24)*size,k%3===0?lilac:leaf);
        if(rand()<.48){
          const h=.35*size;tube([[x,y,z],[x+.02,y+h*.65,z],[x+.09,y+h,z]],.009,vein);
          for(let j=0;j<3;j++)mesh(new T.SphereGeometry(.036,8,6).scale(1,.85,1).translate(x+.06+j*.025,y+h-.022*j,z+.02*j),blossom);
        }
      }
    }
  }
  // Seedling trays and two ventilated glass covers sit off the inspection bays.
  for(const [side,z] of [[0,-36.5],[1,-34.6]]){
    const x=plantingX(side,z);
    disc(x,-4.63,z,.32,.065,alloy);ring(x,-4.59,z,.30,.014,bronze);
    mesh(new T.SphereGeometry(.29,20,12,0,tau,0,Math.PI*.5).scale(1,1.6,1).translate(x,-4.6,z),pane);
    for(let j=0;j<3;j++)leafBlade(x,-4.60,z,j*2,.16,.04,.18,leaf);
    box(x,-4.70,z+.64,.62,.09,.40,bronze);
    for(const dx of [-.17,0,.17])for(const dz of [-.10,.09]){
      disc(x+dx,-4.635,z+.64+dz,.055,.02,soil);
      leafBlade(x+dx,-4.62,z+.64+dz,dx*8,.055,.02,.065,sage);
    }
  }


  const orchid=finish(0x7357b5),aqua=finish(0x49bda8),indigo=finish(0x383a77);
  const blossoms=new Set([orchid,softPink,blossom,lilac,pollen,bell]);
  const foliage=new Set([fern,midrib,warpedLeaf,warpedRib,leaf,vein,sage,aqua,moss,indigo,cushion]);
  const stalks=compact?14:24;
  for(const side of [0,1]){
    let z=side===0?-27.62:-28.94;
    for(let i=0;i<stalks&&z>-41;i++){
      z-=.18+rand()*(i%5===4?1.54:.62);
      const x=side===0?-1.54-rand()*.27:3.0+rand()*.26;
      const inward=side===0?1:-1, y=-4.72;
      const h=i%8===3?1.28+rand()*.40:.19+rand()*.86;
      const reach=.11+rand()*.27;
      const tipX=x+inward*reach,tipY=y+h,tipZ=z+.16*(rand()-.4);
      tube([[x,y,z],[x-inward*.10,y+h*.43,z-.13],[tipX,tipY,tipZ]],.012+rand()*.012,indigo);
      for(let j=0;j<5+Math.floor(rand()*4);j++){
        leafBlade(x,y+.05,z,j*2.39+i*.69,.20+rand()*.28,.036+rand()*.048,.09+rand()*.44,j%3===0?aqua:leaf);
      }
      if((i+side)%5<2){
        const width=.22+rand()*.31,turn=rand()*tau,lobes=4+Math.floor(rand()*4);
        mesh(sheet(10,24,(t,s)=>{
          const angle=s*tau+turn,r=t*width*(1+.14*Math.cos(angle*lobes));
          return [tipX+r*Math.cos(angle),tipY+(.22+.10*Math.cos(angle+turn))*t*t,tipZ+r*Math.sin(angle)*.75];
        }),i%3===0?lilac:orchid);
        mesh(new T.SphereGeometry(width*.17,10,7).translate(tipX,tipY+.032,tipZ),aqua);
      }else{
        const fronds=4+Math.floor(rand()*5);
        for(let j=0;j<fronds;j++){
          leafBlade(tipX,tipY-j*.061,tipZ,j*2.39+i,.13+rand()*.28,.028+rand()*.042,.05+rand()*.13,j%2?aqua:sage);
        }
      }
    }
  }

  // Asymmetric groups leave gaps between hanging crowns and along the aisle.
  const hangingSites=[
    [-.83,-29.2,1.04,'bells'],[-1.38,-29.67,.62,'thread'],[-.58,-30.41,.78,'fronds'],
    [-1.21,-34.38,.86,'thread'],[-.86,-34.86,1.22,'bells'],[-1.43,-37.96,.71,'fronds'],
    [2.47,-28.17,.74,'fronds'],[2.67,-32.64,.86,'bells'],[2.13,-32.95,1.25,'thread'],
    [2.84,-33.63,.65,'fronds'],[2.42,-37.42,1.08,'bells'],[2.94,-38.11,.70,'thread'],
    [2.51,-40.42,.88,'fronds']
  ];
  for(const [i,[x,z,length,shape]] of hangingSites.entries()){
    if(compact&&i%3===2)continue;
    const crownY=-2.22+rand()*.17,bend=(rand()-.5)*.48,dz=(rand()-.5)*.62;
    const curve=new T.CatmullRomCurve3([
      V(x,crownY,z),V(x+bend*.88,crownY-length*.34,z+dz*.42),
      V(x+bend,crownY-length*.69,z+dz*.8),V(x+bend*.52,crownY-length,z+dz)
    ]);
    mesh(new T.TubeGeometry(curve,12,shape==='thread'?.008:.014,6,false),indigo);
    if(shape==='bells'){
      const count=2+Math.floor(rand()*4);
      for(let j=0;j<count;j++){
        const at=curve.getPoint(.44+.52*j/Math.max(1,count-1)),r=.032+rand()*.047;
        const angle=rand()*tau,dx=Math.cos(angle)*(.10+rand()*.075),dz=Math.sin(angle)*.15;
        const end=at.clone().add(V(dx,-.14-r,dz));
        tube([at.toArray(),[at.x+dx*.6,at.y-.035,at.z+dz*.8],end.toArray()],.007,lilac);
        mesh(sheet(8,15,(t,s)=>{
          const a=s*tau,w=r*(.16+.92*Math.sin(t*1.37)+.17*Math.sin(5*a)*t*t);
          return [end.x+w*Math.cos(a),end.y-r*1.27*t,end.z+w*Math.sin(a)];
        }),j%2===0?orchid:lilac);
      }
    }else if(shape==='thread'){
      const tip=curve.getPoint(1);
      for(let j=0;j<3+i%3;j++){
        const angle=j*2.39+i,l=.13+rand()*.43;
        const x=tip.x+.13*Math.cos(angle),z=tip.z+.13*Math.sin(angle);
        tube([tip.toArray(),[x,tip.y-l*.51,z],[x+.07*Math.sin(angle),tip.y-l,z+.04]],.005,aqua);
        mesh(new T.SphereGeometry(.024+rand()*.018,8,6).scale(.78,1.6,.78).translate(x+.07*Math.sin(angle),tip.y-l,z+.04),orchid);
      }
    }else{
      for(let j=0;j<6+i%3;j++){
        const at=curve.getPoint(.26+j*.072),angle=j*2.39+i;
        leafBlade(at.x,at.y,at.z,angle,.19+rand()*.27,.024+rand()*.026,-.10-rand()*.21,j%3?aqua:lilac);
      }
      const tip=curve.getPoint(.91);
      mesh(new T.SphereGeometry(.073,10,7).scale(.79,1.44,.85).translate(tip.x,tip.y-.09,tip.z),orchid);
    }
  }

  // Pots stay in fixed seats. Share draw calls with the room, while the
  // comparison readings and label anchors remain attached to each specimen.
  const variants=new Map();
  for(const plant of pots){
    plant.group.updateMatrix();
    for(const part of [...plant.group.children]){
      if(!part.isMesh)continue;
      part.updateMatrix();
      part.geometry.applyMatrix4(part.matrix).applyMatrix4(plant.group.matrix);
      if(part.userData.changed){
        const pieces=variants.get(plant)??[];
        pieces.push({geometry:part.geometry.clone(),band:part.userData.warningBand});
        variants.set(plant,pieces);
      }
      mesh(part.geometry,part.material);
      plant.group.remove(part);
    }
  }
  for(const [m,[positions,normals]] of batches){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));room.add(new T.Mesh(g,m));
  }
  // Beyond the pressure windows: a blue depth gradient, moving surface underside, lakebed and reeds.
  const sea=new T.Mesh(new T.SphereGeometry(47,28,20),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,
    uniforms:{t:time,scanBlend},vertexShader:'varying vec3 d;void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 d;uniform float t,scanBlend;void main(){vec3 dir=normalize(d);float h=smoothstep(-.35,.9,dir.y);vec3 c=mix(vec3(.008,.052,.095),vec3(.12,.46,.50),h);vec3 night=mix(vec3(.0015,.004,.008),vec3(.009,.019,.031),h)+vec3(.012,.021,.029)*pow(max(0.,dot(dir,normalize(vec3(-.25,.32,-1.)))),14.); gl_FragColor=vec4(mix(c,night,scanBlend),1.);\n#include <colorspace_fragment>\n}'}));
  sea.position.set(0,-4,-31);sea.renderOrder=-90;exterior.add(sea);
  const ceiling=new T.Mesh(new T.PlaneGeometry(60,60,60,60),new T.ShaderMaterial({side:T.DoubleSide,uniforms:{t:time,scanBlend},
    vertexShader:`uniform float t;varying vec2 p;void main(){p=position.xy;vec3 a=position;a.z=.07*sin(p.x*1.2+t)+.04*sin(p.y*2.-t*.9);gl_Position=projectionMatrix*modelViewMatrix*vec4(a,1.);}`,
    fragmentShader:'varying vec2 p;uniform float t,scanBlend;'+caustic+'void main(){float k=lattice(p*.7,t);gl_FragColor=vec4(mix(vec3(.08,.39,.45)+k*vec3(.14,.30,.26),vec3(.009,.014,.047),smoothstep(0.,.56,scanBlend)),1.);\n#include <colorspace_fragment>\n}'}));
  ceiling.rotation.x=-Math.PI/2;ceiling.position.set(0,-1.42,-49);exterior.add(ceiling);
  // End the substitute water surface at the dry ramp opening.
  ceiling.material.fragmentShader=ceiling.material.fragmentShader.replace('float k=lattice','float zz=-49.-p.y;float dx=(p.x-.76)/2.62;float fy=-1.27-4.05*smoothstep(17.7,27.,-zz);if(zz< -17.7 && abs(dx)<1. && fy< -1.42 && fy+.16+3.18*sqrt(max(0.,1.-dx*dx))> -1.42)discard;float k=lattice');
  const bed=new T.Mesh(sheet(40,48,(i,j)=>{const x=-30+i*60,z=-61+j*54;return [x,-6.05+.25*Math.sin(x*1.6+z*.6)+.15*Math.cos(z),z];}),finish(0x426b70));
  exterior.add(bed);
  const transform=new T.Object3D();
  const stones=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),finish(0x4e767c),160);
  for(let i=0;i<160;i++){
    const x=(rand()<.52?-1:1)*(3.9+rand()*15),z=-18-rand()*32;
    transform.position.set(x,-6,z);transform.rotation.set(rand(),rand()*tau,rand());transform.scale.set(.3+rand(),.3+.40*rand(),.4+rand());transform.updateMatrix();
    stones.setMatrixAt(i,transform.matrix);
  }
  exterior.add(stones);
  // A distant school passes behind the window mullions, giving the water depth and scale.
  const fishCount=34;
  const fish=new T.InstancedMesh(new T.SphereGeometry(1,12,8),finish(0x709a9c,.18),fishCount);
  const tails=new T.InstancedMesh(new T.ConeGeometry(1,1,3).rotateZ(-Math.PI/2),finish(0x507782),fishCount);
  const school=Array.from({length:fishCount},()=>[rand()*8,rand()*1.5,rand()*3,.7+rand()*.5]);
  exterior.add(fish,tails);
  const weedGeo=sheet(12,4,(t,s)=>[(s-.5)*.28*Math.sin(Math.PI*t)+.25*t*t,t*1.5,.11*Math.sin(t*5)]);
  const reedMat=finish(0x468a77),baseCompile=reedMat.onBeforeCompile;
  reedMat.onBeforeCompile=sh=>{baseCompile(sh);sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x+=.085*position.y*position.y*sin(waterTime+instanceMatrix[3].z+position.y);');sh.vertexShader='uniform float waterTime;\n'+sh.vertexShader;};
  const reeds=new T.InstancedMesh(weedGeo,reedMat,420);
  for(let i=0;i<420;i++){
    transform.position.set((i%2?-1:1)*(3.9+rand()*8),-6.10,-20-rand()*27);transform.rotation.set(0,rand()*tau,0);
    transform.scale.setScalar(.5+rand());transform.updateMatrix();reeds.setMatrixAt(i,transform.matrix);
  }exterior.add(reeds);
  const bubbles=new T.InstancedMesh(new T.SphereGeometry(1,8,6),pane,86);
  const air=Array.from({length:86},()=>[(rand()<.6?-1:1)*(3.9+rand()*6),rand(),-19-rand()*26,.015+rand()*.038]);
  exterior.add(bubbles);
  room.traverse(o=>o.layers.enable(1));exterior.traverse(o=>o.layers.set(1));

  // The helmet samples surfaces across the room, including the plants and its glass envelope.
  const radar=new T.Group();
  room.add(radar);radar.layers.enable(1);radar.visible=false;
  const coords=[],colors=[],styles=[];
  const a=V(),b=V(),c=V(),u=V(),v=V(),normal=V(),sample=V(),white=new T.Color(0xffffff);
  function sampleSurface(geometry,matrix,density,emit){
    const pos=geometry.attributes.position,index=geometry.index;
    for(let i=0;i<(index?.count??pos.count);i+=3){
      a.fromBufferAttribute(pos,index?index.getX(i):i).applyMatrix4(matrix);
      b.fromBufferAttribute(pos,index?index.getX(i+1):i+1).applyMatrix4(matrix);
      c.fromBufferAttribute(pos,index?index.getX(i+2):i+2).applyMatrix4(matrix);
      u.subVectors(b,a);v.subVectors(c,a);
      const count=Math.floor(normal.crossVectors(u,v).length()*.5*density+rand());
      for(let j=0;j<count;j++){
        let r=rand(),t=rand();
        if(r+t>1){r=1-r;t=1-t;}
        emit(sample.copy(a).addScaledVector(u,r).addScaledVector(v,t));
      }
    }
  }
  const violet=new T.Color(0xb0adc9),pink=new T.Color(0xd8c9d9),mint=new T.Color(0xb0d7c6),
    teal=new T.Color(0x6ba6a6),blue=new T.Color(0x70849b),fogBlue=new T.Color(0x969fb9),tint=new T.Color();
  function addPoint(point,paint,style){
    coords.push(point.x,point.y,point.z);
    colors.push(paint.r,paint.g,paint.b);
    styles.push(style);
  }
  const opaqueMaterials=new Set();
  room.updateMatrixWorld(true);
  for(const obj of room.children){
    if(!obj.isMesh)continue;
    const mat=obj.material;
    const growth=foliage.has(mat),flowering=blossoms.has(mat),glassSurface=mat===pane;
    if(!mat.transparent)opaqueMaterials.add(mat);
    const structure=mat===enamel||mat===alloy;
    const changed=mat===warpedLeaf||mat===warpedRib;
    const density=glassSurface?9:flowering?1610:growth?1350:structure?540:mat===deck?104:214;
    sampleSurface(obj.geometry,obj.matrixWorld,density*(compact?.48:1),point=>{
      const band=.5+.5*Math.sin(point.z*1.13+point.x*1.9+point.y*1.6);
      if(glassSurface)tint.copy(fogBlue);
      else if(mat===bell)tint.copy(teal).lerp(white,.66);
      else if(flowering)tint.copy(violet).lerp(pink,band*.82);
      else if(growth)tint.copy(teal).lerp(mint,band*.92);
      else tint.copy(blue).lerp(structure?fogBlue:teal,band*.54);
      addPoint(point,tint.multiplyScalar(.65+rand()*.51),changed?2:growth||flowering?1:structure?.32:0);
    });
  }
  for(const obj of exterior.children){
    if(obj!==sea && obj!==ceiling && obj.isMesh && !obj.material.transparent)opaqueMaterials.add(obj.material);
  }
  function pointGeometry(positions,inks,tags,delays=new Float32Array(tags.length)){
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(inks,3));
    geometry.setAttribute('pointStyle',new T.Float32BufferAttribute(tags,1));
    geometry.setAttribute('returnDelay',new T.Float32BufferAttribute(delays,1));
    return geometry;
  }
  const warningStrength={value:0},warningStart={value:9},warningPoint={value:V()};
  const archiveStrength={value:0},roomReturn={value:0};
  const radarMaterial=new T.ShaderMaterial({
    uniforms:{scanBlend,age,sweepOrigin:origin,sweepDistance,warningStrength,warningStart,warningPoint,archiveStrength,roomReturn},
    transparent:true,depthWrite:false,vertexColors:true,
    vertexShader:`
      uniform float scanBlend, age, warningStrength, warningStart, archiveStrength, roomReturn;
      uniform vec3 warningPoint;
      ${sweep}
      attribute float pointStyle, returnDelay;
      varying vec3 ink;
      varying float opacity;
      void main(){
        vec3 p=position;
        float seed=fract(sin(dot(p,vec3(19.6,73.2,58.8)))*41733.12);
        float changed=step(1.5,pointStyle)*(1.-step(2.5,pointStyle));
        float archive=step(3.5,pointStyle);
        float anomaly=step(2.5,pointStyle)*(1.-archive);
        vec4 mv=modelViewMatrix*vec4(p,1.);
        float depth=max(.12,-mv.z);
        float edge=scanEdge(p);
        float revealed=smoothstep(-.20,.72,edge);
        float rim=exp(-edge*edge*5.);
        float organic=step(.5,pointStyle);
        float structure=step(.2,pointStyle)*(1.-step(.5,pointStyle));
        float size=mix(2.2+1.7*seed,3.+2.5*seed,organic);
        size=mix(size,4.+2.5*seed,anomaly);
        gl_PointSize=clamp(size*6.2/(depth+1.25),1.32+structure*.15,anomaly>.5?8.5:6.8);
        float mist=exp(-depth*.044);
        ink=color*(1.12+rim*.74+roomReturn*.65+anomaly*.22+structure*.14);
        opacity=scanBlend*revealed*mist*mix(.74,.99,max(organic,structure));
        float localAge=age-warningStart-returnDelay;
        float localReturn=smoothstep(-.035,.18,localAge);
        float nearby=1.-smoothstep(.30,1.1,distance(warningPoint,p));
        opacity*=1.-warningStrength*(.24+.30*nearby);
        opacity*=1.-changed*nearby*max(warningStrength,archiveStrength);
        opacity=mix(opacity,scanBlend*revealed*mist*warningStrength*localReturn,anomaly);
        opacity=mix(opacity,scanBlend*revealed*mist*archiveStrength,archive);
        mv.z+=.023+.040*(anomaly+archive);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`
      varying vec3 ink;
      varying float opacity;
      void main(){
        float r=length(gl_PointCoord-.5);
        if(r>.5 || opacity<.006)discard;
        float core=1.-smoothstep(.12,.38,r);
        float halo=(1.-smoothstep(.27,.50,r))*.22;
        gl_FragColor=vec4(ink*(.62+.38*core),opacity*max(core,halo));
        #include <colorspace_fragment>
      }`
  });
  const cloud=new T.Points(pointGeometry(coords,colors,styles),radarMaterial);
  cloud.layers.enable(1);cloud.renderOrder=5;radar.add(cloud);
  for(const [plant,pieces] of variants){
    const positions=[],inks=[],tags=[],delays=[],matrix=new T.Matrix4();
    const base=plant.group.position;
    const rose=new T.Color(0xe9a6b0),archived=new T.Color(0xb1c0d6);
    for(const {geometry,band} of pieces){
      const density=plant.kind==='披针叶草'?3100:2200;
      sampleSurface(geometry,matrix,density*(compact?.60:1),point=>{
        positions.push(point.x,point.y,point.z);
        tint.copy(rose).lerp(white,rand()*.26);
        inks.push(tint.r,tint.g,tint.b);tags.push(3);
        const x=point.x-base.x,y=point.y-base.y,z=point.z-base.z;
        let delay;
        switch(plant.kind){
          case '鹿角蕨': delay=Math.hypot(x-.17,y-.42,z)*1.7;break;
          case '羽叶蕨': delay=band?band*1.02:Math.hypot(x,y,z)*1.27;break;
          case '铃兰': delay=band*.56+Math.abs(x-.185)*.77;break;
          default: delay=Math.hypot(x-.16,z-.12)*4.6;break;
        }
        delays.push(delay);
      });
      geometry.dispose();
    }
    plant.warningCloud=new T.Points(pointGeometry(positions,inks,tags,delays),radarMaterial);
    plant.warningCloud.layers.enable(1);plant.warningCloud.renderOrder=6;plant.warningCloud.visible=false;
    radar.add(plant.warningCloud);
    const oldPositions=[],oldInks=[],oldTags=[];
    for(const geometry of plant.archive){
      sampleSurface(geometry,plant.group.matrix,compact?940:1440,point=>{
        oldPositions.push(point.x,point.y,point.z);
        oldInks.push(archived.r,archived.g,archived.b);oldTags.push(4);
      });
      geometry.dispose();
    }
    plant.archive.length=0;
    plant.archiveCloud=new T.Points(pointGeometry(oldPositions,oldInks,oldTags),radarMaterial);
    plant.archiveCloud.layers.enable(1);plant.archiveCloud.renderOrder=6;plant.archiveCloud.visible=false;
    radar.add(plant.archiveCloud);
  }
  const sweepComplete=2.50;
  let scannedPlant=null, scanEnd=7, pendingCues=[];
  function scanStage(){
    if(!radar.visible)return '';
    if(age.value<.28)return '头盔启动';
    if(age.value<1.21)return '读取近处叶面与花台';
    if(age.value<sweepComplete)return '读取步道与拱顶';
    if(age.value<scanDuration && scannedPlant?.extra)return '比对上次记录与本次点云';
    if(age.value<scanDuration)return '重建完成 · 比对'+(scannedPlant?.kind??'植物')+'的形状';
    if(age.value<scanEnd-1.3)return '转动视线，观察整个温室';
    return '正在恢复日常视野';
  }
  function scanAt(point,plant=null){
    restoreView();
    for(const p of pots)p.age=Infinity;
    scannedPlant=plant;
    origin.value.copy(point);age.value=0;radar.visible=true;
    scanEnd=plant?.demo?7.6:7.15;
    pendingCues=[
      {at:.45,pitch:478,duration:.11,bend:1.16,position:point.clone()},
      {at:sweepComplete,pitch:229,duration:.34,bend:1.16,position:null}
    ];
    if(plant?.warningCloud){
      warningPoint.value.copy(plant.target).add(plant.group.position);
      warningStart.value=3.13;
      for(const [start,span,pitch,duration,bend] of warningCues[plant.kind]){
        pendingCues.push({at:warningStart.value+start+span*.18,pitch,duration,bend,position:warningPoint.value.clone(),warning:true});
      }
      pendingCues.sort((a,b)=>a.at-b.at);
    }
  }
  function restoreView(){
    radar.visible=false;scanBlend.value=0;scannedPlant=null;warningStrength.value=0;
    archiveStrength.value=roomReturn.value=0;sweepDistance.value=-2;
    pendingCues=[];
    waterFog.color.copy(dayFog);
    for(const mat of opaqueMaterials)mat.colorWrite=true;
    pane.opacity=.085;
    ceiling.visible=bubbles.visible=true;
    for(const light of bedLights)light.visible=true;
    for(const p of pots)if(p.warningCloud)p.warningCloud.visible=p.archiveCloud.visible=false;
  }
  function tick(dt,now,onCue){
    time.value=now*.001;age.value+=dt;
    observation.value+=((observing?1:0)-observation.value)*(1-Math.exp(-dt*3.5));
    lamp.color.setRGB(1,.73+.09*Math.sin(now*.003),.34);
    for(const p of pots)if(Number.isFinite(p.age))p.age+=dt;
    if(radar.visible){
      const t=age.value;
      while(pendingCues.length && pendingCues[0].at<=t){
        const cue=pendingCues.shift();
        onCue?.(cue);
      }
      if(t>=scanEnd)restoreView();
      else{
        const eased=T.MathUtils.smoothstep;
        const restoring=eased(t,scanEnd-1.34,scanEnd);
        scanBlend.value=eased(t,.18,1.85)*(1-restoring);
        sweepDistance.value=-1.2+26*clamp((t-.16)/(sweepComplete-.16),0,1)*(1-restoring);
        roomReturn.value=eased(t,2.16,2.54)*(1-eased(t,2.61,3.02));
        waterFog.color.lerpColors(dayFog,helmetFog,scanBlend.value);
        // Opaque geometry still supplies depth when the scan supplies all visible surfaces.
        const fullyScanned=t>=sweepComplete && sweepDistance.value>23.5;
        for(const mat of opaqueMaterials)mat.colorWrite=!fullyScanned;
        for(const light of bedLights)light.visible=scanBlend.value<.10;
        pane.opacity=.085*(1-eased(t,.30,1.8)*(1-restoring));
        ceiling.visible=scanBlend.value<.98;
        bubbles.visible=scanBlend.value<.75;
        if(scannedPlant?.warningCloud){
          const elapsed=t-warningStart.value;
          archiveStrength.value=eased(t,2.50,2.76)*(1-eased(t,3.26,3.65));
          scannedPlant.archiveCloud.visible=archiveStrength.value>0;
          scannedPlant.warningCloud.visible=elapsed>=0;
          let flash=0;
          for(const [start,duration] of warningCues[scannedPlant.kind]){
            flash=Math.max(flash,Math.sin(Math.PI*clamp((elapsed-start)/duration,0,1))**2);
          }
          warningStrength.value=eased(elapsed,0,.30)*(.76+.24*flash);
        }
      }
    }
    if(scanBlend.value>.78)return;
    for(let i=0;i<air.length;i++){
      const [x,h,z,r]=air[i],f=(h+time.value*.085)%1;
      transform.position.set(x+.12*Math.sin(8*f+i),-6+4.5*f,z);transform.rotation.set(0,0,0);transform.scale.setScalar(r);
      transform.updateMatrix();bubbles.setMatrixAt(i,transform.matrix);
    }bubbles.instanceMatrix.needsUpdate=true;
    for(let i=0;i<fishCount;i++){
      const [off,h,d,size]=school[i],t=time.value*.11+off*.13;
      const x=-5.8-d+.55*Math.cos(t),y=-3.9+h+.18*Math.sin(t*2+i),z=-30-off-3.4*Math.sin(t);
      const facing=Math.cos(t)>=0?1:-1;
      transform.position.set(x,y,z);transform.rotation.set(0,facing*Math.PI/2+.12*Math.cos(t*5),0);transform.scale.set(.115*size,.040*size,.029*size);
      transform.updateMatrix();fish.setMatrixAt(i,transform.matrix);
      transform.position.z+=facing*.115*size;transform.scale.set(.055*size,.056*size,.014*size);transform.updateMatrix();tails.setMatrixAt(i,transform.matrix);
    }fish.instanceMatrix.needsUpdate=tails.instanceMatrix.needsUpdate=true;
  }
  function reset(){restoreView();observing=false;observation.value=0;room.visible=false;}
  const dayFog=new T.Color(0x487d89),helmetFog=new T.Color(0x17262f);
  const waterFog=new T.FogExp2(dayFog,.063);
  const passage=scene.getObjectByName('lake-surface')?.material.uniforms.uPassage;
  function open(){restoreView();room.visible=true;lamp.color.setHex(0xffdc91);if(passage)passage.value=1;}
  function restartSurvey(){
    for(const p of pots){p.scanned=p.marked=false;p.age=Infinity;}
  }
  reset();return {room,pots,teacher,bedLights,radar,scanAt,scanStage,
    scanSettling:()=>radar.visible&&age.value<(scannedPlant?.demo?sweepComplete:.68),
    comparisonTarget:()=>radar.visible&&scannedPlant?.extra&&age.value>=2.4&&age.value<scanEnd-1.34?warningPoint.value:null,
    lensShade:()=>radar.visible?.22*scanBlend.value+.54*Math.exp(-((age.value-.30)**2)*48):0,
    setObservation(value){observing=value;},arrange,tick,open,restoreView,restartSurvey,waterFog,reset(){reset();if(passage)passage.value=0;}};
}
