'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const rooms=require('../server/rooms'),statuses=require('../game/statuses'),bonuses=require('../game/permanentBonuses');
const selection={initial:'G01',deckGenerals:['G02','G03'],marketIds:[]};
function setup(count=2,prepare=()=>{}){const {room,player:a}=rooms.createRoom('甲',selection),players=[a];for(let i=1;i<count;i++)players.push(rooms.joinRoom(room.code,'玩家'+i,selection));const act=(p,type,body={})=>rooms.action(room.code,p.token,type,body);act(a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];prepare(players);for(const p of players){p.gold=20;act(p,'end-turn');}const raw=(p,body)=>act(p,'neutral-action',body);for(const p of players)raw(p,{choice:'main',resourceId:'r',index:0});for(const p of players)raw(p,{choice:'pass'});for(const p of players)raw(p,{choice:'support',index:null});return {room,players,raw};}
test('削籍夺功移除敌方参战武将永久攻击增益并重算战力',()=>{
 let buff;const {room,players:[a,b],raw}=setup(2,players=>{buff=bonuses.add(players[1].generals[0],'attack','测试');});a.hand.push({id:'N31',instanceId:'remove',name:'削籍夺功',cost:9});
 assert.throws(()=>raw(a,{choice:'card',instanceId:'remove',targetId:b.id,targetIndex:0,effectId:'invalid'}));raw(a,{choice:'card',instanceId:'remove',targetId:b.id,targetIndex:0,effectId:buff.id});raw(b,{choice:'card',instanceId:null});
 assert.equal(b.generals[0].permanentBonuses.length,0);assert.equal(room.lastNeutralResults[0].result.scores.find(x=>x.playerId===b.id).power,3);
});
test('釜底抽薪移除已存在的临时正面增益',()=>{
 const {room,players:[a,b],raw}=setup();const buff=statuses.add(b.generals[0],{source:'N22',kind:'attack',value:2,expires:3});a.hand.push({id:'N27',instanceId:'remove',name:'釜底抽薪',cost:5});
 raw(a,{choice:'card',instanceId:'remove',targetId:b.id,targetIndex:0,effectId:buff.id});raw(b,{choice:'card',instanceId:null});assert.equal(b.generals[0].statuses.some(x=>x.id===buff.id),false);assert.equal(room.lastNeutralResults[0].result.scores.find(x=>x.playerId===b.id).power,3);
});
test('两人选择同一增益时只移除一次且双方牌均消耗',()=>{
 const {room,players:[a,b,c],raw}=setup(3);const buff=statuses.add(c.generals[0],{source:'N22',kind:'attack',value:2,expires:3});for(const p of [a,b])p.hand.push({id:'N27',instanceId:'r'+p.name,name:'釜底抽薪',cost:5});
 for(const p of [a,b])raw(p,{choice:'card',instanceId:'r'+p.name,targetId:c.id,targetIndex:0,effectId:buff.id});raw(c,{choice:'card',instanceId:null});assert.equal(c.generals[0].statuses.some(x=>x.id===buff.id),false);assert.ok(a.discard.some(x=>x.id==='N27'));assert.ok(b.discard.some(x=>x.id==='N27'));assert.equal(room.round,2);
});
