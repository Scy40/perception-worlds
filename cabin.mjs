import * as T from './vendor/three.module.js';
import { scanDuration, pathX, floorAt, pilotLamp } from './cabin-route.mjs';
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
export function makeCabin(scene){
  const room=new T.Group(),exterior=new T.Group();
  scene.add(room);room.add(exterior);
  const time={value:0},age={value:9},origin={value:flower.clone()};
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
      sh.vertexShader='varying vec3 waterPos;\n'+sh.vertexShader.replace('#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvec4 waterVertex=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nwaterVertex=instanceMatrix*waterVertex;\n#endif\nwaterPos=(modelMatrix*waterVertex).xyz;');
      sh.fragmentShader='varying vec3 waterPos; uniform float waterTime;\n'+caustic+'\n'+sh.fragmentShader.replace('#include <opaque_fragment>',
        `outgoingLight+=vec3(.13,.31,.28)*lattice(waterPos.xz+waterPos.y*vec2(.43,.35),waterTime)*smoothstep(1.,5.,-waterPos.y);\n#include <opaque_fragment>`);
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
  const pots=[];
  function specimen(kind,extra,demo=false){
    const group=new T.Group(), paths=[];
    room.add(group);
    const target=V(0,.47,0);
    function part(geometry,material){group.add(new T.Mesh(geometry,material));}

    // Each branch picks up the pulse where it joins an older stem.
    function trace(curve,newGrowth=false){
      const points=curve.getSpacedPoints(Math.max(8,Math.ceil(curve.getLength()*86)));
      let join=0, nearest=Infinity;
      for(const path of paths)for(const sample of path.samples){
        const gap=sample.point.distanceTo(points[0]);
        if(gap<nearest){nearest=gap;join=sample.distance+gap;}
      }
      if(points[0].y<.05)join=0;
      let distance=join;
      const samples=points.map((point,i)=>{
        if(i)distance+=point.distanceTo(points[i-1]);
        return {point,distance};
      });
      paths.push({samples,newGrowth});
      if(newGrowth===true)target.copy(points[points.length-1]);
    }
    function stem(pts,r,m=midrib,newGrowth=false){
      const curve=new T.CatmullRomCurve3(pts.map(p=>V(...p)));
      part(new T.TubeGeometry(curve,48,r,7,false),m);trace(curve,newGrowth);
    }
    function blade(x,y,dx,dy,w,newGrowth=false,z=.02){
      function surface(t,s){
        const side=(s-.5)*2*w*Math.pow(Math.sin(Math.PI*t),.62);
        return [x+dx*t+side,y+dy*t-side*dx*.55,z+.085*Math.sin(t*Math.PI)+.024*(1-Math.abs(s*2-1))];
      }
      if(newGrowth!=='past')part(sheet(16,4,surface),fern);
      trace(new T.CatmullRomCurve3(Array.from({length:21},(_,i)=>V(...surface(i/20,.5)))),newGrowth);
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
          const breadth=.022+.24*t;
          return [.17+.12*t+u*breadth,.42+t*(.38+.055*Math.cos(u*Math.PI*4)),.03+.06*t*Math.cos(u*Math.PI*4)];
        }
        part(sheet(18,40,(t,s)=>fan(t,2*s-1)),fern);
        for(let j=0;j<=8;j++){
          const rib=j/4-1;
          trace(new T.CatmullRomCurve3([0,.35,.7,1].map(t=>V(...fan(t,rib)))),true);
        }
        trace(new T.CatmullRomCurve3(Array.from({length:41},(_,i)=>V(...fan(1,i/20-1)))),true);
        target.set(...fan(1,0));
      }
    }else if(kind==='羽叶蕨'){
      for(const side of [-1,1]){
        const curled=extra && side===1;
        const axis=new T.CatmullRomCurve3([V(0,0,0),V(side*.06,.24,0),V(side*.16,.47,.025),V(side*.27,.64,.035)]);
        if(curled)trace(axis,'past');else{part(new T.TubeGeometry(axis,30,.015,7,false),midrib);trace(axis);}
        for(let j=0;j<6;j++){
          const y=.12+j*.078,x=side*(.025+j*.032);
          for(const wing of [-1,1])blade(x,y,wing*(.16-j*.018),.10,.026,curled?'past':false,.025);
        }
      }
      if(extra){
        const arc=new T.CatmullRomCurve3([V(0,0,0),V(.09,.29,.03),V(.28,.48,.06),V(.47,.37,.09),V(.44,.17,.10),V(.31,.14,.10)]);
        part(new T.TubeGeometry(arc,42,.017,8,false),midrib);trace(arc,true);
        for(let i=1;i<=7;i++){
          const t=i/8,at=arc.getPoint(t),dir=arc.getTangent(t);
          for(const wing of [-1,1])blade(at.x,at.y,.06*dir.x+wing*.095*dir.y,.06*dir.y-wing*.095*dir.x,.026,true,at.z);
        }
        target.copy(arc.getPoint(.84));
      }
    }else if(kind==='披针叶草'){
      for(let j=0;j<5;j++)blade(0,.01,(j-2)*.085,.48+(.12*(j%2)),.04);
      if(extra){
        for(let j=0;j<13;j++){
          const angle=j*2.4,x=.19+.05*Math.cos(angle),h=.13+.07*(1+Math.sin(j*1.8));
          blade(x,0,Math.cos(angle)*.13,h,.034,true,.11+.07*Math.sin(angle));
        }
        target.set(.20,.24,.12);
      }
    }else{
      for(let j=0;j<2;j++)blade(0,.01,j?.16:-.15,.42,.055);
      stem([[0,0,0],[-.05,.36,0],[.01,.64,0],[.12,.73,0]],.017);
      for(let j=0;j<4;j++){
        const x=.03+j*.03,y=.41+j*.09;
        stem([[0,y,0],[x+.07,y+.04,0],[x+.09,y+.01,0]],.009);
        const replaced=extra && j>=2;
        const bellSurface=(t,s)=>{const a=s*tau,r=.045*(.18+Math.sin(t*1.9)+.28*t**4);return [x+.09+r*Math.cos(a),y-.082*t+.007*t**3*Math.cos(6*a),r*Math.sin(a)];};
        if(!replaced)part(sheet(10,20,bellSurface),bell);
        for(const edge of [0,.5]){
          trace(new T.CatmullRomCurve3([0,.35,.7,1].map(t=>V(...bellSurface(t,edge)))),replaced?'past':false);
        }
        if(replaced){
          blade(x+.09,y+.01,.23,.14,.075,true);
          blade(x+.09,y+.01,-.13,.17,.06,true);
        }
      }
    }
    const tray=new T.Mesh(new T.CylinderGeometry(.39,.30,.16,40),alloy);tray.position.y=-.10;group.add(tray);
    const foot=new T.Mesh(new T.CylinderGeometry(.13,.18,.54,20),enamel);foot.position.y=-.41;group.add(foot);
    const bed=new T.Mesh(new T.CylinderGeometry(.355,.35,.025,36),soil);bed.position.y=-.012;group.add(bed);
    const timeline=paths.flatMap(p=>p.samples).sort((a,b)=>a.distance-b.distance);
    const length=timeline[timeline.length-1].distance;
    function reading(samples,color,size,offset,localDistance=false){
      const geo=new T.BufferGeometry();
      const coords=samples.flatMap(s=>s.point.toArray());
      geo.setAttribute('position',new T.Float32BufferAttribute(coords,3));
      const mat=new T.PointsMaterial({color,size,transparent:true,depthWrite:false,depthTest:false});
      mat.onBeforeCompile=shader=>{
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',
          '#include <color_fragment>\nif(distance(gl_PointCoord,vec2(.5))>.5)discard;');
      };
      const cloud=new T.Points(geo,mat);cloud.position.x=offset;cloud.renderOrder=7;cloud.visible=false;group.add(cloud);
      const start=localDistance?samples[0].distance:0;
      const span=localDistance?Math.max(.001,samples.at(-1).distance-start):length;
      const arrival=samples.map(sample=>(sample.distance-start)/span);
      return function reveal(t,opacity,x=offset){
        cloud.visible=t>=0;
        if(!cloud.visible)return;
        let count=0;
        if(t>=1)count=arrival.length;
        else while(count<arrival.length&&arrival[count]<=t)count++;
        geo.setDrawRange(0,count);mat.opacity=opacity;cloud.position.x=x;
      };
    }
    const previous=reading(paths.filter(p=>p.newGrowth!==true).flatMap(p=>p.samples).sort((a,b)=>a.distance-b.distance),
      0xe2ded7,.018,-.026);
    const baseline=paths.filter(p=>!p.newGrowth).flatMap(p=>p.samples).sort((a,b)=>a.distance-b.distance);
    const growth=paths.filter(p=>p.newGrowth===true).flatMap(p=>p.samples).sort((a,b)=>a.distance-b.distance);
    const current=reading(baseline,0x9beeff,.021,.012);
    const highlight=growth.length?reading(growth,0xffac54,.039,.012,true):null;
    group.traverse(o=>o.layers.enable(1));
    const plant={group,kind,extra,demo,target,finding:extra?findings[kind]:null,
      drawComparison(canvas){
        const ctx=canvas.getContext('2d'),w=canvas.width/2,h=canvas.height;
        const xOf=p=>p.x+.24*p.z;
        let lo=0,hi=0,top=0;
        for(const {samples} of paths)for(const {point} of samples){
          lo=Math.min(lo,xOf(point));hi=Math.max(hi,xOf(point));top=Math.max(top,point.y);
        }
        const scale=Math.min((w-24)/(hi-lo),(h-12)/top);
        ctx.clearRect(0,0,canvas.width,h);ctx.lineWidth=1.8;ctx.lineJoin='round';
        for(const column of [0,1])for(const path of paths){
          if(column===0?path.newGrowth===true:path.newGrowth==='past')continue;
          ctx.strokeStyle=column===0?'#d0d6d3':path.newGrowth?'#ffc273':extra?'#86a4b5':'#9beeff';
          ctx.lineWidth=column===1&&path.newGrowth?2.6:1.6;
          ctx.beginPath();path.samples.forEach(({point},i)=>{
            ctx[i?'lineTo':'moveTo']((column+.5)*w+(xOf(point)-(hi+lo)/2)*scale,h-5-point.y*scale);
          });ctx.stroke();
        }
      },scanned:false,marked:false,age:Infinity,
      clearReading(){
        this.age=Infinity;
        previous(-1,0);current(-1,0);highlight?.(-1,0);
      },
      show(dt){
        this.age+=dt;
        const t=Number.isFinite(this.age)?this.age:-1;
        const align=T.MathUtils.smoothstep(t,.85,1.85);
        previous(t/.85,extra?.73:.88-.58*align,extra?-.024:-.044*(1-align)-.007);
        if(extra){
          // First establish the shared outline, then trace only the changed area.
          const reveal=(t-1.32)/(scanDuration-1.32);
          const pulse=.82+.18*Math.sin(Math.PI*clamp(reveal,0,1));
          current((t-.55)/.88,.64-.37*T.MathUtils.smoothstep(t,1.12,1.65),.012);
          highlight?.(reveal,pulse);
        }else{
          // A normal scan registers the whole new outline against the old one.
          current(t>=.85?1:-1,.94*align,.085*(1-align)+.003);
        }
      }};
    pots.push(plant);return plant;
  }
