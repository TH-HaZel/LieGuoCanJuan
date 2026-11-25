'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const rooms=require('../server/rooms');
const selection={initial:'G01',deckGenerals:['G02','G03'],marketIds:[]};
function setup(aAttack,bAttack){const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);const act=(p,type,body={})=>rooms.action(room.code,p.token,type,body);act(a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];a.gold=20;a.generals[0].health=1;a.generals[0].attack=aAttack;b.generals[0].attack=bAttack;a.hand.push({id:'T13',instanceId:'heal',name:'黄沙百战',cost:3});act(a,'end-turn');act(b,'end-turn');const raw=(p,body)=>act(p,'neutral-action',body);for(const p of [a,b])raw(p,{choice:'main',resourceId:'r',index:0});for(const p of [a,b])raw(p,{choice:'pass'});for(const p of [a,b])raw(p,{choice:'support',index:null});return {room,a,b,raw};}
test('中立暗盖黄沙百战：胜利回复、失败不回复',()=>{
 for(const [attack,defense,expected] of [[5,2,2],[1,4,0]]){const {room,a,b,raw}=setup(attack,defense);assert.throws(()=>raw(a,{choice:'card',instanceId:'heal',targetId:b.id,targetIndex:0}));raw(a,{choice:'card',instanceId:'heal',targetId:a.id,targetIndex:0});raw(b,{choice:'card',instanceId:null});assert.equal(a.generals[0].health,expected);assert.ok(a.discard.some(c=>c.instanceId==='heal'));assert.equal(room.lastNeutralResults[0].cards.find(c=>c.card.id==='T13').targetGeneral,a.generals[0].name);}
});
test('黄沙百战给未参战将领时状态保留',()=>{
 const {a,b,raw}=setup(5,2);const extra={...structuredClone(a.generals[0]),name:'留守'};a.generals.push(extra);raw(a,{choice:'card',instanceId:'heal',targetId:a.id,targetIndex:1});raw(b,{choice:'card',instanceId:null});assert.equal(extra.statuses[0].source,'T13');assert.equal(extra.health,1);
});
