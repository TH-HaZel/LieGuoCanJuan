'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const rooms=require('../server/rooms');
const selection={initial:'G01',deckGenerals:['G02','G03'],marketIds:[]};
function setup(){const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);const act=(p,type,body={})=>rooms.action(room.code,p.token,type,body);act(a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];a.gold=20;b.gold=20;a.hand.push({id:'N22',instanceId:'boost',name:'士气高涨',cost:4});b.hand.push({id:'N23',instanceId:'debuff',name:'疲兵之策',cost:5});act(a,'end-turn');act(b,'end-turn');const raw=(p,body)=>act(p,'neutral-action',body);for(const p of [a,b])raw(p,{choice:'main',resourceId:'r',index:0});for(const p of [a,b])raw(p,{choice:'pass'});for(const p of [a,b])raw(p,{choice:'support',index:null});return {room,a,b,raw};}
test('中立暗盖增益和减益同时揭示并作用于本次参战武将',()=>{
 const {room,a,b,raw}=setup();assert.throws(()=>raw(a,{choice:'card',instanceId:'boost',targetId:b.id,targetIndex:0}));assert.throws(()=>raw(a,{choice:'card',instanceId:'boost',targetId:a.id,targetIndex:99}));
 raw(a,{choice:'card',instanceId:'boost',targetId:a.id,targetIndex:0});let msg='';rooms.subscribe(room,b,{write(x){msg=x},on(){}});const snap=JSON.parse(msg.slice(6));assert.ok(!JSON.stringify(snap.neutral).includes('boost'));assert.equal(a.generals[0].statuses?.length||0,0);
 raw(b,{choice:'card',instanceId:'debuff',targetId:a.id,targetIndex:0});assert.equal(room.lastNeutralResults[0].result.scores.find(x=>x.playerId===a.id).power,3);assert.equal(a.generals[0].statuses.length,0);assert.ok(a.discard.some(c=>c.instanceId==='boost'));assert.ok(b.discard.some(c=>c.instanceId==='debuff'));assert.equal(room.lastNeutralResults[0].cards.find(c=>c.card.id==='N23').targetGeneral,a.generals[0].name);
});
test('中立暗盖技能选中未参战武将时保留其状态',()=>{
 const {room,a,b,raw}=setup();const extra={...structuredClone(a.generals[0]),name:'留守'};a.generals.push(extra);
 raw(a,{choice:'card',instanceId:'boost',targetId:a.id,targetIndex:1});raw(b,{choice:'card',instanceId:null});assert.equal(extra.statuses.length,1);assert.equal(extra.statuses[0].source,'N22');assert.equal(room.lastNeutralResults[0].result.scores.find(x=>x.playerId===a.id).power,3);
});