const bedLights=[];
  const lilac=finish(0xb1a0ce), sage=finish(0x739b7d), moss=finish(0x628268), blossom=finish(0xdbaec1);
  const damp=new T.MeshStandardMaterial({color:0x568e8c,roughness:.18,metalness:.38});
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
  teacher.group.position.set(-.69,-4.65,-29.15);
  for(const [side,kinds] of [[0,['鹿角蕨','鹿角蕨','铃兰','披针叶草']],[1,['羽叶蕨','羽叶蕨','铃兰','披针叶草']]]){
    kinds.forEach((kind,i)=>{const p=specimen(kind,i===1 || (side===0?i===2:i===3));p.station=side;});
  }
  function arrange(){
    for(const side of [0,1]){
      const row=pots.filter(p=>!p.demo&&p.station===side);
      // Keep specimen positions stable so the room scan matches each pot.
      row.forEach((p,i)=>{const [x,z]=seats[side*4+i];p.group.position.set(x,-4.65,z);p.number=i+1;});
    }
    for(const p of pots){p.scanned=p.marked=false;p.examined=false;p.away=0;p.watch=0;p.hintAge=-1;p.hintPlayed=false;p.age=Infinity;p.show(0);}
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


  // Pots stay in fixed seats. Share draw calls with the room, while the
  // comparison readings and label anchors remain attached to each specimen.
  for(const plant of pots){
    plant.group.updateMatrix();
    for(const part of [...plant.group.children]){
      if(!part.isMesh)continue;
      part.updateMatrix();
      part.geometry.applyMatrix4(part.matrix).applyMatrix4(plant.group.matrix);
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
    uniforms:{t:time},vertexShader:'varying vec3 d;void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 d;uniform float t;void main(){float h=normalize(d).y;vec3 c=mix(vec3(.008,.052,.095),vec3(.12,.46,.50),smoothstep(-.35,.9,h)); gl_FragColor=vec4(c,1.);\n#include <colorspace_fragment>\n}'}));
  sea.position.set(0,-4,-31);sea.renderOrder=-90;exterior.add(sea);
  const ceiling=new T.Mesh(new T.PlaneGeometry(60,60,60,60),new T.ShaderMaterial({side:T.DoubleSide,uniforms:{t:time},
    vertexShader:`uniform float t;varying vec2 p;void main(){p=position.xy;vec3 a=position;a.z=.07*sin(p.x*1.2+t)+.04*sin(p.y*2.-t*.9);gl_Position=projectionMatrix*modelViewMatrix*vec4(a,1.);}`,
    fragmentShader:'varying vec2 p;uniform float t;'+caustic+'void main(){float k=lattice(p*.7,t);gl_FragColor=vec4(vec3(.08,.39,.45)+k*vec3(.14,.30,.26),1.);\n#include <colorspace_fragment>\n}'}));
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

  // Sample actual triangle surfaces: deck, arches, benches, pots and all foliage.
  const radar=new T.Group();room.add(radar);radar.layers.enable(1);
  const solids=[],coords=[],colors=[],a=V(),b=V(),c=V(),u=V(),v=V(),normal=V(),sample=V(),tint=new T.Color(),hue=new T.Color(),color=new T.Color();
  room.updateMatrixWorld(true);
  room.traverse(obj=>{
    if(!obj.isMesh||obj===sea||obj.parent===exterior||obj.isInstancedMesh)return;
    solids.push(obj);
    const pos=obj.geometry.attributes.position,idx=obj.geometry.index;
    color.copy(obj.material.color??new T.Color(0x6dbcd0));
    for(let i=0;i<(idx?.count??pos.count);i+=3){
      a.fromBufferAttribute(pos,idx?idx.getX(i):i).applyMatrix4(obj.matrixWorld);
      b.fromBufferAttribute(pos,idx?idx.getX(i+1):i+1).applyMatrix4(obj.matrixWorld);
      c.fromBufferAttribute(pos,idx?idx.getX(i+2):i+2).applyMatrix4(obj.matrixWorld);
      u.subVectors(b,a);v.subVectors(c,a);
      const count=Math.floor(normal.crossVectors(u,v).length()*85+rand());
      for(let j=0;j<count;j++){
        let r=rand(),t=rand();if(r+t>1){r=1-r;t=1-t;}
        const p=sample.copy(a).addScaledVector(u,r).addScaledVector(v,t);
        coords.push(p.x,p.y,p.z);
        tint.copy(color).lerp(hue.setHSL((p.z*.037+p.y*.11+1)%1,.8,.6),.62);
        colors.push(tint.r,tint.g,tint.b);
      }
    }
  });
  const radarGeo=new T.BufferGeometry();radarGeo.setAttribute('position',new T.Float32BufferAttribute(coords,3));radarGeo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  const radarMat=new T.PointsMaterial({size:.025,vertexColors:true});
  radarMat.onBeforeCompile=sh=>{
    sh.uniforms.radarAge=age;sh.uniforms.radarOrigin=origin;
    sh.vertexShader='uniform vec3 radarOrigin;varying float radarDistance;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nradarDistance=distance(position,radarOrigin);');
    sh.fragmentShader='uniform float radarAge;varying float radarDistance;\n'+sh.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif(distance(gl_PointCoord,vec2(.5))>.48)discard;float wave=radarAge*12.;diffuseColor.rgb*=radarDistance>wave?.18:1.;diffuseColor.rgb+=vec3(.3,.7,.8)*exp(-8.*abs(radarDistance-wave));');
  };
  const cloud=new T.Points(radarGeo,radarMat);cloud.layers.enable(1);radar.add(cloud);radar.visible=false;
  function scanAt(point){
    for(const p of pots)p.clearReading();
    origin.value.copy(point);age.value=0;radar.visible=true;exterior.visible=false;
    for(const obj of solids)obj.visible=false;
  }
  function restoreView(){
    radar.visible=false;exterior.visible=true;
    for(const obj of solids)obj.visible=true;
  }
  function tick(dt,now){time.value=now*.001;age.value+=dt;
    lamp.color.setRGB(1,.73+.09*Math.sin(now*.003),.34);
    for(const p of pots)if(Number.isFinite(p.age) && p.age<=scanDuration+5)p.show(dt);
    if(radar.visible && age.value>4.05)restoreView();
    if(!exterior.visible)return;
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
  function reset(){room.visible=false;}
  const waterFog=new T.FogExp2(0x487d89,.063);
  const passage=scene.getObjectByName('lake-surface')?.material.uniforms.uPassage;
  function open(){restoreView();room.visible=true;lamp.color.setHex(0xffdc91);if(passage)passage.value=1;}
  function restartSurvey(){
    for(const p of pots){p.scanned=p.marked=false;p.clearReading();}
  }
  reset();return {room,pots,teacher,bedLights,radar,scanAt,arrange,tick,open,restoreView,restartSurvey,waterFog,reset(){reset();if(passage)passage.value=0;}};
}
