'use strict';
const alliances = require('./alliances');
function liveIds(room) { return room.players.filter(p => p.health > 0).map(p => p.id); }
function groupFor(room,id) { return (room.alliances || []).find(group => group.includes(id)); }
function propose(room,player,targetId) {
  if(room.phase!=='playing'||room.players[room.turnIndex]?.id!==player.id||player.health<=0)throw Error('只能在自己的回合提出同盟');
  if(room.neutralRound||room.war||room.pendingChoice||room.pendingAlliance)throw Error('请先完成当前行动');
  if(room.mainActionUsed)throw Error('本回合已使用主要行动');
  const alive=liveIds(room),plan=alliances.planJoin(room.alliances||[],alive,player.id,targetId);
  const voters=(groupFor(room,targetId)||[targetId]).filter(id=>alive.includes(id));
  const fee=2*voters.length;
  if(player.gold<fee)throw Error(`加入需要支付 ${fee} 金`);
  room.pendingAlliance={proposerId:player.id,targetId,voters,votes:{},fee,isSwitch:plan.isSwitch};
  room.mainActionUsed=true;room.event=`${player.name}提出同盟申请，等待表决。`;
}
function vote(room,player,choice) {
  const pending=room.pendingAlliance;
  if(!pending||!pending.voters.includes(player.id)||Object.hasOwn(pending.votes,player.id)||!['yes','no'].includes(choice))throw Error('当前不能投票');
  pending.votes[player.id]=choice;
  const yes=Object.values(pending.votes).filter(x=>x==='yes').length;
  const remaining=pending.voters.length-Object.keys(pending.votes).length;
  const required=Math.floor(pending.voters.length/2)+1;
  if(yes>=required){
    const proposer=room.players.find(p=>p.id===pending.proposerId),alive=liveIds(room);
    const plan=alliances.planJoin(room.alliances||[],alive,pending.proposerId,pending.targetId);
    if(!proposer||proposer.gold<pending.fee)throw Error('申请者黄金不足');
    proposer.gold-=pending.fee;for(const id of pending.voters)room.players.find(p=>p.id===id).gold+=2;
    room.alliances=plan.groups;
    if(plan.isSwitch)proposer.alliancePenaltyUntil=room.round+3;
    room.pendingAlliance=null;room.event=`${proposer.name}加入同盟，支付 ${pending.fee} 金。`+(plan.isSwitch?' 跳槽减益持续本轮及后两轮。':'');
  }else if(yes+remaining<required){room.pendingAlliance=null;room.event='同盟申请未获超过半数同意。';}
  else room.event=`同盟表决中：已同意 ${yes}/${required}。`;
}
function view(room) {
  const pending=room.pendingAlliance;
  return {groups:(room.alliances||[]).map(group=>[...group]),limit:alliances.limit(liveIds(room).length),pending:pending?{proposerId:pending.proposerId,targetId:pending.targetId,voters:[...pending.voters],votes:{...pending.votes},fee:pending.fee,waitingId:pending.voters.find(id=>!Object.hasOwn(pending.votes,id))||null}:null};
}
function penalty(player,round) {return Number.isSafeInteger(player.alliancePenaltyUntil)&&round<player.alliancePenaltyUntil?1:0;}
module.exports={propose,vote,view,penalty};
