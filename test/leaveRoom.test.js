'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),rooms=require('../server/rooms');
const selection={initial:'G01',deckGenerals:['G02','G03'],marketIds:[]};

test('房主退出后移交房主、更新人数和座次，并撤销退出者身份',()=>{
 const {room,player:host}=rooms.createRoom('房主',selection),guest=rooms.joinRoom(room.code,'乙',selection);
 let snapshot,ended=false,leftMessage;
 rooms.subscribe(room,host,{write(data){leftMessage=JSON.parse(data.slice(6));},end(){ended=true;},on(){}});
 rooms.subscribe(room,guest,{write(data){snapshot=JSON.parse(data.slice(6));},on(){}});
 assert.deepEqual(rooms.leaveRoom(room.code,host.token),{left:true});
 assert.equal(ended,true);assert.deepEqual(leftMessage,{type:'room-left'});
 assert.equal(room.listeners.has(host.id),false);assert.equal(snapshot.hostId,guest.id);
 assert.equal(snapshot.players.length,1);assert.equal(snapshot.players[0].seat,1);
 assert.throws(()=>rooms.authenticate(room.code,host.token),/身份无效/);
 const item=rooms.listRooms().find(r=>r.code===room.code);assert.equal(item.hostName,'乙');assert.equal(item.players,1);
 rooms.joinRoom(room.code,'丙',selection);rooms.action(room.code,guest.token,'start');assert.equal(room.phase,'playing');
});

test('普通玩家退出不改变房主，最后一人退出后删除空房间',()=>{
 const {room,player:host}=rooms.createRoom('房主',selection),guest=rooms.joinRoom(room.code,'乙',selection);
 assert.throws(()=>rooms.leaveRoom(room.code,'invalid'),/身份无效/);
 assert.equal(room.players.length,2);rooms.leaveRoom(room.code,guest.token);
 assert.equal(room.hostId,host.id);assert.equal(room.players.length,1);
 rooms.leaveRoom(room.code,host.token);
 assert.throws(()=>rooms.joinRoom(room.code,'丙',selection),/房间不存在/);
});

test('开始后的对局不能通过退出等待房间接口删除玩家',()=>{
 const {room,player:host}=rooms.createRoom('房主',selection);rooms.joinRoom(room.code,'乙',selection);
 rooms.action(room.code,host.token,'start');assert.throws(()=>rooms.leaveRoom(room.code,host.token),/游戏已开始/);
 assert.equal(room.players.length,2);assert.equal(rooms.authenticate(room.code,host.token).player,host);
});
