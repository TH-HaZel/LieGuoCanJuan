'use strict';
// Only effects with confirmed rules are enabled here.
const effects={
  N21:{use({room,player}){(player.recoverySchedule||(player.recoverySchedule=[])).push({start:room.round+1});}},
  N24:{validate({room,player,targetPlayerId}){const target=room.players.find(p=>p.id===targetPlayerId);if(!target||target.id===player.id||target.health<=0)throw Error('请选择其他存活国家');},use({room,targetPlayerId}){const p=room.players.find(p=>p.id===targetPlayerId);(p.incomePenalties||(p.incomePenalties=[])).push({round:room.round+1,amount:2});}},
  N26:{use({room,player}){for(const p of room.players)if(p.id!==player.id&&p.health>0)(p.incomePenalties||(p.incomePenalties=[])).push({round:room.round+1,amount:1});}},
  N15:{use({player}){player.gold+=5;}},
  N16:{validate({player}){if(player.health<=1)throw Error('国家生命必须大于 1');},use({player}){player.health--;player.gold+=6;}},
  N17:{use({room,player}){for(const p of room.players)if(p.health>0)p.gold+=2;player.gold+=2;}},
  N20:{use({room,player}){for(const p of room.players)if(p.health>0)p.gold+=3;player.gold+=2;}},
  T16:{validate({room,player,targetPlayerId}){const target=room.players.find(p=>p.id===targetPlayerId);if(!target||target.id===player.id||target.health<=0)throw Error('请选择其他存活国家');},use({room,player,targetPlayerId}){player.gold+=2;room.players.find(p=>p.id===targetPlayerId).gold+=1;}},
  T02:{use({player}){player.pendingPolicy=(player.pendingPolicy||0)+5;}},
  T14:{use({player}){player.health=Math.min(player.maxHealth,player.health+3);player.gold+=2;}},
  T03:{validate({player,targetIndex}){const g=player.generals[targetIndex];if(!Number.isInteger(targetIndex)||!g||g.health<=0||g.health>=g.maxHealth)throw Error('请选择受伤且未濒死的己方武将');},use({player,targetIndex}){player.generals[targetIndex].health++;}}
};
module.exports=effects;
