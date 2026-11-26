'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),rooms=require('../server/rooms');
const selection={initial:'G01',deckGenerals:['G02','G03'],marketIds:[]};

test('等待大厅不发牌、不开始回合，只允许房主在至少两人时开始',()=>{
 const {room,player:host}=rooms.createRoom('房主',selection,{randomizeOrder:true});
 assert.throws(()=>rooms.action(room.code,host.token,'start'),/至少需要/);
 const guest=rooms.joinRoom(room.code,'来客',selection);
 let snapshot;rooms.subscribe(room,guest,{write(data){snapshot=JSON.parse(data.slice(6));},on(){}});
 assert.equal(snapshot.phase,'waiting');assert.equal(snapshot.players.length,2);
 assert.equal(snapshot.hostId,host.id);assert.equal(snapshot.currentPlayerId,null);
 assert.equal(host.hand.length,0);assert.equal(guest.hand.length,0);
 assert.throws(()=>rooms.action(room.code,guest.token,'start'),/只有房主/);
 assert.equal(room.phase,'waiting');
 rooms.action(room.code,host.token,'start');
 assert.equal(snapshot.phase,'playing');assert.equal(snapshot.hostId,host.id);
 assert.equal(snapshot.currentPlayerId,room.players[0].id);
 assert.throws(()=>rooms.joinRoom(room.code,'迟到',selection),/游戏已经开始/);
});

test('开局随机排列行动顺序与座次，房主身份不随顺序改变',()=>{
 const {room,player:host}=rooms.createRoom('房主',selection,{randomizeOrder:true});
 const b=rooms.joinRoom(room.code,'乙',selection),c=rooms.joinRoom(room.code,'丙',selection);
 assert.deepEqual(room.players.map(p=>p.id),[host.id,b.id,c.id]);
 const original=crypto.randomInt;
 try{crypto.randomInt=()=>0;rooms.action(room.code,host.token,'start');}finally{crypto.randomInt=original;}
 assert.deepEqual(room.players.map(p=>p.id),[b.id,c.id,host.id]);
 assert.deepEqual(room.players.map(p=>p.seat),[1,2,3]);
 assert.equal(room.hostId,host.id);assert.equal(room.players[room.turnIndex].id,b.id);
 assert.equal(b.turnsStarted,1);assert.equal(host.turnsStarted,0);
 rooms.action(room.code,b.token,'end-turn');
 assert.equal(room.players[room.turnIndex].id,c.id);
});
