import * as T from './vendor/three.module.js';

const V = (x,y,z) => new T.Vector3(x,y,z);
const tau = Math.PI * 2;
export const flower = V(-0.35,0.24,-22);
export const pathX = z => 1.5 + 0.38 * Math.sin((-z-19)*0.32);

export const samples = Array.from({length:3},(_,i)=>{
  const z=-24.7-2*i;
  return V(pathX(z)-2.12,-.12,z);
});
export const pilotLamp=V(.18,-.36,-21.25);
function surface(rows, cols, sample) {
  const positions = [], indices = [];
  for (let j=0;j<=rows;j++) for(let i=0;i<=cols;i++) {
    positions.push(...sample(j/rows,i/cols));
    if (j && i) {
      const k=j*(cols+1)+i;
      indices.push(k-cols-2,k-1,k,k-cols-2,k,k-cols-1);
    }
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function makeGlasshouse(scene) {
  const room=new T.Group();
  const scan=new T.Scene();
  scan.background=new T.Color(0x050b17);
  scene.add(room);
  const shell=[], branch=[];
  const glass=new T.MeshPhysicalMaterial({color:0xbadbea,transparent:true,opacity:0.075,depthWrite:false,side:T.DoubleSide});
  const finish=(color,metalness=0,roughness=.37)=>new T.MeshPhysicalMaterial({
    color,metalness,roughness,side:T.DoubleSide,clearcoat:.32});
  const rail=finish(0xb9cbcc,.48), path=finish(0xe3d4ca), pot=finish(0x849e9c,.3);
  const stem=finish(0x889975), petal=finish(0xf3abd6), leaf=finish(0xd9a8d0);
  petal.iridescence=.55; leaf.iridescence=.45;
  const lilac=finish(0xb5bbeb), mint=finish(0x8cbdab), pollen=finish(0xffd198);
  const hemisphere=new T.HemisphereLight(0xfff5fe,0xa5b4da,1.7);
  const sun=new T.DirectionalLight(0xffe7ce,2.2);sun.position.set(-5,8,4);
  room.add(hemisphere,sun);
  let seed=57;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const a=V(),b=V(),c=V(),u=V(),v=V(),col=new T.Color();
  const petalTint=new T.Color(0xd47d69),leafTint=new T.Color(0x89bdce);
  function part(g,mat,color,density=140,store=shell) {
    const mesh=new T.Mesh(g,mat);room.add(mesh);
    const p=g.attributes.position,idx=g.index;
    for(let i=0;i<(idx?.count??p.count);i+=3){
      a.fromBufferAttribute(p,idx?idx.getX(i):i);
      b.fromBufferAttribute(p,idx?idx.getX(i+1):i+1);
      c.fromBufferAttribute(p,idx?idx.getX(i+2):i+2);
      u.subVectors(b,a);v.subVectors(c,a);
      const n=Math.floor(u.clone().cross(v).length()*density*.5+rand());
      for(let k=0;k<n;k++){
        let s=rand(),t=rand();if(s+t>1){s=1-s;t=1-t;}
        const pos=a.clone().addScaledVector(u,s).addScaledVector(v,t);
        col.set(color).multiplyScalar(.58+rand()*.55);
        if(color===0xf0a35b)col.lerp(petalTint,.22+.16*Math.sin(13*pos.y));
        if(color===0x68dc99)col.lerp(leafTint,.12+.24*Math.max(0,pos.y));
        store.push(pos.x,pos.y,pos.z,col.r,col.g,col.b);
      }
    }
    return mesh;
  }
  function pipe(points,r,mat=rail,color=0x648ddd,den=240,store=shell){
    return part(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>V(...p))),Math.max(8,points.length*4),r,8,false),mat,color,den,store);
  }
  function drum(x,y,z,r,h,mat,color){
    return part(new T.CylinderGeometry(r,r*.96,h,32).translate(x,y,z),mat,color,270);
  }
  // A raised path threads through a single curved bench and follows the waterline.
  function strip(offset,width,y,depth,mat,color,start=-14,end=-31){
    return part(surface(38,4,(t,s)=>{
      const z=start+(end-start)*t;
      const edge=[[-width/2,y-depth],[-width/2,y],[width/2,y],[width/2,y-depth],[-width/2,y-depth]][Math.round(4*s)];
      return [pathX(z)+offset+edge[0],edge[1],z];
    }),mat,color,145);
  }
  strip(0,2.45,-1.27,.17,path,0x4758a3);
  strip(-2.33,1.85,-.68,.20,rail,0x32a5b2,-18,-30);
  const inlay=finish(0xf1e7cf,.29);
  for(const z of [-19.16,-19.30,-19.44]){
    pipe([[pathX(z)-1.04,-1.258,z],[pathX(z)+1.04,-1.258,z]],.009,inlay,0x71acc4);
  }
  for(const side of [-1,1]){
    const pts=Array.from({length:15},(_,i)=>{const z=-18-i*.85;return [pathX(z)-2.33+side*.92,-.78,z];});
    pipe(pts,.042,rail,0x6ac9d2);
  }
  for(let z=-18;z>=-30;z-=2.4){
    const cx=pathX(z)-1;
    const arch=Array.from({length:19},(_,i)=>{const t=Math.PI*i/18;return [cx+3.4*Math.cos(t),-1.34+4.05*Math.sin(t),z];});
    pipe(arch,.037);
    drum(cx-1,-1.05,z,.09,.78,rail,0x477f99);
  }
  part(surface(18,24,(t,s)=>{const z=-18-12*t;return [pathX(z)-1+3.4*Math.cos(Math.PI*s),-1.34+4.05*Math.sin(Math.PI*s),z];}),glass,0x536b91,5);
  for(const dx of [-.14,.14])pipe(Array.from({length:15},(_,i)=>{const z=-18-i*.85;return [pathX(z)+dx,2.45,z];}),.027);
  function blade(x,y,z,h,w,lean,mat,color,angle=0){
    return part(surface(22,12,(t,s)=>{
      const side=(s*2-1)*w*Math.pow(Math.sin(Math.PI*t),.82);
      const bend=lean*t*t;
      return [x+bend*Math.cos(angle)+side*Math.cos(angle+.28),y+h*(t+.28*Math.sin(Math.PI*t)-.14*t**5),
        z+bend*Math.sin(angle)+side*Math.sin(angle+.28)+.22*Math.sin(Math.PI*t)*(1-(2*s-1)**2)];
    }),mat,color,h>1?1700:550);
  }
  // Shallow longitudinal ridges catch the greenhouse light as the viewer moves.
  function ridges(x,y,z,h,w,lean){
    for(const q of [-.57,0,.57]){
      const pts=Array.from({length:15},(_,i)=>{
        const t=.05+.88*i/14, side=q*w*Math.sin(Math.PI*t)**.82;
        return [x+lean*t*t+side*Math.cos(.28),y+h*(t+.28*Math.sin(Math.PI*t)-.14*t**5),
          z+side*Math.sin(.28)+.22*Math.sin(Math.PI*t)*(1-q*q)+.006];
      });
      pipe(pts,.005,pollen,0xa2ceb0,240);
    }
  }
  function bloom(x,y,z,size){
    part(surface(14,28,(t,s)=>{
      const th=tau*s;
      const r=size*(.05+.84*Math.sin(t*2.0)+.17*t**5*(1+Math.cos(6*th)));
      return [x+r*Math.cos(th),y-size*(1.48*t+.13*t**5*Math.cos(6*th)),z+r*Math.sin(th)];
    }),petal,0xf0a35b,2500);
    for(let j=0;j<3;j++){
      const th=j*tau/3,dx=.30*size*Math.cos(th),dz=.30*size*Math.sin(th);
      pipe([[x,y-.65*size,z],[x+dx,y-1.7*size,z+dz]],.006,pollen,0xfbd294,700);
    }
  }
  const x=flower.x,z=flower.z;
  const specimenRanges=[];
  drum(x,-.66,z,.55,.12,pot,0x48c3ac);
  const mainFlowerStart=shell.length;
  const screenLeaf=blade(x,-.58,z+.18,1.24,.49,.54,leaf,0x68dc99);
  ridges(x,-.58,z+.18,1.24,.49,.54);
  // New shoots at the base and a folded basal leaf give the flower a readable silhouette from the aisle.
  blade(x-.12,-.58,z-.1,.76,.24,-.50,lilac,0x57bba9,-.45);
  for(const [dx,h] of [[-.40,1.82],[.64,1.1]]){
    const curve=new T.CatmullRomCurve3([V(x,-.59,z),V(x-.04,.02,z-.10),V(x+dx*.5,h-.91,z-.05),V(x+dx,h-.68-(dx>0?.16:0),z+.09)]);
    part(new T.TubeGeometry(curve,30,.024,8,false),stem,0x84cfab,3200,branch);

    for(let i=0;i<6;i++){
      const p=curve.getPoint(.50+i*.092),sign=i%2?1:-1;
      const tip=p.clone().add(V(sign*(.23-.018*i),.055,.055));
      pipe([p.toArray(),[p.x+sign*.11,p.y+.09,p.z],tip.toArray()],.009,stem,0x84cfab,1400,branch);
      if(i===5){
        part(new T.SphereGeometry(.067,16,12).scale(.77,1.28,.77).translate(tip.x,tip.y-.05,tip.z),petal,0xfba876,3200);
      }else bloom(tip.x,tip.y,tip.z,(dx>0?.157:.148)-i*.011);
    }
  }
  specimenRanges.push([mainFlowerStart,shell.length]);
  for(let i=0;i<18;i++){
    const zz=-18.7-i*.60,xx=pathX(zz)-2.42+.38*Math.sin(i*1.8);
    if(Math.abs(zz-z)<.92)continue;
    for(let j=0;j<4;j++)blade(xx,-.60,zz,.27+rand()*.22,.105,.22,j%3?mint:lilac,0x4fbab2,j*tau/4);
  }
  for(let i=0;i<3;i++){
    const zz=-24.7-2*i,xx=pathX(zz)-2.12;
    drum(xx,-.53,zz,.46,.17,pot,0x55a5bd);
    part(new T.LatheGeometry([[.44,0],[.44,.63],[.41,.76],[.32,.84],[.08,.86]].map(([r,y])=>new T.Vector2(r,y)),32).translate(xx,-.43,zz),glass,0x728dbe,85);
    const plantStart=shell.length;
    // A rosette, paired bell spray and upright seed head are identifiable through their cases.
    if(i===1){
      for(const side of [-1,1]){
        pipe([[xx,-.42,zz],[xx,.02,zz],[xx+.14*side,.20,zz],[xx+.20*side,.14,zz]],.012,stem,0x8bcba0);
        bloom(xx+.20*side,.15,zz,.085);bloom(xx+.10*side,.07,zz+.03,.059);
      }
    }else if(i===2){
      pipe([[xx,-.40,zz],[xx,.12,zz],[xx+.04,.26,zz]],.016,stem,0x88bd9f);
      for(let k=0;k<7;k++){
        const th=k*2.4;
        part(new T.SphereGeometry(.052,12,8).scale(.75,1.35,.75).translate(xx+.06*Math.cos(th),.06+k*.032,zz+.06*Math.sin(th)),pollen,0xdeaa7a);
      }
    }
    for(let j=0;j<(i===1?2:5);j++)blade(xx,-.43,zz,.32+rand()*.17,.09,.18,i%2?lilac:mint,0x82cfb0,j*tau/5);
    if(i===1)specimenRanges.push([plantStart,shell.length]);
  }
  const enamel=finish(0x334c58,.43), bronze=finish(0xb98d60,.58), ceramic=finish(0xe7e4dc,.22);
  const block=(x,y,z,w,h,d,mat,color)=>part(new T.BoxGeometry(w,h,d).translate(x,y,z),mat,color,260);
  // Supply manifold, collars and short drops with flared atomising nozzles.
  pipe([[-1.42,-.88,-19],[-1.48,-.34,-19],[-1.48,1.66,-19],[-1.48,1.89,-19.3],[-1.48,1.89,-22],[-1.48,1.89,-25],[-1.48,1.89,-30]],.048,enamel,0x4b95ab);
  const nozzles=[];
  for(const zz of [-20.6,-23.6,-26.6,-29.6]){
    block(-1.48,1.90,zz,.15,.12,.13,rail,0x719dbc);
    pipe([[-1.48,1.89,zz],[-1.23,1.89,zz],[-1.03,1.80,zz],[-1.03,1.58,zz]],.023,rail);
    drum(-1.03,1.56,zz,.056,.09,bronze,0xbea273);
    part(new T.ConeGeometry(.082,.09,20).translate(-1.03,1.48,zz),enamel,0x617c91);
    nozzles.push(V(-1.03,1.44,zz));
  }
  // Service cabinet with a recessed vent, coolant sight glass and two shut-off wheels.
  block(-1.46,-.08,-19.16,.52,1.04,.36,enamel,0x46859b);
  block(-1.46,-.08,-18.96,.47,.93,.045,ceramic,0x71a2b3);
  for(let i=0;i<5;i++)block(-1.48,-.42+i*.046,-18.928,.29,.015,.014,enamel,0x496a81);
  for(const xx of [-1.57,-1.36]){
    part(new T.TorusGeometry(.064,.011,8,20).translate(xx,.10,-18.92),bronze,0xcb9e70);
    block(xx,.10,-18.92,.11,.012,.012,bronze,0xcb9e70);
  }
  for(const t of samples){
    drum(t.x,.44,t.z,.12,.038,rail,0x697d94);
    part(new T.TorusGeometry(.445,.012,8,56).rotateX(Math.PI/2).translate(t.x,-.41,t.z),bronze,0xc09c79);
  }
  drum(pilotLamp.x,-.52,pilotLamp.z,.067,.25,enamel,0x416990);
  const lampMat=new T.MeshStandardMaterial({color:0xffbc56,emissive:0xff921c});
  drum(pilotLamp.x,-.37,pilotLamp.z,.057,.09,lampMat,0xe4ab75);

  // Batch fixed parts sharing a finish; the leaf mesh remains available for the sight-line test.
  const batches=new Map();
  for(const mesh of [...room.children]){
    if(!mesh.isMesh || mesh.material.transparent)continue;
    const group=batches.get(mesh.material)??{positions:[],normals:[]};
    batches.set(mesh.material,group);
    const g=mesh.geometry, idx=g.index, n=idx?.count??g.attributes.position.count;
    for(let i=0;i<n;i++){
      const k=idx?idx.getX(i):i;
      for(const [attr,arr] of [[g.attributes.position,group.positions],[g.attributes.normal,group.normals]]){
        arr.push(attr.getX(k),attr.getY(k),attr.getZ(k));
      }
    }
    room.remove(mesh);
  }
  for(const [mat,g] of batches){
    const buffer=new T.BufferGeometry();
    buffer.setAttribute('position',new T.Float32BufferAttribute(g.positions,3));
    buffer.setAttribute('normal',new T.Float32BufferAttribute(g.normals,3));
    room.add(new T.Mesh(buffer,mat));
  }
  const carriage=new T.Group(),head=new T.Group();
  room.add(carriage);carriage.add(head);
  function fitting(parent,g,m,x,y,z){
    const mesh=new T.Mesh(g,m);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  }
  fitting(carriage,new T.BoxGeometry(.49,.14,.49),rail,0,0,0);
  fitting(carriage,new T.CylinderGeometry(.11,.10,.19,20),enamel,0,-.15,0);
  head.position.y=-.26;
  fitting(head,new T.BoxGeometry(.29,.20,.34),enamel,0,0,0);
  const lens=fitting(head,new T.CylinderGeometry(.085,.10,.10,24),lampMat,0,0,.21);
  lens.rotation.x=Math.PI/2;
  carriage.position.set(pathX(-21),2.40,-21);

  const drops=80,sprayBuffer=new Float32Array(drops*3);
  const sprayGeo=new T.BufferGeometry();
  sprayGeo.setAttribute('position',new T.BufferAttribute(sprayBuffer,3));
  const mist=new T.Points(sprayGeo,new T.PointsMaterial({color:0xcdeef6,size:.017,transparent:true,opacity:.64,depthWrite:false}));
  mist.frustumCulled=false;room.add(mist);
  const sweepTime={value:5},scanTarget={value:flower.clone()};
  // The fan terminates on the currently inspected plant and is visible in both perception modes.
  const fanGeo=new T.BufferGeometry(),fanVertices=new Float32Array(18);
  fanGeo.setAttribute('position',new T.BufferAttribute(fanVertices,3));
  const fanMat=new T.LineBasicMaterial({color:0x95ede6,transparent:true,opacity:.45,depthWrite:false});
  const dayFan=new T.LineSegments(fanGeo,fanMat),cloudFan=new T.LineSegments(fanGeo,fanMat);
  for(const [fan,parent] of [[dayFan,room],[cloudFan,scan]]){fan.frustumCulled=false;parent.add(fan);fan.visible=false;}
  const guideGeo=new T.BufferGeometry();
  guideGeo.setAttribute('position',new T.Float32BufferAttribute([0,0,0,-.021,.009,.004,.021,.009,.004],3));
  const guide=new T.Points(guideGeo,new T.PointsMaterial({size:.031,color:0xffc477,transparent:true}));
  scan.add(guide);
  function pulseAt(target){scanTarget.value.copy(target);sweepTime.value=0;}
  function animate(dt,now,phase,target){
    sweepTime.value+=dt;
    const desiredZ=target.z+.55;
    carriage.position.z+=(desiredZ-carriage.position.z)*(1-Math.exp(-dt*2));
    carriage.position.x=pathX(carriage.position.z);
    head.lookAt(target);
    guide.visible=phase==='scan' && sweepTime.value<4.2;
    if(guide.visible){
      const t=Math.min(1,sweepTime.value/2.7);
      guide.position.set(flower.x+.54+.42*t,flower.y+.06+.18*Math.sin(t*Math.PI),flower.z+.04+.40*t);
      guide.material.opacity=Math.min(1,4.2-sweepTime.value);
    }
    dayFan.visible=cloudFan.visible=sweepTime.value<1.3;
    if(cloudFan.visible){
      const y=target.y-.55+sweepTime.value*.94;
      for(let j=0;j<3;j++){
        fanVertices.set([carriage.position.x,2.14,carriage.position.z,target.x+(j-1)*.30,y,target.z],j*6);
      }
      fanGeo.attributes.position.needsUpdate=true;
    }
    lampMat.emissiveIntensity=phase==='end'?.25:1+.22*Math.sin(now*.004);
    const cycle=(now*.001)%8;
    mist.visible=cycle<2.3 && (phase==='end'||phase==='glass'||phase==='survey');
    if(mist.visible){
      for(let k=0;k<drops;k++){
        const nozzle=nozzles[k%4], t=(now*.00084+k*.618)%1, angle=k*2.40, r=t*.27;
        sprayBuffer[k*3]=nozzle.x+r*Math.cos(angle);
        sprayBuffer[k*3+1]=nozzle.y-t*(.40+.42*t);
        sprayBuffer[k*3+2]=nozzle.z+r*Math.sin(angle);
      }
      sprayGeo.attributes.position.needsUpdate=true;
    }
  }
  function points(data,size){
    const g=new T.BufferGeometry(),packed=new T.InterleavedBuffer(new Float32Array(data),6);
    g.setAttribute('position',new T.InterleavedBufferAttribute(packed,3,0));
    g.setAttribute('color',new T.InterleavedBufferAttribute(packed,3,3));
    const m=new T.PointsMaterial({size,sizeAttenuation:true,vertexColors:true});
    m.onBeforeCompile=shader=>{
      shader.uniforms.scanAge=sweepTime;shader.uniforms.scanCenter=scanTarget;
      shader.vertexShader='varying float scanDistance; uniform vec3 scanCenter;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n scanDistance=distance(position,scanCenter);');
      shader.fragmentShader='varying float scanDistance; uniform float scanAge;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        if(distance(gl_PointCoord,vec2(.5))>.48)discard;
        float wave=scanAge*4.8;
        if(scanAge<2. && scanDistance>wave+.08)diffuseColor.rgb*=.13;
        diffuseColor.rgb+=vec3(.44,.69,.68)*exp(-12.*abs(scanDistance-wave));`);
    };
    const obj=new T.Points(g,m);scan.add(obj);return obj;
  }
  points(shell,.014);
  const stemPoints=points(branch,.018),captured=new Set(),ray=new T.Raycaster(),pt=V(),dir=V();
  function capture(eye){
    room.updateMatrixWorld(true);
    const before=captured.size;
    for(let i=0;i<branch.length;i+=6){
      if(captured.has(i/6))continue;
      pt.fromArray(branch,i);dir.subVectors(pt,eye);
      ray.far=dir.length()-.008;ray.set(eye,dir.normalize());
      if(!ray.intersectObject(screenLeaf,false).length)captured.add(i/6);
    }
    stemPoints.geometry.setIndex(Array.from(captured));
    return captured.size-before;
  }
  function drawComparison(canvas){
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let view=0;view<2;view++){
      const [start,end]=specimenRanges[view];
      let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
      for(let i=start;i<end;i+=6){
        xmin=Math.min(xmin,shell[i]);xmax=Math.max(xmax,shell[i]);
        ymin=Math.min(ymin,shell[i+1]);ymax=Math.max(ymax,shell[i+1]);
      }
      const w=canvas.width/2,k=Math.min((w-24)/(xmax-xmin),(canvas.height-12)/(ymax-ymin));
      for(let i=start;i<end;i+=12){
        ctx.fillStyle=shell[i+3]>shell[i+4]?'#ffc797':'#81dad0';
        ctx.fillRect(w*(view+.5)+(shell[i]-(xmin+xmax)*.5)*k,canvas.height-5-(shell[i+1]-ymin)*k,1.1,1.1);
      }
    }
  }
  function reset(){captured.clear();stemPoints.geometry.setIndex([]);room.visible=false;}
  reset();
  return {room,scan,capture,reset,animate,pulseAt,drawComparison};
}
