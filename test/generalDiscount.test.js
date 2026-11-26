'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {cardPrice}=require('../game/prices');
const {general}=require('../game/deck');
test('李世民在场时卡牌费用减少一，最低为零；濒死或离场后失效',()=>{
 const g=general('G(T15)'),p={generals:[g]};
 assert.equal(cardPrice(p,{cost:2}),1);assert.equal(cardPrice(p,{cost:0}),0);
 g.health=0;assert.equal(cardPrice(p,{cost:2}),2);
 p.generals=[];assert.equal(cardPrice(p,{cost:2}),2);
});
const {createPlayer}=require('../game/player'), game=require('../game/game'),war=require('../game/war'),rooms=require('../server/rooms');
const selection={initial:'G01',deckGenerals:['G02','G03'],marketIds:[]};
function setup(){const a=createPlayer('甲',1,selection),b=createPlayer('乙',2,selection),room={phase:'waiting',players:[a,b]};game.startGame(room,a);a.generals.push(general('G(T15)'));return {a,b,room};}
test('李世民使普通技能牌以减免费用支付',()=>{const {a,room}=setup();a.gold=0;a.hand=[{id:'T01',cost:1,instanceId:'x'}];game.playCard(room,a,{instanceId:'x'});assert.equal(a.gold,0);});
test('李世民使战争牌以减免费用支付',()=>{const {a,b,room}=setup();a.gold=1;a.hand=[{id:'N01',cost:2,instanceId:'x'}];war.startWar(room,a,{targetId:b.id,indices:[0]});war.respondWar(room,b,{choice:'fight'});war.respondWar(room,b,{choice:'general',indices:[0]});war.respondWar(room,a,{choice:'card',instanceId:'x'});war.respondWar(room,b,{choice:'card',instanceId:null});assert.equal(a.gold,0);});
test('李世民使中立争夺牌以减免费用支付',()=>{const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);const act=(p,type,body={})=>rooms.action(room.code,p.token,type,body);act(a,'start');a.generals.push(general('G(T15)'));room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];act(a,'end-turn');act(b,'end-turn');a.gold=1;a.hand=[{id:'N01',cost:2,instanceId:'x'}];for(const p of [a,b])act(p,'neutral-action',{choice:'main',resourceId:'r',index:0});for(const p of [a,b])act(p,'neutral-action',{choice:'pass'});for(const p of [a,b])act(p,'neutral-action',{choice:'support',index:null});act(a,'neutral-action',{choice:'card',instanceId:'x'});act(b,'neutral-action',{choice:'card',instanceId:null});assert.equal(a.gold,4);});


