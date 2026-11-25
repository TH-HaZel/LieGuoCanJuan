'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {createPlayer}=require('../game/player'),{general}=require('../game/deck'),game=require('../game/game'),war=require('../game/war'),statuses=require('../game/statuses');
const selection={initial:'G01',deckGenerals:['G02','G03'],marketIds:[]};
function setup(){const a=createPlayer('甲',1,selection),b=createPlayer('乙',2,selection),room={phase:'waiting',players:[a,b]};game.startGame(room,a);return {room,a,b};}
function battle(room,a,b){war.startWar(room,a,{targetId:b.id,indices:[0]});war.respondWar(room,b,{choice:'fight'});war.respondWar(room,b,{choice:'general',indices:[0]});war.respondWar(room,a,{choice:'card',instanceId:null});war.respondWar(room,b,{choice:'card',instanceId:null});}
test('李嗣业进攻获胜时国家伤害增加部分向下取整',()=>{const {room,a,b}=setup();a.generals[0]=general('G07');a.generals[0].attack=5;b.generals[0].defense=2;battle(room,a,b);assert.equal(b.health,31);});
test('李嗣业濒死或技能封锁时不增加伤害',()=>{for(const mode of ['critical','lock']){const {room,a,b}=setup();a.generals[0]=general('G07');a.generals[0].attack=5;b.generals[0].defense=2;if(mode==='critical')a.generals[0].health=0;else statuses.add(a.generals[0],{source:'N25',kind:'war_lock',value:-1});battle(room,a,b);assert.equal(b.health,32);}});
test('防守李嗣业参加战斗后可增强追击',()=>{const {room,a,b}=setup();b.generals[0]=general('G07');b.generals[0].defense=8;battle(room,a,b);assert.equal(room.war.phase,'aftermath');war.respondWar(room,b,{choice:'pursue'});assert.equal(a.health,32);});
test('拒绝索赔后的减半追击先计算基础伤害，再增加破阵伤害',()=>{const {room,a,b}=setup();a.gold=5;b.generals[0]=general('G07');b.generals[0].defense=8;battle(room,a,b);war.respondWar(room,b,{choice:'claim',amount:2});war.respondWar(room,a,{choice:'reject'});assert.equal(a.health,34);});
