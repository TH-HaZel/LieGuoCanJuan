'use strict';
const {drawCard,general,shuffle}=require('./deck');
const crypto=require('node:crypto');
const cardEffects=require('./cardEffects');
function refreshMarkets(room){for(const p of room.players)p.market=shuffle(p.marketPool.map(g=>g.id)).slice(0,2);}
function requireTurn(room,player){if(room.war)throw Error('战争尚未结束');if(room.phase!=='playing'||room.players[room.turnIndex].id!==player.id)throw new Error('只能在自己的回合操作');}
function receiveGeneral(player,g){if(player.hand.length<10){player.hand.push(g);return false;}const reset=general(g.id);reset.instanceId=g.instanceId;reset.deployAfterTurn=g.deployAfterTurn;player.discard.push(reset);return true;}
function beginTurn(room,player){player.turnsStarted++;player.gold+=player.pendingPolicy||0;player.pendingPolicy=0;player.purchased=false;player.gold+=Math.min(room.round,7);if(player.country==='唐朝')player.gold+=1;return drawCard(player);}
function startGame(room, player) {
  if(room.phase!=='waiting')throw new Error('游戏已经开始');
  if(room.players[0].id!==player.id)throw new Error('只有房主可以开始游戏');
  if(room.players.length<2)throw new Error('至少需要 2 名玩家');
  room.phase='playing';room.turnIndex=0;room.round=1;room.turnSerial=1;room.mainActionUsed=false;refreshMarkets(room);
  for(const p of room.players)for(let i=0;i<5;i++)drawCard(p);
  const result=beginTurn(room,room.players[0]);
  room.event=`游戏开始，${room.players[0].name}的回合：${result}。`;
}
function endTurn(room, player) {
  if(room.phase!=='playing')throw new Error('游戏尚未开始');
  if(room.war)throw new Error('战争尚未结束');
  if(room.players[room.turnIndex].id!==player.id)throw new Error('还没有轮到你');
  for(const g of [...player.generals,...player.hand])if(g.kind==='general'&&g.remaining>0&&g.cooldownStart!==room.turnSerial)g.remaining--;
  room.turnSerial++;room.mainActionUsed=false;
  do{room.turnIndex++;if(room.turnIndex>=room.players.length){room.turnIndex=0;room.round++;refreshMarkets(room);}}while(room.players[room.turnIndex].health<=0);
  const next=room.players[room.turnIndex],result=beginTurn(room,next);room.event=`${player.name}结束回合；${next.name}的回合：${result}。`;
}
function deploy(room,player,index){
  requireTurn(room,player);
  if(!Number.isInteger(index)||index<0||index>=player.hand.length)throw new Error('无效的手牌');
  const g=player.hand[index];if(g.kind!=='general')throw new Error('这不是武将牌');if(g.deployAfterTurn>player.turnsStarted)throw new Error('刚购买的武将需等到你的下一个回合才能部署');
  if(player.generals.length>=5)throw new Error('场上最多 5 名武将');if(player.gold<g.deployCost)throw new Error('黄金不足');
  player.gold-=g.deployCost;player.hand.splice(index,1);player.generals.push(g);room.event=`${player.name}部署了 ${g.name}。`;
}
function buy(room,player,id){
  requireTurn(room,player);
  if(player.purchased)throw new Error('每回合只能购买一名武将');
  if(!player.market.includes(id))throw new Error('该武将不是本轮候选');
  const index=player.marketPool.findIndex(g=>g.id===id);
  if(index<0)throw new Error('武将不可购买');
  const g=player.marketPool[index];if(g.source!=='store')throw Error('该武将不能购买');if(player.gold<g.cost)throw new Error('黄金不足');
  player.gold-=g.cost;player.marketPool.splice(index,1);player.market=player.market.filter(x=>x!==id);player.purchased=true;
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
function playCard(room,player,body){
  requireTurn(room,player);
  const index=player.hand.findIndex(c=>c.instanceId===body.instanceId);
  if(index<0||typeof body.instanceId!=='string')throw Error('手牌不存在');
  const card=player.hand[index],effect=cardEffects[card.id];
  if(!effect||card.kind==='general')throw Error('该牌效果尚未实现');
  if(player.gold<card.cost)throw Error('黄金不足');
  const context={room,player,targetIndex:body.targetIndex,targetPlayerId:body.targetPlayerId};
  if(effect.validate)effect.validate(context);
  player.gold-=card.cost;player.hand.splice(index,1);if(card.variety==='能力')(player.consumed||(player.consumed=[])).push(card);else player.discard.push(card);
  effect.use(context);room.lastPlayed=[{playerName:player.name,card:{id:card.id,name:card.name,country:card.country,variety:card.variety,cost:card.cost,rarity:card.rarity,description:card.description}}];room.event=`${player.name}使用了${card.name}。`;
}
module.exports={startGame,endTurn,deploy,buy,withdraw,playCard};
