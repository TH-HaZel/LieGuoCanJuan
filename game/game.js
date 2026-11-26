'use strict';
const {drawCard,general,shuffle}=require('./deck');
const crypto=require('node:crypto');
const {deployPrice,buyPrice,cardPrice}=require('./prices');
const cardEffects=require('./cardEffects');
const effectResolution=require('./effectResolution');
const permanentBonuses=require('./permanentBonuses');
const neutral=require('./neutral');
const neutralRound=require('./neutralRound');
function refreshMarkets(room){for(const p of room.players)p.market=shuffle(p.marketPool.map(g=>g.id)).slice(0,2);}
function requireTurn(room,player){if(room.pendingAlliance)throw Error('同盟表决进行中');if(room.neutralRound)throw Error('中立资源争夺进行中');if(room.pendingChoice)throw Error('请先完成弃牌');if(room.war)throw Error('战争尚未结束');if(room.phase!=='playing'||room.players[room.turnIndex].id!==player.id)throw new Error('只能在自己的回合操作');}
function receiveGeneral(player,g){if(player.hand.length<10){player.hand.push(g);return false;}const reset=general(g.id);reset.instanceId=g.instanceId;reset.deployAfterTurn=g.deployAfterTurn;player.discard.push(reset);return true;}
function startRound(room){for(const p of room.players){if(p.health<=0)continue;for(const effect of p.recoverySchedule||[]){const offset=room.round-effect.start;if(offset>=0&&offset<3)p.health=Math.min(p.maxHealth,p.health+[3,2,1][offset]);}p.recoverySchedule=(p.recoverySchedule||[]).filter(effect=>room.round<effect.start+2);}}
function beginTurn(room,player){player.turnsStarted++;player.gold+=player.pendingPolicy||0;player.pendingPolicy=0;player.purchased=false;const penalties=player.incomePenalties||[];player.gold+=Math.max(0,Math.min(room.round,7)-penalties.filter(p=>p.round===room.round).reduce((sum,p)=>sum+p.amount,0));player.incomePenalties=penalties.filter(p=>p.round>room.round);if(player.country==='唐朝')player.gold+=1;const result=drawCard(player);for(let i=0;i<(player.goldenAge||0)+(player.goldenAgeDefense||0);i++)player.health=Math.min(player.maxHealth,player.health+2);for(let i=0;i<(player.goldenAge||0)+(player.goldenAgeDraw||0);i++)drawCard(player);for(let i=0;i<(player.taxEffects||0)+(player.taxGoldEffects||0);i++)player.gold++;for(let i=0;i<(player.taxEffects||0)+(player.taxDrawEffects||0);i++)drawCard(player);return result;}
function startGame(room, player) {
  if(room.phase!=='waiting')throw new Error('游戏已经开始');
  if(room.players[0].id!==player.id)throw new Error('只有房主可以开始游戏');
  if(room.players.length<2)throw new Error('至少需要 2 名玩家');
  room.alliances=[];room.pendingAlliance=null;room.phase='playing';room.turnIndex=0;room.round=1;room.turnSerial=1;room.mainActionUsed=false;room.neutralPool=neutral.createNeutralPool();for(let i=0;i<neutral.config.revealPerRound;i++)neutral.revealNeutral(room.neutralPool);refreshMarkets(room);
  for(const p of room.players)for(let i=0;i<5;i++)drawCard(p);
  const result=beginTurn(room,room.players[0]);
  room.event=`游戏开始，${room.players[0].name}的回合：${result}。`;
}
function endTurn(room, player) {
  if(room.pendingAlliance)throw Error('同盟表决进行中');
  if(room.neutralRound)throw Error('中立资源争夺进行中');
  if(room.phase!=='playing')throw new Error('游戏尚未开始');
  if(room.war)throw new Error('战争尚未结束');
  if(room.pendingChoice)throw new Error('请先完成弃牌');
  if(room.players[room.turnIndex].id!==player.id)throw new Error('还没有轮到你');
  for(const g of [...player.generals,...player.hand])if(g.kind==='general'&&g.remaining>0&&g.cooldownStart!==room.turnSerial)g.remaining--;
  room.turnSerial++;room.mainActionUsed=false;
  let next=room.turnIndex+1;while(next<room.players.length&&room.players[next].health<=0)next++;
  if(next<room.players.length){room.turnIndex=next;const p=room.players[next],result=beginTurn(room,p);room.event=`${player.name}结束回合；${p.name}的回合：${result}。`;return;}
  if(room.neutralPool.visible.length){neutralRound.begin(room);room.event='本轮玩家回合结束，进入中立资源争夺。';return;}
  beginNextRound(room);

}
function beginNextRound(room){
  room.neutralRound=null;room.round++;startRound(room);refreshMarkets(room);for(let i=0;i<neutral.config.revealPerRound;i++)neutral.revealNeutral(room.neutralPool);
  room.turnIndex=room.players.findIndex(p=>p.health>0);
  if(room.turnIndex<0)throw Error('没有存活国家');
  const p=room.players[room.turnIndex],result=beginTurn(room,p);room.event=`进入第 ${room.round} 轮；${p.name}的回合：${result}。`;
}
function neutralAction(room,player,body){
  if(room.phase!=='playing'||!room.neutralRound||room.war||room.pendingChoice)throw Error('当前不能争夺中立资源');
  if(neutralRound.submit(room,player,body)){const logs=room.neutralRound.logs.join('；'),choices=room.neutralRound.bonusChoices;room.lastNeutralResults=room.neutralRound.results;if(choices.length){room.neutralRound=null;room.pendingBonuses=choices;room.pendingChoice=choices[0];room.neutralNextRound=true;room.event=(logs?logs+'。':'')+'请选择军功簿的永久增益。';}else{beginNextRound(room);if(logs)room.event=logs+'。'+room.event;}}
}
function deploy(room,player,index){
  requireTurn(room,player);
  if(!Number.isInteger(index)||index<0||index>=player.hand.length)throw new Error('无效的手牌');
  const g=player.hand[index];if(g.kind!=='general')throw new Error('这不是武将牌');if(g.deployAfterTurn>player.turnsStarted)throw new Error('刚购买的武将需等到你的下一个回合才能部署');
  if(player.generals.length>=5)throw new Error('场上最多 5 名武将');const price=deployPrice(player,g);if(player.gold<price)throw new Error('黄金不足');
  player.gold-=price;player.hand.splice(index,1);player.generals.push(g);room.event=`${player.name}部署了 ${g.name}。`;
}
function buy(room,player,id){
  requireTurn(room,player);
  if(player.purchased)throw new Error('每回合只能购买一名武将');
  if(!player.market.includes(id))throw new Error('该武将不是本轮候选');
  const index=player.marketPool.findIndex(g=>g.id===id);
  if(index<0)throw new Error('武将不可购买');
  const g=player.marketPool[index];if(g.source!=='store')throw Error('该武将不能购买');const price=buyPrice(room,player,g);if(player.gold<price)throw new Error('黄金不足');
  player.gold-=price;player.buyDiscountRound=null;player.marketPool.splice(index,1);player.market=player.market.filter(x=>x!==id);player.purchased=true;
  const overflow=receiveGeneral(player,{...g,instanceId:crypto.randomUUID(),deployAfterTurn:player.turnsStarted+1});
  room.event=`${player.name}购买了武将。`;
  return overflow?'手牌已满，武将重置后进入弃牌堆':'购买成功，武将进入手牌';
}
function withdraw(room,player,index){
  requireTurn(room,player);
  if(!Number.isInteger(index)||index<0||index>=player.generals.length)throw new Error('无效的武将');
  if(player.generals[index].remaining>0)throw Error('冷却中的武将不能撤回');
  const [g]=player.generals.splice(index,1),overflow=receiveGeneral(player,g);
  room.event=`${player.name}撤回了${g.name}。`;
  return overflow?'手牌已满，武将重置后进入弃牌堆':'撤回成功，再次部署需要支付费用';
}
function useExperienceCooldown(room,player,index){
  requireTurn(room,player);
  const g=Number.isInteger(index)&&index>=0?player.generals[index]:null;
  if(!g)throw Error('请选择己方已部署武将');
  if(!Number.isSafeInteger(g.warExperience)||g.warExperience<1)throw Error('战争经验不足');
  if(!Number.isSafeInteger(g.remaining)||g.remaining<=0)throw Error('该武将当前未冷却');
  g.warExperience--;g.remaining=0;
  room.event=`${player.name}消耗 1 点战争经验，清除${g.name}的冷却。`;
}
function playCard(room,player,body){
  requireTurn(room,player);
  const index=player.hand.findIndex(c=>c.instanceId===body.instanceId);
  if(index<0||typeof body.instanceId!=='string')throw Error('手牌不存在');
  const card=player.hand[index],effect=cardEffects[card.id];
  if(!effect||card.kind==='general')throw Error('该牌效果尚未实现');
  if(player.gold<cardPrice(player,card))throw Error('黄金不足');
  const actionEffects=effectResolution.createAction(card,player.id);if(!actionEffects.length)throw Error('该牌缺少效果定义');
  const context={room,player,isEffectEnabled:key=>effectResolution.enabled(actionEffects,player.id,card.id,key),targetIndex:body.targetIndex,targetPlayerId:body.targetPlayerId,effectId:body.effectId,targetInstanceId:body.targetInstanceId,card};
  if(effect.validate)effect.validate(context);
  player.gold-=cardPrice(player,card);player.hand.splice(index,1);if(card.variety==='能力')(player.consumed||(player.consumed=[])).push(card);else player.discard.push(card);
  if(actionEffects.some(e=>!e.cancelled))effect.use(context);room.lastPlayed=[{playerName:player.name,card:{id:card.id,name:card.name,country:card.country,variety:card.variety,cost:card.cost,rarity:card.rarity,description:card.description}}];room.event=`${player.name}使用了${card.name}。`;
}
function discardChoice(room,player,instanceId){
  if(room.phase!=='playing'||room.pendingChoice?.type!=='discard'||room.pendingChoice.playerId!==player.id||room.players[room.turnIndex].id!==player.id)throw Error('当前无需你弃牌');
  if(typeof instanceId!=='string')throw Error('请选择一张手牌');
  const index=player.hand.findIndex(c=>c.instanceId===instanceId);if(index<0)throw Error('手牌不存在');
  const [card]=player.hand.splice(index,1);
  if(card.kind==='general'){const reset=general(card.id);reset.instanceId=card.instanceId;reset.deployAfterTurn=card.deployAfterTurn;player.discard.push(reset);}else player.discard.push(card);
  room.pendingChoice=null;room.event=`${player.name}完成了弃牌。`;
}
function choosePermanentBonus(room,player,attribute){const choice=room.pendingChoice;if(choice?.type!=='permanent-bonus'||choice.playerId!==player.id||!['attack','defense'].includes(attribute))throw Error('当前无法选择永久增益');if(!player.generals.includes(choice.general))throw Error('武将不存在');permanentBonuses.add(choice.general,attribute,'T11');room.pendingBonuses.shift();room.pendingChoice=room.pendingBonuses[0]||null;if(!room.pendingChoice)room.pendingBonuses=null;room.event=player.name+'的'+choice.general.name+'获得永久'+(attribute==='attack'?'攻击':'防御')+' +1。';if(!room.pendingChoice&&room.neutralNextRound){room.neutralNextRound=false;beginNextRound(room);}}
function chooseTribute(room,player,choice){const t=room.tribute;if(room.pendingChoice?.type!=='tribute'||room.pendingChoice.playerId!==player.id||!t||!['gold','health'].includes(choice))throw Error('当前无法选择');if(choice==='health'&&player.health<=2)throw Error('生命不高于 2，不能选择失去生命');const owner=room.players.find(p=>p.id===t.ownerId);if(!owner||owner.health<=0)throw Error('使用者不可用');if(choice==='gold'){player.gold-=2;owner.gold+=2;}else{player.health-=2;owner.health=Math.min(owner.maxHealth,owner.health+2);}t.targets.shift();room.pendingChoice=t.targets.length?{type:'tribute',playerId:t.targets[0]}:null;if(!room.pendingChoice)room.tribute=null;room.event=player.name+(choice==='gold'?'失去 2 金':'失去 2 生命')+'。';}
module.exports={useExperienceCooldown,neutralAction,chooseTribute,choosePermanentBonus,startGame,endTurn,deploy,buy,withdraw,playCard,discardChoice};
