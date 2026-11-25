'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPlayer}=require('../game/player'),{general}=require('../game/deck'),game=require('../game/game'),war=require('../game/war'),statuses=require('../game/statuses'),bonuses=require('../game/permanentBonuses');
const selection={initial:'G01',deckGenerals:['G02','G03'],marketIds:[]};
function setup(){const a=createPlayer('甲',1,selection),b=createPlayer('乙',2,selection),room={phase:'waiting',players:[a,b]};game.startGame(room,a);a.generals[0]=general('G04');return {room,a,b,g:a.generals[0]};}
function battle(room,a,b){war.startWar(room,a,{targetId:b.id,indices:[0]});war.respondWar(room,b,{choice:'fight'});war.respondWar(room,b,{choice:'general',indices:[0]});war.respondWar(room,a,{choice:'card',instanceId:null});war.respondWar(room,b,{choice:'card',instanceId:null});}
test('李勣普通战斗后存活且未濒死时永久攻防各加一',()=>{for(const defense of [1,2,4]){const {room,a,b,g}=setup();b.generals[0].defense=defense;battle(room,a,b);assert.equal(bonuses.total(g,'attack'),1);assert.equal(bonuses.total(g,'defense'),1);assert.equal(g.permanentBonuses[0].source,'G04');}});
test('李勣战后濒死或者被封锁时不成长',()=>{for(const mode of ['critical','locked']){const {room,a,b,g}=setup();if(mode==='critical'){g.health=1;b.generals[0].defense=4;}else statuses.add(g,{source:'N25',kind:'war_lock',value:-1});battle(room,a,b);assert.equal(bonuses.total(g,'attack'),0);assert.equal(bonuses.total(g,'defense'),0);}});
test('战前谈判取消战争时李勣不成长',()=>{const {room,a,b,g}=setup();b.gold=2;war.startWar(room,a,{targetId:b.id,indices:[0]});war.respondWar(room,b,{choice:'offer',amount:1});war.respondWar(room,a,{choice:'accept'});assert.equal(bonuses.total(g,'attack'),0);assert.equal(bonuses.total(g,'defense'),0);});
