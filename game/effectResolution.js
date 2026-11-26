'use strict';
const counterPolicy=require('./counterPolicy.json');
// 效果实例与卡牌来源分离，反制只取消匹配的单项效果。
const definitions={
 G05:{tags:['GENERAL_SKILL','SKILL_DISABLE'],counterable:true},
 N29:{tags:['CLEAR'],counterable:true},
 N30:{tags:['COUNTER'],counterTags:['CLEAR'],limit:1}
};
// 同一张牌的多个效果分开记录；尚无明确反制规则的效果默认不可反制。
const combatEffects={
 T05:[['distance','RESTRICTION']], T08:[['attack','BUFF']],
 N01:[['attack','BUFF'],['defeatDamage','DEBUFF']],
 N02:[['attack','BUFF'],['distance','RESTRICTION']],
 N05:[['attack','BUFF'],['winGold','ECONOMY']],
 N06:[['attack','BUFF'],['conditionalAttack','BUFF']],
 N07:[['attack','BUFF'],['distance','RESTRICTION']],
 N08:[['defense','BUFF']], N09:[['defense','BUFF'],['winGold','ECONOMY']],
 N10:[['defense','BUFF']], N11:[['distance','WEATHER']],
 N12:[['attackPenalty','WEATHER']], N13:[['attackReduction','WEATHER']],
 N14:[['defense','BUFF']],
 T03:[['effect','HEAL']], T06:[['effect','DISPEL']], T13:[['effect','BUFF']], T17:[['effect','STATE']],
 N22:[['effect','BUFF']], N23:[['effect','DEBUFF']], N25:[['effect','RESTRICTION']],
 N27:[['effect','DISPEL']], N28:[['effect','DISPEL']], N31:[['effect','DISPEL']], N32:[['effect','DISPEL']]
};
const actionEffects={
 N04:[['effect','DEBUFF']],T18:[['effect','ECONOMY']],T17:[['effect','STATE']],
 'T15(1)':[['defenseIncome','STATE'],['drawIncome','STATE']],T11:[['effect','BUFF']],N31:[['effect','DISPEL']],N32:[['effect','DISPEL']],
 N03:[['health','COST'],['goldIncome','STATE'],['drawIncome','STATE']],T07:[['effect','STATE']],T09:[['effect','STATE']],T10:[['effect','ECONOMY']],
 T04:[['deploy','DEPLOY'],['cooldown','STATE']],N25:[['effect','RESTRICTION']],N19:[['effect','STATE']],
 T06:[['effect','DISPEL']],N28:[['effect','DISPEL']],N27:[['effect','DISPEL']],N18:[['reveal','INFORMATION'],['emptyGold','ECONOMY']],
 T15:[['general','DECK'],['decree','DECK']],N22:[['effect','BUFF']],N23:[['effect','DEBUFF']],T13:[['effect','STATE']],
 T12:[['effect','STATE']],T01:[['draw','DECK'],['discard','DECK']],N21:[['effect','STATE']],N24:[['effect','DEBUFF']],
 N26:[['effect','DEBUFF']],N15:[['effect','ECONOMY']],T02:[['effect','ECONOMY']],T03:[['effect','HEAL']],
 N16:[['health','COST'],['gold','ECONOMY']],N17:[['allGold','ECONOMY'],['bonusGold','ECONOMY']],
 N20:[['allGold','ECONOMY'],['bonusGold','ECONOMY']],T16:[['ownGold','ECONOMY'],['targetGold','ECONOMY']],
 T14:[['heal','HEAL'],['gold','ECONOMY']]
};
const generalEffects={
 G02:[['winAttack','BUFF'],['lossAttack','DEBUFF'],['lossHealth','DEBUFF']],
 G03:[['winDefense','BUFF'],['lossAttack','DEBUFF'],['lossDefense','DEBUFF']],
 G04:[['attackGrowth','BUFF'],['defenseGrowth','BUFF']],
 G06:[['lossHealth','DEBUFF'],['damageReduction','RESTRICTION']],
 G07:[['damageBoost','BUFF']],G08:[['defenseBoost','BUFF']]
};
// 未明确配置的效果沿用默认规则；配置不创建新的响应时机。
function counterable(sourceId,key,fallback=false){
 const setting=counterPolicy.effects?.[sourceId]?.[key];
 if(setting===undefined)return fallback;
 if(typeof setting!=='boolean')throw Error(`反制配置无效：${sourceId}.${key}`);
 return setting;
}
function createGeneral(g,ownerId){
 return (generalEffects[g?.id]||[]).map(([key,tag])=>({id:`${ownerId}:${g.instanceId||g.id}:${key}`,sourceId:g.id,ownerId,key,tags:['GENERAL_SKILL',tag],counterable:counterable(g.id,key),counterTags:[],limit:0,cancelled:false}));
}
function createAction(card,ownerId){
 return (actionEffects[card?.id]||[]).map(([key,tag])=>({id:`${ownerId}:${card.instanceId||card.id}:${key}`,sourceId:card.id,ownerId,key,tags:['CARD_SKILL',tag],counterable:counterable(card.id,key),counterTags:[],limit:0,cancelled:false}));
}
function createAll(card,ownerId){
 if(!card)return [];
 if(definitions[card.id]){const effect=create(card,ownerId);return effect?[effect]:[];}
 return (combatEffects[card.id]||[]).map(([key,tag])=>({id:`${ownerId}:${card.id}:${key}`,sourceId:card.id,ownerId,key,tags:['CARD_SKILL',tag],counterable:counterable(card.id,key),counterTags:[],limit:0,cancelled:false}));
}
function enabled(effects,ownerId,sourceId,key){return effects.some(e=>e.ownerId===ownerId&&e.sourceId===sourceId&&e.key===key&&!e.cancelled);}
function create(card,ownerId,targetId=null,instanceId=null){
 const def=definitions[card?.id];
 return def?{id:instanceId||`${ownerId}:${card.id}`,sourceId:card.id,ownerId,targetId,tags:[...def.tags],counterable:counterable(card.id,'effect',!!def.counterable),timing:def.timing||'beforeBattle',counterTags:[...(def.counterTags||[])],limit:def.limit||0,cancelled:false}:null;
}
function counterTargets(effects,action){
 return effects.filter(target=>target!==action&&target.ownerId!==action.ownerId&&
   !(action.sideId&&target.sideId&&action.sideId===target.sideId)&&!target.cancelled&&!target.settled&&target.counterable&&
   (!target.tags.includes('COUNTER')||action.canCounterCounters===true)&&
   target.tags.some(tag=>(action.counterTags||[]).includes(tag)));
}
function counter(effects){
 for(const action of effects.filter(e=>e.tags.includes('COUNTER')&&!e.cancelled&&!e.counterResolved)){
  const targets=counterTargets(effects,action);
  const selected=action.targetId?targets.filter(e=>e.id===action.targetId):targets.length===1?targets:[];
  action.requiresChoice=!action.targetId&&targets.length>1;
  action.legalTargetIds=targets.map(e=>e.id);
  for(const target of selected.slice(0,action.limit||0))target.cancelled=true;
  if(action.requiresChoice)break;
  action.counterResolved=true;
 }
 return effects;
}
module.exports={definitions,combatEffects,actionEffects,generalEffects,counterPolicy,counterable,create,createAll,createAction,createGeneral,enabled,counterTargets,counter};
