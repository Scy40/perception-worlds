import * as T from './vendor/three.module.js';

const V=(x,y,z)=>new T.Vector3(x,y,z);
const clamp=T.MathUtils.clamp, tau=2*Math.PI;
export const pathX=()=>1.45;
export const floorAt=z=>-1.27-4.05*T.MathUtils.smoothstep(-z,17.7,27);
export const samples=[-29.7,-34.8,-39.2].map(z=>V(-.26,-4.12,z));
export const flower=samples[0];
export const tip=samples[1].clone().add(V(.76,.28,.28));
export const pilotLamp=V(1.02,-.27,-17.8);

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
        `outgoingLight+=vec3(.065,.24,.25)*lattice(waterPos.xz+waterPos.y*vec2(.43,.35),waterTime)*smoothstep(1.,5.,-waterPos.y);\n#include <opaque_fragment>`);
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
    tube(Array.from({length:20},(_,i)=>[x,floorAt(-17-i*1.28)+.018,-17-i*1.28]),.016,bronze);
    for(let i=0;i<9;i++){const z=-18.6-i*.91;box(x,floorAt(z)+.08,z,.06,.12,.26,bronze);}
  }
  const lamp=new T.MeshBasicMaterial({color:0x836e45});
  disc(pilotLamp.x,-.77,pilotLamp.z,.053,1.,enamel);
  mesh(new T.SphereGeometry(.079,16,12).translate(...pilotLamp.toArray()),lamp);
  // The pressure bulkhead, seam bolts and three specimen cradles stay fixed across readings.
  box(.76,-3.8,-42,5.2,3.4,.19,enamel);
  box(-.26,-4.88,-34.5,1.8,.22,14.1,enamel,170);
  for(const dx of [-.88,.88])tube([[-.26+dx,-4.82,-27.5],[-.26+dx,-4.82,-41.5]],.037,bronze);
  const scanRailY=-2.58;
  for(const x of [.20,.44])tube([[x,scanRailY,-27.5],[x,scanRailY,-41]],.039,alloy);
