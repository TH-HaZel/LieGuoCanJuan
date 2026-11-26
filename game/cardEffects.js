'use strict';
// Only effects with confirmed rules are enabled here.
const {drawCard,general,cards,shuffle}=require('./deck');
const {randomUUID,randomInt}=require('node:crypto');
const statuses=require('./statuses');
const {deployPrice,cardPrice}=require('./prices');
const permanentBonuses=require('./permanentBonuses');
function cleanse(){return {
  validate({room,player,targetIndex,effectId}){
    if(targetIndex===null){if(!(player.incomePenalties||[]).some(e=>e.id===effectId&&e.round>=room.round))throw Error('请选择己方国家的一项有效负面状态');return;}
    const g=player.generals[targetIndex];if(!Number.isInteger(targetIndex)||!g||!statuses.active(g,room.round).some(e=>e.id===effectId&&e.removable&&e.polarity==='negative'))throw Error('请选择己方武将的一项有效负面状态');
  },
  use({room,player,targetIndex,effectId}){if(targetIndex===null)player.incomePenalties=player.incomePenalties.filter(e=>e.id!==effectId);else statuses.remove(player.generals[targetIndex],effectId,room.round,'negative');}
};}
function enabled(context,key){return !context.isEffectEnabled||context.isEffectEnabled(key);}
const effects={
  N04:{validate({room,player,targetPlayerId,targetIndex}){const p=room.players.find(x=>x.id===targetPlayerId);if(!p||p===player||p.health<=0||!Number.isInteger(targetIndex)||!p.generals[targetIndex])throw Error('请选择敌方已部署武将');},use({room,targetPlayerId,targetIndex}){statuses.add(room.players.find(p=>p.id===targetPlayerId).generals[targetIndex],{source:'N04',kind:'defense',value:-1});}},
  T18:{use({room,player}){const targets=room.players.filter(p=>p!==player&&p.health>0).map(p=>p.id);if(targets.length){room.tribute={ownerId:player.id,targets};room.pendingChoice={type:'tribute',playerId:targets[0]};}}},
  T17:{validate({player,targetIndex}){if(!Number.isInteger(targetIndex)||!player.generals[targetIndex])throw Error('请选择己方已部署武将');},use({room,player,targetIndex}){statuses.add(player.generals[targetIndex],{source:'T17',kind:'war_immunity',value:1,expires:room.round+2});}},
  'T15(1)':{use(context){const {player}=context;if(enabled(context,'defenseIncome'))player.goldenAgeDefense=(player.goldenAgeDefense||0)+1;if(enabled(context,'drawIncome'))player.goldenAgeDraw=(player.goldenAgeDraw||0)+1;}},
  T11:{validate({player,targetIndex}){if(!Number.isInteger(targetIndex)||!player.generals[targetIndex])throw Error('请选择己方已部署武将');},use({player,targetIndex}){statuses.add(player.generals[targetIndex],{source:'T11',kind:'permanent_after_war',value:1});}},
  N31:{validate({room,player,targetPlayerId,targetIndex,effectId}){const p=room.players.find(x=>x.id===targetPlayerId),g=p?.generals[targetIndex];if(!p||p===player||p.health<=0||!Number.isInteger(targetIndex)||!g||!(g.permanentBonuses||[]).some(b=>b.id===effectId))throw Error('请选择敌方武将的一项永久增益');},use({room,targetPlayerId,targetIndex,effectId}){permanentBonuses.remove(room.players.find(p=>p.id===targetPlayerId).generals[targetIndex],effectId);}},
  N32:{validate({room,player,targetPlayerId,targetIndex}){const p=room.players.find(x=>x.id===targetPlayerId);if(!p||p===player||p.health<=0||!Number.isInteger(targetIndex)||!p.generals[targetIndex])throw Error('请选择敌方已部署武将');},use({room,targetPlayerId,targetIndex}){const g=room.players.find(p=>p.id===targetPlayerId).generals[targetIndex];for(const effect of statuses.active(g,room.round))if(effect.removable&&effect.polarity==='positive')statuses.remove(g,effect.id,room.round);}},
  N03:{validate({player}){if(player.health<=15)throw Error('国家生命必须大于 15');},use(context){const {player}=context;if(enabled(context,'health'))player.health-=15;if(enabled(context,'goldIncome'))player.taxGoldEffects=(player.taxGoldEffects||0)+1;if(enabled(context,'drawIncome'))player.taxDrawEffects=(player.taxDrawEffects||0)+1;}},
  T07:{validate({player}){if(player.deployDiscountTurn===player.turnsStarted+1)throw Error('府兵制效果不可叠加');},use({player}){player.deployDiscountTurn=player.turnsStarted+1;}},
  T09:{validate({room,player}){if(player.buyDiscountRound===room.round)throw Error('河西转运效果不可叠加');},use({room,player}){player.buyDiscountRound=room.round;}},
  T10:{validate({room,targetPlayerId}){const p=room.players.find(p=>p.id===targetPlayerId);if(!p||p.health<=0)throw Error('请选择一名存活玩家');},use({room,targetPlayerId}){room.players.find(p=>p.id===targetPlayerId).gold+=2;}},
  T04:{validate({player,targetInstanceId,card}){const g=player.hand.find(c=>c.instanceId===targetInstanceId);if(!g||g.kind!=='general'||!(g.remaining>0))throw Error('请选择手牌中冷却的己方武将');if(g.deployAfterTurn>player.turnsStarted)throw Error('刚购买的武将需等到下个回合');if(player.generals.length>=5)throw Error('场上最多 5 名武将');if(player.gold<cardPrice(player,card)+deployPrice(player,g))throw Error('黄金不足以支付牌费和部署费');},use(context){const {player,targetInstanceId}=context,i=player.hand.findIndex(c=>c.instanceId===targetInstanceId),g=player.hand[i];if(enabled(context,'deploy')){player.gold-=deployPrice(player,g);player.hand.splice(i,1);player.generals.push(g);}if(enabled(context,'cooldown'))g.remaining=0;}},
  N25:{validate({room,player,targetPlayerId,targetIndex}){const p=room.players.find(x=>x.id===targetPlayerId);if(!p||p===player||p.health<=0||!Number.isInteger(targetIndex)||!p.generals[targetIndex])throw Error('请选择敌方已部署武将');},use({room,targetPlayerId,targetIndex}){statuses.add(room.players.find(p=>p.id===targetPlayerId).generals[targetIndex],{source:'N25',kind:'war_lock',value:-1});}},
  N19:{validate({player,targetIndex}){if(!Number.isInteger(targetIndex)||!player.generals[targetIndex])throw Error('请选择己方已部署武将');},use({room,player,targetIndex}){statuses.add(player.generals[targetIndex],{source:'N19',kind:'cooldown_after_battle',value:1,expires:room.round+2});}},
  T06:cleanse(),
  N28:cleanse(),
  N27:{validate({room,player,targetPlayerId,targetIndex,effectId}){const p=room.players.find(x=>x.id===targetPlayerId),g=p?.generals[targetIndex];if(!p||p===player||p.health<=0||!Number.isInteger(targetIndex)||!g||!statuses.active(g,room.round).some(s=>s.id===effectId&&s.removable&&s.polarity==='positive'))throw Error('请选择敌方武将的一项有效临时增益');},use({room,targetPlayerId,targetIndex,effectId}){statuses.remove(room.players.find(p=>p.id===targetPlayerId).generals[targetIndex],effectId,room.round);}},
  N18:{validate({room,player,targetPlayerId}){const p=room.players.find(x=>x.id===targetPlayerId);if(!p||p===player||p.health<=0)throw Error('请选择其他存活国家');},use(context){const {room,player,targetPlayerId}=context,p=room.players.find(x=>x.id===targetPlayerId);if(!p.hand.length){if(enabled(context,'emptyGold')){player.gold+=2;player.scoutReport={id:randomUUID(),message:`${p.name}没有手牌，获得 2 金。`};}return;}if(enabled(context,'reveal')){const c=p.hand[randomInt(p.hand.length)];player.scoutReport={id:randomUUID(),message:`${p.name}的一张手牌：${c.name}`,card:{id:c.id,name:c.name,kind:c.kind,description:c.description}};}}},
  T15:{validate({player}){if(player.health<20)throw Error('国家生命低于 20，不能使用玄武门之变');},use(context){const {player}=context,added=[];if(enabled(context,'general'))added.push({...general('G(T15)'),instanceId:randomUUID()});if(enabled(context,'decree'))added.push({...structuredClone(cards.find(c=>c.id==='T15(1)')),instanceId:randomUUID()});if(added.length){player.deck.push(...added);shuffle(player.deck);}}},
  N22:{validate({player,targetIndex}){if(!Number.isInteger(targetIndex)||!player.generals[targetIndex])throw Error('请选择己方已部署武将');},use({room,player,targetIndex}){const g=player.generals[targetIndex];statuses.add(g,{source:'N22',kind:'attack',value:2,expires:room.round+2});}},
  N23:{validate({room,player,targetPlayerId,targetIndex}){const p=room.players.find(p=>p.id===targetPlayerId);if(!p||p.id===player.id||p.health<=0||!Number.isInteger(targetIndex)||!p.generals[targetIndex])throw Error('请选择敌方已部署武将');},use({room,targetPlayerId,targetIndex}){const g=room.players.find(p=>p.id===targetPlayerId).generals[targetIndex];statuses.add(g,{source:'N23',kind:'attack',value:-2,expires:room.round+2});}},
  T13:{validate({player,targetIndex}){if(!Number.isInteger(targetIndex)||!player.generals[targetIndex])throw Error('请选择己方已部署武将');},use({player,targetIndex}){const g=player.generals[targetIndex];statuses.add(g,{source:'T13',kind:'heal_on_win',value:1});}},
  T12:{use({player}){player.warIncome=(player.warIncome||0)+1;}},
  T01:{use(context){const {room,player}=context;if(enabled(context,'draw')){drawCard(player);drawCard(player);}if(enabled(context,'discard')&&player.hand.length)room.pendingChoice={type:'discard',playerId:player.id};}},
  N21:{use({room,player}){(player.recoverySchedule||(player.recoverySchedule=[])).push({start:room.round+1});}},
  N24:{validate({room,player,targetPlayerId}){const target=room.players.find(p=>p.id===targetPlayerId);if(!target||target.id===player.id||target.health<=0)throw Error('请选择其他存活国家');},use({room,targetPlayerId}){const p=room.players.find(p=>p.id===targetPlayerId);(p.incomePenalties||(p.incomePenalties=[])).push({id:randomUUID(),source:'N24',round:room.round+1,amount:2});}},
  N26:{use({room,player}){for(const p of room.players)if(p.id!==player.id&&p.health>0)(p.incomePenalties||(p.incomePenalties=[])).push({id:randomUUID(),source:'N26',round:room.round+1,amount:1});}},
  N15:{use({player}){player.gold+=5;}},
  N16:{validate({player}){if(player.health<=1)throw Error('国家生命必须大于 1');},use(context){const {player}=context;if(enabled(context,'health'))player.health--;if(enabled(context,'gold'))player.gold+=6;}},
  N17:{use(context){const {room,player}=context;if(enabled(context,'allGold'))for(const p of room.players)if(p.health>0)p.gold+=2;if(enabled(context,'bonusGold'))player.gold+=2;}},
  N20:{use(context){const {room,player}=context;if(enabled(context,'allGold'))for(const p of room.players)if(p.health>0)p.gold+=3;if(enabled(context,'bonusGold'))player.gold+=2;}},
  T16:{validate({room,player,targetPlayerId}){const target=room.players.find(p=>p.id===targetPlayerId);if(!target||target.id===player.id||target.health<=0)throw Error('请选择其他存活国家');},use(context){const {room,player,targetPlayerId}=context;if(enabled(context,'ownGold'))player.gold+=2;if(enabled(context,'targetGold'))room.players.find(p=>p.id===targetPlayerId).gold+=1;}},
  T02:{use({player}){player.pendingPolicy=(player.pendingPolicy||0)+5;}},
  T14:{use(context){const {player}=context;if(enabled(context,'heal'))player.health=Math.min(player.maxHealth,player.health+3);if(enabled(context,'gold'))player.gold+=2;}},
  T03:{validate({player,targetIndex}){const g=player.generals[targetIndex];if(!Number.isInteger(targetIndex)||!g||g.health<=0||g.health>=g.maxHealth)throw Error('请选择受伤且未濒死的己方武将');},use({player,targetIndex}){player.generals[targetIndex].health++;}}
};
// 单效果牌也必须经过效果开关；直接使用和经游戏入口使用保持一致。
const {actionEffects}=require('./effectResolution');
for(const [id,effect] of Object.entries(effects)){
 const keys=actionEffects[id];
 if(!keys||!keys.length)throw Error(`${id}缺少效果定义`);
 if(keys.length===1){const apply=effect.use,key=keys[0][0];effect.use=context=>{if(enabled(context,key))return apply(context);};}
}
module.exports=effects;
