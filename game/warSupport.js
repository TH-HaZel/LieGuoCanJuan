'use strict';
const bonuses=require('./permanentBonuses');
const statuses=require('./statuses');
function candidates(room,sideId,enemyId){
 const group=(room.alliances||[]).find(g=>g.includes(sideId))||[];
 return room.players.filter(p=>p.health>0&&p.id!==sideId&&p.id!==enemyId&&group.includes(p.id));
}
function eligible(player){return player.generals.map((g,index)=>({g,index})).filter(({g})=>!(g.remaining>0));}
function power(g,attribute,round,options={}){
 if(!['attack','defense'].includes(attribute))throw Error('增援属性无效');
 const active=statuses.active(g,round);
 const locked=active.some(s=>s.kind==='war_lock');
 const temporary=active.filter(s=>s.kind===attribute).reduce((sum,s)=>sum+(attribute==='attack'&&locked&&s.value>0?0:attribute==='attack'&&options.weather&&s.value>0?Math.max(0,s.value-1):s.value),0);
 return Math.floor(Math.max(0,bonuses.effective(g,attribute)+temporary)*(options.multiplier||1)/2);
}
function refuse(room,requester,ally){
 const group=(room.alliances||[]).find(g=>g.includes(requester.id)&&g.includes(ally.id));
 if(!group)throw Error('不是有效的盟友');
 if(!eligible(ally).length)return false;
 room.alliances=room.alliances.map(g=>g===group?g.filter(id=>id!==ally.id):g).filter(g=>g.length>1);
 ally.gold-=10;
 ally.militaryBetrayalPending=true;
 ally.betrayalAllianceUntil=room.round+2;
 return true;
}
module.exports={candidates,eligible,power,refuse};
