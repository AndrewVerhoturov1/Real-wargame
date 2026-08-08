export const SOLDIER_POSES = ['idle','ready','walk','run','crouch','crouchMove','crouchRun','prone','proneAim','crawl','standAim','crouchAim'] as const;
export type SoldierPoseId = (typeof SOLDIER_POSES)[number];
export const SOLDIER_WEAPONS = ['mosin','ppsh41','dp27'] as const;
export type SoldierWeaponId = (typeof SOLDIER_WEAPONS)[number];

export interface SoldierRenderState {
  pose: SoldierPoseId;
  weapon: SoldierWeaponId;
  phase: number;
  bodyDirection: number;
  attentionDirection: number;
  weaponDirection: number;
  size: number;
  selected?: boolean;
}
export interface SoldierRenderOptions {
  showShadow?: boolean;
  showBodyDirection?: boolean;
  showAttentionDirection?: boolean;
  showWeaponDirection?: boolean;
  showAttentionSector?: boolean;
  attentionSectorRadians?: number;
  opacity?: number;
}

export const POSE_LABELS: Record<SoldierPoseId,string> = {
  idle:'Стоит спокойно', ready:'Оружие наготове', walk:'Идёт', run:'Бежит', crouch:'Стоит пригнувшись',
  crouchMove:'Движется пригнувшись', crouchRun:'Бежит пригнувшись', prone:'Лежит', proneAim:'Целится лёжа',
  crawl:'Ползёт', standAim:'Целится стоя', crouchAim:'Целится из приседа',
};
export const WEAPON_LABELS: Record<SoldierWeaponId,string> = { mosin:'Винтовка Мосина', ppsh41:'ППШ-41', dp27:'ДП-27' };

type V = {x:number;y:number};
type Shape = {
  prone:boolean; low:boolean; head:V; torso:V; torsoW:number; torsoL:number;
  ls:V; rs:V; lh:V; rh:V; lk:V; rk:V; lf:V; rf:V; bob:number; crawl:number;
};
type WeaponGeom = {rear:V;muzzle:V;rearGrip:V;frontGrip:V;receiver:V};
const TAU=Math.PI*2, BASE=54;
const C={outline:'#24271b',tunic:'#73764e',tunicLight:'#8c8e61',tunicDark:'#585c3d',trousers:'#626543',boots:'#29251c',helmet:'#575b39',helmetLight:'#777b4d',skin:'#b88e68',pack:'#4f5036',wood:'#64482f',metal:'#30332d',metalLight:'#5a5e54',select:'#d3b45b',body:'#d5c382',attention:'#9cc6a2',weapon:'#d79d78'};
const W={mosin:{total:34,rear:8,width:2.2,receiver:3,wood:14,front:2.5,back:-4.2},ppsh41:{total:27,rear:7,width:3.2,receiver:4.5,wood:13,front:1,back:-4},dp27:{total:35,rear:7,width:3.6,receiver:5,wood:12,front:4,back:-3.8}} as const;
const v=(x:number,y:number):V=>({x,y});
const add=(a:V,b:V):V=>v(a.x+b.x,a.y+b.y), mul=(a:V,n:number):V=>v(a.x*n,a.y*n), mid=(a:V,b:V):V=>v((a.x+b.x)/2,(a.y+b.y)/2);
const fwd=(a:number):V=>v(Math.sin(a),-Math.cos(a)), right=(a:number):V=>v(Math.cos(a),Math.sin(a));
const rot=(p:V,a:number):V=>{const c=Math.cos(a),s=Math.sin(a);return v(p.x*c-p.y*s,p.x*s+p.y*c)};
const world=(p:V,a:number):V=>rot(p,a);

