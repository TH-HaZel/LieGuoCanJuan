'use strict';
// Only effects with confirmed rules are enabled here.
const effects={
  T02:{use({player}){player.pendingPolicy=(player.pendingPolicy||0)+5;}},
  T14:{use({player}){player.health=Math.min(player.maxHealth,player.health+3);player.gold+=2;}},
  T03:{validate({player,targetIndex}){const g=player.generals[targetIndex];if(!Number.isInteger(targetIndex)||!g||g.health<=0||g.health>=g.maxHealth)throw Error('请选择受伤且未濒死的己方武将');},use({player,targetIndex}){player.generals[targetIndex].health++;}}
};
module.exports=effects;
