'use strict';
const {drawCard}=require('./deck');
function beginTurn(room,player){player.gold+=Math.min(room.round,7)+1;return drawCard(player);}
function startGame(room, player) {
  if(room.phase!=='waiting')throw new Error('游戏已经开始');
  if(room.players[0].id!==player.id)throw new Error('只有房主可以开始游戏');
  if(room.players.length<2)throw new Error('至少需要 2 名玩家');
  room.phase='playing';room.turnIndex=0;room.round=1;
  for(const p of room.players)for(let i=0;i<5;i++)drawCard(p);
  const result=beginTurn(room,room.players[0]);
  room.event=`游戏开始，${room.players[0].name}的回合：${result}。`;
}
function endTurn(room, player) {
  if(room.phase!=='playing')throw new Error('游戏尚未开始');
  if(room.players[room.turnIndex].id!==player.id)throw new Error('还没有轮到你');
  room.turnIndex++;if(room.turnIndex>=room.players.length){room.turnIndex=0;room.round++;}
  const next=room.players[room.turnIndex],result=beginTurn(room,next);room.event=`${player.name}结束回合；${next.name}的回合：${result}。`;
}
function deploy(room,player,index){
  if(room.phase!=='playing'||room.players[room.turnIndex].id!==player.id)throw new Error('只能在自己的回合部署武将');
  if(!Number.isInteger(index)||index<0||index>=player.hand.length)throw new Error('无效的手牌');
  const g=player.hand[index];if(g.kind!=='general')throw new Error('这不是武将牌');
  if(player.generals.length>=5)throw new Error('场上最多 5 名武将');if(player.gold<g.deployCost)throw new Error('黄金不足');
  player.gold-=g.deployCost;player.hand.splice(index,1);player.generals.push(g);room.event=`${player.name}部署了 ${g.name}。`;
}
module.exports={startGame,endTurn,deploy};
