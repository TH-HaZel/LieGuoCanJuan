'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPlayer}=require('../game/player'),{cards}=require('../game/deck'),game=require('../game/game'),war=require('../game/war');
function setup(){const selection={initial:'G01',deckGenerals:['G02','G03'],marketIds:[]},a=createPlayer('甲',1,selection),b=createPlayer('乙',2,selection),room={phase:'waiting',players:[a,b]};game.startGame(room,a);room.neutralPool.visible=[];a.gold=20;a.hand.push({...cards.find(c=>c.id==='T12'),instanceId:'ability'});game.playCard(room,a,{instanceId:'ability'});return {room,a,b};}
function fight(room,a,b,defense){b.defense=defense;war.startWar(room,a,{targetId:b.id,indices:[0]});war.respondWar(room,b,{choice:'fight'});war.respondWar(room,b,{choice:'hard'});war.respondWar(room,a,{choice:'card',instanceId:null});war.respondWar(room,b,{choice:'card',instanceId:null});}

test('以战养战在战败、平局后仍有效，连续获胜每次获得二金',()=>{
 for(const defense of [4,3,0]){
  const {room,a,b}=setup();assert.equal(a.gold,15);
  const before=a.gold;fight(room,a,b,defense);
  assert.equal(a.gold,before+(defense===0?2:0));assert.equal(a.warIncome,1);
  do{room.neutralPool.visible=[];game.endTurn(room,a);room.neutralPool.visible=[];game.endTurn(room,b);}while(a.generals[0].remaining>0);
  const nextGold=a.gold;fight(room,a,b,0);
  assert.equal(a.gold,nextGold+2);assert.equal(a.warIncome,1);
 }
});

test('以战养战在防守获胜时同样获得二金',()=>{
 const {room,a,b}=setup();game.endTurn(room,a);a.defense=5;
 const before=a.gold;fight(room,b,a,5);assert.equal(a.gold,before+2);
 assert.equal(a.warIncome,1);
});
