const clamp = (x, low, high) => Math.max(low, Math.min(high, x));

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
  reset() { this.opened=false; this.nearAt=-Infinity; this.lastSeen=-Infinity; this.base=Infinity; this.pressAt=null; this.reached=false; }
  update(joints, aspect, near, now) {
    if (now-this.lastSeen>350) this.reset();
    if (!joints) return null;
    this.lastSeen=now;
    const distance=(a,b)=>Math.hypot((joints[a].x-joints[b].x)*aspect,joints[a].y-joints[b].y);
    const span=(distance(5,17)+distance(0,9))/2;
    const straight=[[8,6],[12,10],[16,14],[20,18]].filter(([tip,joint])=>distance(tip,0)>distance(joint,0)*1.10).length;
    if (straight>=3) {
      this.pressAt=null;
      if (!this.opened) this.base=span;
      this.opened=true;
      this.base=Math.min(this.base,span);
      if (near) {
        if (now-this.nearAt>350) this.entered=now;
        this.nearAt=now;
        // A palm already extended toward the camera can settle into the target.
        this.reached=span>this.base*1.055 || now-this.entered>=160;
      } else if(now-this.nearAt>350) this.reached=false;
    }
    let action='';
    if (this.opened && straight<=1) {
      this.pressAt??=now;
      if (now-this.pressAt>=55) {
        action=this.reached && now-this.nearAt<=420?'grab':'miss';
        this.reset();
      }
    } else if(straight>1) this.pressAt=null;
    return {action,open:straight>=3,ready:this.opened && this.reached && now-this.nearAt<=420};
  }
}