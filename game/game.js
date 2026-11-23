'use strict';
function startGame(room, player) {
  if (room.phase !== 'waiting') throw new Error('游戏已经开始');
  if (room.players[0].id !== player.id) throw new Error('只有房主可以开始游戏');
  if (room.players.length < 2) throw new Error('至少需要 2 名玩家');
  room.phase='playing'; room.turnIndex=0; room.round=1;
  // 暂定：第一位玩家首次回合开始时也领取 2 金。
  room.players[0].gold+=2;
  room.event=`游戏开始，${room.players[0].name}的回合开始，获得 2 黄金。`;
}
function endTurn(room, player) {
  if (room.phase!=='playing') throw new Error('游戏尚未开始');
  if (room.players[room.turnIndex].id!==player.id) throw new Error('还没有轮到你');
  room.turnIndex++;
  if (room.turnIndex>=room.players.length) {room.turnIndex=0;room.round++;}
  const next=room.players[room.turnIndex]; next.gold+=2;
  room.event=`${player.name}结束回合；${next.name}的回合开始，获得 2 黄金。`;
}
module.exports={startGame,endTurn};