function baseShape():Shape{return {prone:false,low:false,head:v(0,-8.4),torso:v(0,.3),torsoW:18.5,torsoL:12.5,ls:v(-7.8,-2.2),rs:v(7.8,-2.2),lh:v(-4.1,4.5),rh:v(4.1,4.5),lk:v(-4.4,8.2),rk:v(4.4,8.2),lf:v(-4.6,13.4),rf:v(4.6,13.4),bob:0,crawl:0}}
function shape(pose:SoldierPoseId,phase:number):Shape{
  const s=baseShape(), step=Math.sin(phase*TAU), lift=Math.abs(Math.cos(phase*TAU)), pulse=Math.sin(phase*TAU*2);
  switch(pose){
    case'idle': s.lf=v(-5,13.1);s.rf=v(4.5,12.4);break;
    case'ready': s.head=v(0,-9.5);s.torso=v(0,-.5);s.ls=v(-8,-2.8);s.rs=v(8,-2.8);s.lf=v(-5.5,12.5);s.rf=v(5.2,13.5);break;
    case'walk':{const q=step*5.8;s.bob=-lift*.7;s.lk=v(-4.6-pulse*.7,8-q*.44);s.rk=v(4.6+pulse*.7,8+q*.44);s.lf=v(-5-pulse*.8,13-q);s.rf=v(5+pulse*.8,13+q);break}
    case'run':{const q=step*8.8;s.head=v(0,-10.6);s.torso=v(0,-1.4-lift*.8);s.ls=v(-7.7,-3.6);s.rs=v(7.7,-3.6);s.lh=v(-4.2,3.7);s.rh=v(4.2,3.7);s.bob=-lift*1.1;s.lk=v(-6-pulse,7-q*.46);s.rk=v(6+pulse,7+q*.46);s.lf=v(-7.4-pulse,11.8-q);s.rf=v(7.4+pulse,11.8+q);break}
    case'crouch':s.low=true;s.head=v(0,-9.4);s.torso=v(0,.9);s.torsoW=20.4;s.torsoL=11.4;s.ls=v(-8.8,-1.3);s.rs=v(8.8,-1.3);s.lh=v(-4.8,4.6);s.rh=v(4.8,4.6);s.lk=v(-8.9,7.9);s.rk=v(8.9,7.9);s.lf=v(-6.8,12.4);s.rf=v(6.8,12.4);break;
    case'crouchAim':s.low=true;s.head=v(0,-11.3);s.torso=v(0,-.5);s.torsoW=19.2;s.torsoL=10.5;s.ls=v(-8.1,-3);s.rs=v(8.1,-3);s.lh=v(-4.6,3.8);s.rh=v(4.6,3.8);s.lk=v(-8.9,6.4);s.rk=v(7.2,8.5);s.lf=v(-7.4,10.8);s.rf=v(5.7,13.2);break;
    case'crouchMove':{const q=step*4.2;s.low=true;s.head=v(0,-10.1);s.torso=v(0,.2-lift*.45);s.torsoW=20;s.torsoL=11;s.ls=v(-8.6,-1.8);s.rs=v(8.6,-1.8);s.lh=v(-4.6,4);s.rh=v(4.6,4);s.lk=v(-8.7,7.2-q*.4);s.rk=v(8.7,7.2+q*.4);s.lf=v(-6.6,11.7-q);s.rf=v(6.6,11.7+q);s.bob=-lift*.6;break}
    case'crouchRun':{const q=step*6.7;s.low=true;s.head=v(0,-11.1);s.torso=v(0,-.9-lift*.65);s.torsoW=20.3;s.torsoL=10.6;s.ls=v(-8.7,-2.6);s.rs=v(8.7,-2.6);s.lh=v(-4.8,3.6);s.rh=v(4.8,3.6);s.lk=v(-9.5,6.3-q*.42);s.rk=v(9.5,6.3+q*.42);s.lf=v(-7.6,10.8-q);s.rf=v(7.6,10.8+q);s.bob=-lift*.9;break}
    case'prone':s.prone=s.low=true;s.head=v(-.8,-12.1);s.torso=v(0,0);s.torsoW=15.4;s.torsoL=24.2;s.ls=v(-6.8,-5.2);s.rs=v(6.8,-5.2);s.lh=v(-4.4,7);s.rh=v(4.4,7);s.lk=v(-6.5,12.7);s.rk=v(4.1,13.5);s.lf=v(-5.5,18.6);s.rf=v(5,19.3);break;
    case'proneAim':s.prone=s.low=true;s.head=v(0,-14.5);s.torso=v(0,-1.8);s.torsoW=14.2;s.torsoL=26;s.ls=v(-6.1,-7);s.rs=v(6.1,-7);s.lh=v(-4,6.7);s.rh=v(4,6.7);s.lk=v(-4.8,13);s.rk=v(4.8,13);s.lf=v(-5.2,19.4);s.rf=v(5.2,19.4);break;
    case'crawl':{s.prone=s.low=true;s.crawl=step;s.head=v(pulse*.45,-13);s.torso=v(pulse*.35,-.6);s.torsoW=15;s.torsoL=24.5;s.ls=v(-6.5,-5.7-step*1.2);s.rs=v(6.5,-5.7+step*1.2);s.lh=v(-4.2,6.8);s.rh=v(4.2,6.8);s.lk=v(-7.5,11.5-step*3.2);s.rk=v(7.5,11.5+step*3.2);s.lf=v(-5.8,18.6-step*1.2);s.rf=v(5.8,18.6+step*1.2);s.bob=Math.cos(phase*TAU)*.35;break}
    case'standAim':s.head=v(0,-10.8);s.torso=v(0,-1.3);s.ls=v(-7.6,-3.4);s.rs=v(7.6,-3.4);s.lh=v(-4.2,3.9);s.rh=v(4.2,3.9);s.lk=v(-4.8,7.8);s.rk=v(4.1,8.8);s.lf=v(-5.8,12.2);s.rf=v(4.6,14);break;
  }
  return s;
}

