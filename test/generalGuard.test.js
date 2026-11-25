'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {createPlayer}=require('../game/player'),{general}=require('../game/deck'),game=require('../game/game'),war=require('../game/war'),statuses=require('../game/statuses');
const selection={initial:'G01',deckGenerals:['G02','G03'],marketIds:[]};
function setup(){const a=createPlayer('甲',1,selection),b=createPlayer('乙',2,selection),room={phase:'waiting',players:[a,b]};game.startGame(room,a);return {room,a,b};}
function battle(room,a,b){war.startWar(room,a,{targetId:b.id,indices:[0]});war.respondWar(room,b,{choice:'fight'});war.respondWar(room,b,{choice:'general',indices:[0]});war.respondWar(room,a,{choice:'card',instanceId:null});war.respondWar(room,b,{choice:'card',instanceId:null});}
test('郭子仪防守失败时额外受伤且国家伤害减半向下取整',()=>{const {room,a,b}=setup();b.generals[0]=general('G06');a.generals[0].attack=9;battle(room,a,b);assert.equal(b.generals[0].health,2);assert.equal(b.health,33);});
test('郭子仪进攻失败时额外受伤并减少后续追击伤害',()=>{const {room,a,b}=setup();a.generals[0]=general('G06');b.generals[0].defense=12;battle(room,a,b);assert.equal(a.generals[0].health,2);war.respondWar(room,b,{choice:'pursue'});assert.equal(a.health,34);});
test('郭子仪战败后濒死或技能被封锁时不触发',()=>{for(const mode of ['critical','locked']){const {room,a,b}=setup();b.generals[0]=general('G06');a.generals[0].attack=9;if(mode==='critical')b.generals[0].health=1;else statuses.add(b.generals[0],{source:'N25',kind:'war_lock',value:-1});battle(room,a,b);assert.equal(b.health,30);assert.equal(b.generals[0].health,mode==='critical'?0:3);}});
test('破阵和戍卫同时触发时先增伤再减半',()=>{const {room,a,b}=setup();a.generals[0]=general('G07');a.generals[0].attack=7;b.generals[0]=general('G06');battle(room,a,b);assert.equal(b.health,33);});
