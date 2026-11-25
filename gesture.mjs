const clamp = (x, low, high) => Math.max(low, Math.min(high, x));

// Map a comfortable working area below the eyes to the full view.
// Use the neutral face so looking around does not move the hand cursor.
export function handCursor(joints, neutral, aspect){
  const palm=[0,5,9,13,17].reduce((point,i)=>({
    x:point.x+(1-joints[i].x)/5, y:point.y+joints[i].y/5
  }),{x:0,y:0});
  if(!neutral)return palm;
  const shift=clamp(neutral.width*aspect*.72,.10,.23);
  const centerY=Math.min(.77,neutral.y+shift);
  return {
    x:clamp(.5+(palm.x-(1-neutral.x))*1.55,.02,.98),
    y:clamp(.5+(palm.y-centerY)*1.8,.02,.98)
  };
}

// Estimate screen direction from each iris relative to its own eyelids.
export class EyeAim {
  constructor() { this.reset(); }
  reset() { this.base = null; this.samples = []; this.point = null; }
  update(face) {
    if (!face?.[473]) { this.point = null; return; }
    const readings = [];
    for (const [a,b,top,bottom,iris] of [[33,133,159,145,468],[362,263,386,374,473]]) {
      const left=face[a], right=face[b], pupil=face[iris];
      const dx=right.x-left.x, dy=right.y-left.y, length2=dx*dx+dy*dy;
      const gap=face[bottom].y-face[top].y;
      if (length2 < .00004 || gap < Math.sqrt(length2)*.11) continue;
      readings.push([((pupil.x-left.x)*dx+(pupil.y-left.y)*dy)/length2,(pupil.y-face[top].y)/gap]);
    }
    if (readings.length < 2) { this.point=null; return; }
    const x=(readings[0][0]+readings[1][0])/2, y=(readings[0][1]+readings[1][1])/2;
    if (!this.base) {
      this.samples.push([x,y]);
      if (this.samples.length < 10) return;
      this.base=[0,1].map(i=>this.samples.map(s=>s[i]).sort((a,b)=>a-b)[5]);
    }
    const next={x:clamp(.5-(x-this.base[0])*2.9,.04,.96), y:clamp(.5+(y-this.base[1])*1.25,.05,.95)};
    const prev=this.point || next;
    this.point={x:prev.x+.35*(next.x-prev.x),y:prev.y+.35*(next.y-prev.y)};
  }
}

export class ReachGrab {
  constructor() { this.reset(); }
  reset() {
    this.opened=false; this.nearAt=-Infinity; this.lastSeen=-Infinity;
    this.pressAt=null; this.reached=false; this.extension=0;this.held=false;
  }
  update(joints, aspect, near, now, maxGap=350) {
    if (!joints || now-this.lastSeen>maxGap) this.reset();
    if (!joints) return null;
    this.lastSeen=now;
    const distance=(a,b)=>Math.hypot((joints[a].x-joints[b].x)*aspect,joints[a].y-joints[b].y);
    const ratios=[[8,6],[12,10],[16,14],[20,18]].map(([tip,joint])=>distance(tip,0)/Math.max(.01,distance(joint,0)));
    const extension=ratios.reduce((sum,ratio)=>sum+ratio,0)/ratios.length;
    const open=ratios.filter(ratio=>ratio>1.10).length>=3;
    if(this.held){
      if(!open||extension<this.extension-.065)return {action:'',open:false,ready:false};
      this.reset();
      return {action:'',open:true,ready:false};
    }
    const cupped=this.opened && this.extension-extension>=.11 &&
      ratios.filter(ratio=>ratio<1.14).length>=3;
    if (open && !cupped) {
      this.pressAt=null;
      this.opened=true;
      if (near) {
        if (now-this.nearAt>maxGap) {
          this.entered=now;
          this.extension=0;
        }
        this.nearAt=now;
        this.extension=Math.max(this.extension,extension);
        this.reached=now-this.entered>=120;
      } else if(now-this.nearAt>maxGap) this.reached=false;
    }
    let action='';
    if (cupped) {
      this.pressAt??=now;
      if (now-this.pressAt>=55) {
        action=near && this.reached && this.pressAt-this.nearAt<=Math.max(420,maxGap)?'grab':'miss';
        if(action==='grab')this.held=true;
        else this.reset();
      }
    } else this.pressAt=null;
    return {action,open:open&&!cupped,ready:!this.held&&this.opened&&this.reached&&now-this.nearAt<=Math.max(420,maxGap)};
  }
}
// Pinch is edge-triggered. A fresh, visible release rearms it even after tracking loss.
export class Pinch {
  reset(){this.armed=false;this.since=null;this.last=null;this.target=null;this.duration=55;}
  constructor(){this.reset();}
  progress(now){
    if(this.since===null || now-this.last>this.maxGap)return 0;
    return clamp((now-this.since)/this.duration,0,.98);
  }
  update(hand,aspect,now,target=true,duration=55,maxGap=250){
    this.maxGap=maxGap;
    if(!hand || (this.last!==null && now-this.last>maxGap))this.reset();
    if(!hand)return false;
    this.last=now;
    const dist=(a,b)=>Math.hypot((hand[a].x-hand[b].x)*aspect,hand[a].y-hand[b].y);
    const ratio=dist(4,8)/Math.max(.015,dist(5,17));
    if(ratio>.55){this.armed=true;this.since=null;this.target=null;return false;}
    if(!this.armed)return false;
    if(this.since!==null && (this.target!==target || ratio>.49)){
      this.armed=false;this.since=null;this.target=null;return false;
    }
    if(this.since===null){
      if(ratio>.40)return false;
      if(!target){this.armed=false;return false;}
      this.since=now;this.target=target;this.duration=duration;
    }
    if(now-this.since<duration)return false;
    this.reset();this.last=now;return true;
  }
}