function segment(ctx:CanvasRenderingContext2D,a:V,b:V,w:number,fill:string,edge=1.4){ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=C.outline;ctx.lineWidth=w+edge*2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.strokeStyle=fill;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore()}
function ellipse(ctx:CanvasRenderingContext2D,p:V,rx:number,ry:number,a:number,fill:string){ctx.fillStyle=fill;ctx.strokeStyle=C.outline;ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(p.x,p.y,rx,ry,a,0,TAU);ctx.fill();ctx.stroke()}
function joint(ctx:CanvasRenderingContext2D,p:V,r:number,fill:string){ctx.fillStyle=C.outline;ctx.beginPath();ctx.arc(p.x,p.y,r+1.1,0,TAU);ctx.fill();ctx.fillStyle=fill;ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.fill()}

function weaponGeom(state:SoldierRenderState,s:Shape):WeaponGeom{
  const spec=W[state.weapon], f=fwd(state.weaponDirection), r=right(state.weaponDirection);
  let lateral=s.low?2.5:2.1,advance=s.low?4.1:3.6;
  switch(state.pose){case'idle':lateral=4.2;advance=1.2;break;case'ready':lateral=2.8;advance=3;break;case'standAim':lateral=.8;advance=5.8;break;case'crouch':lateral=3.2;advance=3.1;break;case'crouchAim':lateral=.7;advance=6;break;case'prone':lateral=3.8;advance=5.3;break;case'proneAim':lateral=.4;advance=10.4;break;case'crawl':lateral=2.7;advance=7;break}
  const receiver=add(mul(f,advance),mul(r,lateral));
  return {receiver,rear:add(receiver,mul(f,-spec.rear)),muzzle:add(receiver,mul(f,spec.total-spec.rear)),rearGrip:add(receiver,mul(f,spec.back)),frontGrip:add(receiver,mul(f,spec.front))};
}
function drawWeapon(ctx:CanvasRenderingContext2D,state:SoldierRenderState,g:WeaponGeom){
  const spec=W[state.weapon], f=fwd(state.weaponDirection), r=right(state.weaponDirection),woodEnd=add(g.rear,mul(f,spec.wood));
  segment(ctx,g.rear,woodEnd,spec.width+1.2,C.wood,1.2);segment(ctx,woodEnd,g.muzzle,spec.width,C.metal,1.1);
  ctx.save();ctx.translate(g.receiver.x,g.receiver.y);ctx.rotate(state.weaponDirection);ctx.fillStyle=C.metal;ctx.strokeStyle=C.outline;ctx.lineWidth=1.2;ctx.beginPath();ctx.roundRect(-spec.receiver/2,-4,spec.receiver,8,1.2);ctx.fill();ctx.stroke();
  if(state.weapon==='ppsh41'){ctx.beginPath();ctx.arc(2.6,1.2,4,0,TAU);ctx.fill();ctx.stroke();ctx.strokeStyle=C.metalLight;ctx.beginPath();ctx.arc(2.6,1.2,2.6,0,TAU);ctx.stroke()}
  if(state.weapon==='dp27'){ctx.beginPath();ctx.ellipse(0,-1,5.7,5.2,0,0,TAU);ctx.fill();ctx.stroke();ctx.strokeStyle=C.metalLight;ctx.beginPath();ctx.arc(0,-1,3.3,0,TAU);ctx.stroke()}
  ctx.restore();
  if(state.weapon==='dp27'){const root=add(g.muzzle,mul(f,-5.5));segment(ctx,root,add(add(root,mul(f,4.5)),mul(r,-4)),1.2,C.metal,.55);segment(ctx,root,add(add(root,mul(f,4.5)),mul(r,4)),1.2,C.metal,.55)}
}
function drawLegs(ctx:CanvasRenderingContext2D,state:SoldierRenderState,s:Shape){
  const a=state.bodyDirection, lh=world(s.lh,a),rh=world(s.rh,a),lk=world(s.lk,a),rk=world(s.rk,a),lf=world(s.lf,a),rf=world(s.rf,a),tw=s.prone?4.9:s.low?5.5:5.2,sw=s.prone?4.6:4.8;
  segment(ctx,lh,lk,tw,C.trousers);segment(ctx,rh,rk,tw,C.trousers);segment(ctx,lk,lf,sw,C.tunicDark);segment(ctx,rk,rf,sw,C.tunicDark);const toe=mul(fwd(a),s.prone?2.5:2.8);segment(ctx,lf,add(lf,toe),s.prone?4.4:4.8,C.boots,1.2);segment(ctx,rf,add(rf,toe),s.prone?4.4:4.8,C.boots,1.2)
}
function drawTorso(ctx:CanvasRenderingContext2D,state:SoldierRenderState,s:Shape){
  const a=state.bodyDirection,c=world(add(s.torso,v(0,s.bob)),a);ellipse(ctx,c,s.torsoW/2,s.torsoL/2,a,s.low?C.tunicDark:C.tunic);const rear=add(c,mul(fwd(a),s.prone?-3.5:-4.2));ctx.save();ctx.translate(rear.x,rear.y);ctx.rotate(a);ctx.fillStyle=C.pack;ctx.strokeStyle=C.outline;ctx.lineWidth=1.3;ctx.beginPath();ctx.roundRect(-(s.prone?9.5:11)/2,-(s.prone?5:6.3)/2,s.prone?9.5:11,s.prone?5:6.3,2.2);ctx.fill();ctx.stroke();ctx.restore()
}
function drawArms(ctx:CanvasRenderingContext2D,state:SoldierRenderState,s:Shape,g:WeaponGeom){
  const a=state.bodyDirection,ls=world(s.ls,a),rs=world(s.rs,a),br=right(a),wf=fwd(state.weaponDirection);let left=g.frontGrip,rightHand=g.rearGrip;if(state.pose==='idle'){left=add(left,mul(right(state.weaponDirection),-.5));rightHand=add(rightHand,mul(right(state.weaponDirection),.5))}
  let le:V,re:V;if(s.prone){const aim=state.pose==='proneAim',lo=aim?-5.8:-5.5,ro=aim?5.8:4.9;le=add(mid(ls,left),add(mul(br,lo),mul(wf,s.crawl*1.5)));re=add(mid(rs,rightHand),add(mul(br,ro),mul(wf,-s.crawl*1.5)))}else if(s.low){const e=state.pose==='crouchAim'?1.3:2.6;le=add(mid(ls,left),mul(br,-e));re=add(mid(rs,rightHand),mul(br,e))}else{const e=state.pose==='standAim'?1:state.pose==='idle'?2.8:1.9;le=add(mid(ls,left),mul(br,-e));re=add(mid(rs,rightHand),mul(br,e))}
  const sleeve=s.low?C.tunicDark:C.tunic;segment(ctx,ls,le,4.8,sleeve,1.2);segment(ctx,le,left,4.3,sleeve,1.2);segment(ctx,rs,re,4.8,sleeve,1.2);segment(ctx,re,rightHand,4.3,sleeve,1.2);joint(ctx,left,1.9,C.skin);joint(ctx,rightHand,1.9,C.skin)
}
function drawHead(ctx:CanvasRenderingContext2D,state:SoldierRenderState,s:Shape):V{
  const base=world(add(s.head,v(0,s.bob*.35)),state.bodyDirection),af=fwd(state.attentionDirection),c=add(base,mul(af,1.1)),r=s.prone?5.3:s.low?5.7:6;ellipse(ctx,c,r,r*.92,state.attentionDirection,C.helmet);const rr=right(state.attentionDirection),front=add(c,mul(af,r*.72));ctx.save();ctx.strokeStyle=C.helmetLight;ctx.lineWidth=1.25;ctx.beginPath();ctx.moveTo(front.x-rr.x*r*.45,front.y-rr.y*r*.45);ctx.lineTo(front.x+rr.x*r*.45,front.y+rr.y*r*.45);ctx.stroke();ctx.fillStyle=C.skin;const face=add(c,mul(af,r*.87));ctx.beginPath();ctx.ellipse(face.x,face.y,2.2,1.2,state.attentionDirection,0,TAU);ctx.fill();ctx.restore();return c
}
function guides(ctx:CanvasRenderingContext2D,state:SoldierRenderState,o:SoldierRenderOptions,head:V){
  const line=(a:number,len:number,color:string,start=v(0,0))=>{const f=fwd(a);ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.25;ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(start.x+f.x*len,start.y+f.y*len);ctx.stroke();ctx.restore()};
  if(o.showAttentionSector){const span=o.attentionSectorRadians??Math.PI*.48,start=state.attentionDirection-span/2-Math.PI/2;ctx.save();ctx.globalAlpha*=.12;ctx.fillStyle=C.attention;ctx.beginPath();ctx.moveTo(head.x,head.y);ctx.arc(head.x,head.y,28,start,start+span);ctx.closePath();ctx.fill();ctx.restore()} if(o.showBodyDirection)line(state.bodyDirection,24,C.body);if(o.showAttentionDirection)line(state.attentionDirection,22,C.attention,head);if(o.showWeaponDirection)line(state.weaponDirection,30,C.weapon,v(0,-.5))
}
export function drawSoldierTopDown(ctx:CanvasRenderingContext2D,x:number,y:number,state:SoldierRenderState,o:SoldierRenderOptions={}):void{
  const scale=Math.max(.18,state.size/BASE),s=shape(state.pose,((state.phase%1)+1)%1);ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.globalAlpha=o.opacity??1;
  if(state.selected){ctx.save();ctx.strokeStyle=C.select;ctx.lineWidth=1.25;ctx.setLineDash([3,3]);ctx.beginPath();if(s.prone)ctx.ellipse(0,2,14,27,state.bodyDirection,0,TAU);else ctx.ellipse(0,2,s.low?16.5:15,s.low?15:14,0,0,TAU);ctx.stroke();ctx.restore()}
  if(o.showShadow!==false){ctx.save();ctx.globalAlpha*=.18;ctx.fillStyle='#0c0f0b';ctx.beginPath();if(s.prone)ctx.ellipse(2,4,8,22,state.bodyDirection,0,TAU);else ctx.ellipse(2,3,s.low?13:11.5,s.low?10.5:9.5,state.bodyDirection,0,TAU);ctx.fill();ctx.restore()}
  drawLegs(ctx,state,s);drawTorso(ctx,state,s);const g=weaponGeom(state,s);drawWeapon(ctx,state,g);drawArms(ctx,state,s,g);const head=drawHead(ctx,state,s);guides(ctx,state,o,head);ctx.restore();
}
