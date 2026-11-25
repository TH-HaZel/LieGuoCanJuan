'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const rooms=require('../server/rooms'),statuses=require('../game/statuses');
const selection={initial:'G01',deckGenerals:['G02','G03'],marketIds:[]};
function setup(id,cost){const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);const act=(p,type,body={})=>rooms.action(room.code,p.token,type,body);act(a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];a.gold=20;a.generals[0].attack=5;b.generals[0].attack=2;a.hand.push({id,instanceId:'skill',name:id,cost});act(a,'end-turn');act(b,'end-turn');const raw=(p,body)=>act(p,'neutral-action',body);for(const p of [a,b])raw(p,{choice:'main',resourceId:'r',index:0});for(const p of [a,b])raw(p,{choice:'pass'});for(const p of [a,b])raw(p,{choice:'support',index:null});return {room,a,b,raw};}
test('中立济世在揭示时治疗，拒绝濒死或满血目标',()=>{
 const {room,a,b,raw}=setup('T03',5);const g=a.generals[0];assert.throws(()=>raw(a,{choice:'card',instanceId:'skill',targetId:a.id,targetIndex:0}));g.health=0;assert.throws(()=>raw(a,{choice:'card',instanceId:'skill',targetId:a.id,targetIndex:0}));g.health=1;const gold=a.gold;raw(a,{choice:'card',instanceId:'skill',targetId:a.id,targetIndex:0});assert.equal(g.health,1);raw(b,{choice:'card',instanceId:null});assert.equal(g.health,2);assert.equal(a.gold,gold-5+1+3);assert.ok(a.discard.some(c=>c.instanceId==='skill'));assert.equal(room.lastNeutralResults[0].cards[0].targetGeneral,g.name);
});
test('中立清除技能仅移除指定的已有可移除负面状态',()=>{
 for(const id of ['T06','N28']){const {a,b,raw}=setup(id,3);const bad=statuses.add(a.generals[0],{source:'N23',kind:'attack',value:-2,expires:3});const good=statuses.add(a.generals[0],{source:'N22',kind:'attack',value:2,expires:3});
 assert.throws(()=>raw(a,{choice:'card',instanceId:'skill',targetId:a.id,targetIndex:0,effectId:good.id}));raw(a,{choice:'card',instanceId:'skill',targetId:a.id,targetIndex:0,effectId:bad.id});raw(b,{choice:'card',instanceId:null});assert.equal(a.generals[0].statuses.some(x=>x.id===bad.id),false);}
});
