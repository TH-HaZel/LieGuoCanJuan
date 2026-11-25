'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const rooms=require('../server/rooms'),statuses=require('../game/statuses');
const selection={initial:'G01',deckGenerals:['G02','G03'],marketIds:[]};
function setup(){const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);const act=(p,type,body={})=>rooms.action(room.code,p.token,type,body);act(a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];a.gold=30;b.gold=30;act(a,'end-turn');act(b,'end-turn');const raw=(p,body)=>act(p,'neutral-action',body);return {room,a,b,raw};}
function begin(a,b,raw,experience=0){raw(a,{choice:'main',resourceId:'r',index:0,experience});raw(b,{choice:'main',resourceId:'r',index:0});for(const p of [a,b])raw(p,{choice:'pass'});for(const p of [a,b])raw(p,{choice:'support',index:null});}
test('中立暗盖从谏如流可抵消同时揭示的禁军令',()=>{
 const {room,a,b,raw}=setup();a.hand.push({id:'T17',instanceId:'shield',name:'从谏如流',cost:5});b.hand.push({id:'N25',instanceId:'lock',name:'禁军令',cost:8});statuses.add(a.generals[0],{source:'N22',kind:'attack',value:2,expires:3});begin(a,b,raw);
 raw(a,{choice:'card',instanceId:'shield',targetId:a.id,targetIndex:0});raw(b,{choice:'card',instanceId:'lock',targetId:a.id,targetIndex:0});assert.equal(room.lastNeutralResults[0].result.scores.find(x=>x.playerId===a.id).power,5);assert.equal(a.generals[0].statuses.some(x=>x.source==='T17'||x.source==='N25'),false);
});
test('禁军令在中立争夺中限制正面技能增益，但不限制战功',()=>{
 const {room,a,b,raw}=setup();a.generals[0].warExperience=1;statuses.add(a.generals[0],{source:'N22',kind:'attack',value:2,expires:3});b.hand.push({id:'N25',instanceId:'lock',name:'禁军令',cost:8});begin(a,b,raw,1);
 raw(a,{choice:'card',instanceId:null});raw(b,{choice:'card',instanceId:'lock',targetId:a.id,targetIndex:0});assert.equal(room.lastNeutralResults[0].result.scores.find(x=>x.playerId===a.id).power,4);assert.equal(a.generals[0].warExperience,0);assert.equal(a.generals[0].statuses.some(x=>x.source==='N25'||x.source==='N22'),false);
});
test('未参战武将的免疫和封锁状态不消耗',()=>{
 const {a,b,raw}=setup();const extra={...structuredClone(a.generals[0]),name:'留守'};a.generals.push(extra);a.hand.push({id:'T17',instanceId:'shield',name:'从谏如流',cost:5});b.hand.push({id:'N25',instanceId:'lock',name:'禁军令',cost:8});begin(a,b,raw);
 raw(a,{choice:'card',instanceId:'shield',targetId:a.id,targetIndex:1});raw(b,{choice:'card',instanceId:'lock',targetId:a.id,targetIndex:1});assert.ok(extra.statuses.some(x=>x.source==='T17'));assert.ok(extra.statuses.some(x=>x.source==='N25'));
});
