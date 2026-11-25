'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const rooms=require('../server/rooms');
const selection={initial:'G01',deckGenerals:['G02','G03'],marketIds:[]};
function act(room,p,type,body={}){return rooms.action(room.code,p.token,type,body);}
test('士气高涨与疲兵之策作用于中立主将和增援并消费',()=>{
 const st=require('../game/statuses'),{room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];a.generals[0].attack=1;b.generals[0].attack=5;
 const g={...structuredClone(a.generals[0]),name:'援军',attack:1};a.generals.push(g);st.add(a.generals[0],{source:'N22',kind:'attack',value:2,expires:3});st.add(g,{source:'N23',kind:'attack',value:-2,expires:3});
 act(room,a,'end-turn');act(room,b,'end-turn');const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);raw(a,{choice:'main',resourceId:'r',index:0});raw(b,{choice:'main',resourceId:'r',index:0});raw(a,{choice:'pass'});raw(b,{choice:'pass'});raw(a,{choice:'support',index:1});raw(b,{choice:'support',index:null});raw(a,{choice:'card',instanceId:null});raw(b,{choice:'card',instanceId:null});
 assert.equal(room.lastNeutralResults[0].result.scores.find(x=>x.playerId===a.id).power,3);assert.equal(a.generals[0].statuses.length,0);assert.equal(g.statuses.length,0);
});
test('雷雨交加减少中立武将正面攻击加成，经验不受影响',()=>{
 const st=require('../game/statuses'),{room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];a.generals[0].attack=1;a.generals[0].warExperience=1;b.gold=20;st.add(a.generals[0],{source:'N22',kind:'attack',value:2,expires:3});b.hand.push({id:'N13',instanceId:'rain',name:'雷雨交加',cost:6});
 act(room,a,'end-turn');act(room,b,'end-turn');const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);raw(a,{choice:'main',resourceId:'r',index:0,experience:1});raw(b,{choice:'main',resourceId:'r',index:0});raw(a,{choice:'pass'});raw(b,{choice:'pass'});raw(a,{choice:'support',index:null});raw(b,{choice:'support',index:null});raw(a,{choice:'card',instanceId:null});raw(b,{choice:'card',instanceId:'rain'});
 assert.equal(room.lastNeutralResults[0].result.scores.find(x=>x.playerId===a.id).power,3);
});
test('中立争夺撤退保留武将攻击状态',()=>{
 const st=require('../game/statuses'),{room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];st.add(a.generals[0],{source:'N22',kind:'attack',value:2,expires:3});
 act(room,a,'end-turn');act(room,b,'end-turn');const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);raw(a,{choice:'main',resourceId:'r',index:0});raw(b,{choice:'main',resourceId:'r',index:0});raw(a,{choice:'withdraw'});assert.equal(a.generals[0].statuses.filter(x=>x.source==='N22').length,1);
});
test('中立争夺忽略过期攻击状态',()=>{
 const st=require('../game/statuses'),{room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];st.add(a.generals[0],{source:'N22',kind:'attack',value:2,expires:1});
 act(room,a,'end-turn');act(room,b,'end-turn');act(room,a,'neutral-action',{choice:'main',resourceId:'r',index:0});act(room,b,'neutral-action',{choice:'skip'});assert.equal(room.lastNeutralResults[0].result.scores[0].power,3);
});