// Six pots share one scan instrument. Historical samples omit only the new tissue.
  const soil=finish(0x344e48), fern=finish(0x65af85), midrib=finish(0xb5cc89), bell=finish(0xf3ded5);
  const pots=[];
  function specimen(kind,extra,demo=false){
    const group=new T.Group(), ordinary=[],addition=[];
    room.add(group);
    const target=V(0,.47,0);
    function part(geometry,mat,newGrowth=false){
      group.add(new T.Mesh(geometry,mat));
      const vertices=geometry.attributes.position,idx=geometry.index;
      const size=idx?idx.count:vertices.count;
      const a=V(),b=V(),c=V(),ab=V(),ac=V();
      for(let j=0;j<size;j+=3){
        [a,b,c].forEach((v,k)=>v.fromBufferAttribute(vertices,idx?idx.getX(j+k):j+k));
        ab.subVectors(b,a);ac.subVectors(c,a);
        const count=Math.ceil(V().crossVectors(ab,ac).length()*1500);
        for(let k=0;k<count;k++){
          let u=rand(),v=rand();if(u+v>1){u=1-u;v=1-v;}
          const pt=a.clone().addScaledVector(ab,u).addScaledVector(ac,v);
          (newGrowth?addition:ordinary).push(...pt.toArray());
        }
      }
    }
    function stem(pts,r,m=midrib,newGrowth=false){
      part(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p=>V(...p))),32,r,7,false),m,newGrowth);
    }
    function blade(x,y,dx,dy,w,newGrowth=false,z=.02){
      part(sheet(16,4,(t,s)=>{const side=(s-.5)*2*w*Math.pow(Math.sin(Math.PI*t),.62);
        return [x+dx*t+side,y+dy*t-side*dx*.55,z+.085*Math.sin(t*Math.PI)+.024*(1-Math.abs(s*2-1))];}),fern,newGrowth);
    }
    if(kind==='鹿角蕨'){
      for(const side of [-1,1]){
        blade(0,.01,side*.17,.43,.095);
        blade(side*.17,.42,side*.14,.26,.067);
        blade(side*.17,.42,-side*.065,.32,.052);
      }
      if(extra){blade(.18,.43,.27,.10,.05,true);target.set(.37,.52,.06);}
    }else if(kind==='卷叶蕨'){
      const curl=(x,y,sign)=>Array.from({length:44},(_,i)=>{const t=i/43,a=t*5.75,r=.13*(1-.65*t);return [x+sign*r*Math.sin(a),y+r*(1-Math.cos(a)),.025];});
      stem([[0,0,0],[-.07,.29,0],[-.08,.56,0],...curl(-.08,.64,1)],.026);
      for(const side of [-1,1])blade(0,.02,side*.19,.28,.055);
      if(extra){stem([[-.07,.29,0],[.08,.38,.02],[.19,.49,.025],...curl(.20,.53,1)],.027,midrib,true);target.set(.22,.60,.03);}
    }else{
      for(let j=0;j<2;j++)blade(0,.01,j?.16:-.15,.42,.055);
      stem([[0,0,0],[-.05,.36,0],[.01,.64,0],[.12,.73,0]],.017);
      for(let j=0;j<4;j++){
        const x=.03+j*.03,y=.41+j*.09;
        stem([[0,y,0],[x+.07,y+.04,0],[x+.09,y+.01,0]],.009);
        part(sheet(10,20,(t,s)=>{const a=s*tau,r=.045*(.18+Math.sin(t*1.9)+.28*t**4);return [x+.09+r*Math.cos(a),y-.082*t+.007*t**3*Math.cos(6*a),r*Math.sin(a)];}),bell);
      }
    }
    const tray=new T.Mesh(new T.CylinderGeometry(.39,.30,.16,40),alloy);tray.position.y=-.10;group.add(tray);
    const foot=new T.Mesh(new T.CylinderGeometry(.13,.18,.54,20),enamel);foot.position.y=-.41;group.add(foot);
    const bed=new T.Mesh(new T.CylinderGeometry(.355,.35,.025,36),soil);bed.position.y=-.012;group.add(bed);
    const height={value:0},strength={value:0};
    function dots(coords,color,size,offset){
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(coords,3));
      const mat=new T.PointsMaterial({color,size,transparent:true,depthWrite:false,depthTest:false});
      mat.onBeforeCompile=sh=>{
        sh.uniforms.h=height;sh.uniforms.power=strength;
        sh.vertexShader='varying float elevation;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nelevation=position.y;');
        sh.fragmentShader='varying float elevation;uniform float h,power;\n'+sh.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif(distance(gl_PointCoord,vec2(.5))>.5)discard;diffuseColor.a*=power*(1.-smoothstep(h-.04,h+.04,elevation));');
      };
      const obj=new T.Points(geo,mat);obj.position.x=offset;obj.renderOrder=7;group.add(obj);return obj;
    }
    const layers=[dots(ordinary,0xd4deda,.011,-.012),dots([...ordinary,...addition],0x74f6df,.007,0)];
    group.traverse(o=>o.layers.enable(1));
    const plant={group,kind,extra,demo,target,scanned:false,marked:false,age:Infinity,
      show(dt){this.age+=dt;const a=this.age;
        height.value=-.04+1.08*T.MathUtils.smoothstep(a,0,1.8);
        strength.value=T.MathUtils.smoothstep(a,0,.25)*(1-T.MathUtils.smoothstep(a,4.0,5.2));
        for(const o of layers)o.visible=strength.value>.001;
      }};
    pots.push(plant);return plant;
  }
  const teacher=specimen('铃兰',false,true);
  teacher.group.position.set(.72,-4.68,-29.1);
  for(const [kind,extra] of [['鹿角蕨',false],['卷叶蕨',true],['铃兰',false],['鹿角蕨',true],['卷叶蕨',false]])specimen(kind,extra);
  let lastSeats='';
  function arrange(){
    const order=pots.slice(1);
    for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    const seats=()=>order.map(p=>Number(p.extra)).join('');
    if(seats()===lastSeats)order.push(order.shift());
    lastSeats=seats();
    order.forEach((p,i)=>{const a=(i-2)*.42;p.group.position.set(.72+2.6*Math.sin(a),-4.69+.13*Math.abs(i-2),-35.7-2.6*Math.cos(a));p.number=i+1;});
    for(const p of pots){p.scanned=p.marked=false;p.age=Infinity;p.show(0);}
  }
  arrange();


  const rim=Array.from({length:24},(_,i)=>{const a=-1+i*2/23;return [.72+2.63*Math.sin(a),-4.84,-35.7-2.63*Math.cos(a)];});
  tube(rim,.15,enamel);tube(rim.map(([x,y,z])=>[x,y+.1,z]),.024,bronze);
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

  function tick(dt,now){time.value=now*.001;
    lamp.color.setRGB(1,.73+.09*Math.sin(now*.003),.34);
    for(const p of pots)p.show(dt);
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
  function open(){room.visible=true;lamp.color.setHex(0xffdc91);if(passage)passage.value=1;}
  reset();return {room,pots,teacher,arrange,tick,open,waterFog,reset(){reset();if(passage)passage.value=0;}};
}
