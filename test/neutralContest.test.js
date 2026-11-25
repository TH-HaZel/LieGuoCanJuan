'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const contest = require('../game/neutralContest');
const player = (id, attack, support) => ({id, health:35, generals:[{name:id+'将',attack,remaining:0},{name:id+'援',attack:support,remaining:0}]});
test('主将提交完成后公开，增援只在全部提交后结算',()=>{
  const a=player('a',3,4),b=player('b',6,0),state=contest.start([a,b],'r');
  contest.submitMain(state,'a',0); assert.equal(contest.view(state,'b').mains,undefined);
  contest.submitMain(state,'b',0); assert.equal(contest.view(state,'b').mains.length,2);
  assert.throws(()=>contest.submitSupport(state,'a',0));
  contest.submitSupport(state,'a',1); assert.equal(contest.view(state,'b').supports,undefined);
  assert.equal(contest.view(state,'b').result,undefined);
  contest.submitSupport(state,'b',null); assert.equal(contest.view(state,'b').result.winnerId,'a');
  assert.equal(contest.view(state,'a').result.scores[0].power,7);
  assert.equal(contest.view(state,'b').supports[0].name,'a援');
  assert.throws(()=>contest.submitSupport(state,'a',1));
});
test('跳过和冷却校验',()=>{
  const a=player('a',3,1),b=player('b',3,1),state=contest.start([a,b],'r');
  a.generals[0].remaining=1; assert.throws(()=>contest.submitMain(state,'a',0));
  contest.submitMain(state,'a',null);contest.submitMain(state,'b',null);
  assert.equal(state.phase,'complete');assert.equal(state.result.winnerId,null);
});
test('结算发放黄金、战败扣血和冷却，增援不受伤',()=>{
  const a=player('a',5,1),b=player('b',2,1),state=contest.start([a,b],'r');
  for(const p of [a,b]){p.gold=0;p.hand=[];p.discard=[];for(const g of p.generals){g.health=2;g.cooldown=2;}}
  contest.submitMain(state,'a',0);contest.submitMain(state,'b',0);
  contest.submitSupport(state,'a',null);contest.submitSupport(state,'b',1);
  const pool={visible:[{instanceId:'r',type:'gold',amount:3}]};
  assert.equal(contest.settle(state,pool,5).winnerId,'a');
  assert.equal(a.gold,3);assert.equal(pool.visible.length,0);
  assert.equal(b.generals[0].health,1);assert.equal(b.generals[1].health,2);
  assert.equal(b.generals[0].warExperience,1);assert.equal(b.generals[1].remaining,2);
  assert.throws(()=>contest.settle(state,pool,5));
});
test('最高并列时资源保留、武将不扣血但进入冷却',()=>{
  const a=player('a',3,1),b=player('b',3,1),state=contest.start([a,b],'r');
  for(const p of [a,b])for(const g of p.generals){g.health=2;g.cooldown=1;}
  contest.submitMain(state,'a',0);contest.submitMain(state,'b',0);
  contest.submitSupport(state,'a',null);contest.submitSupport(state,'b',null);
  const pool={visible:[{instanceId:'r',type:'gold',amount:3}]};
  assert.equal(contest.settle(state,pool,7).winnerId,null);
  assert.equal(pool.visible.length,1);assert.equal(a.generals[0].health,2);assert.equal(b.generals[0].remaining,1);
});
test('手牌满时获得的公共牌进入弃牌堆，濒死败将阵亡',()=>{
  const a=player('a',5,1),b=player('b',2,1),state=contest.start([a,b],'r');
  for(const p of [a,b]){p.gold=0;p.hand=Array(10).fill({});p.discard=[];for(const g of p.generals){g.health=2;g.cooldown=1;}}
  b.generals[0].health=0;contest.submitMain(state,'a',0);contest.submitMain(state,'b',0);
  contest.submitSupport(state,'a',null);contest.submitSupport(state,'b',null);
  const pool={visible:[{instanceId:'r',type:'card',card:{id:'N01',name:'测试牌'}}]};
  contest.settle(state,pool,1);assert.equal(a.hand.length,10);assert.equal(a.discard[0].id,'N01');assert.equal(b.generals.length,1);
});
test('最低战力并列时仅返回待定名单',()=>{
  const a=player('a',5,1),b=player('b',2,1),c=player('c',2,1),state=contest.start([a,b,c],'r');
  for(const p of [a,b,c]){p.gold=0;p.hand=[];p.discard=[];for(const g of p.generals){g.health=2;g.cooldown=1;}contest.submitMain(state,p.id,0);}
  for(const p of [a,b,c])contest.submitSupport(state,p.id,null);
  const result=contest.settle(state,{visible:[{instanceId:'r',type:'gold',amount:3}]},1);
  assert.deepEqual(result.experienceTie,['b','c']);assert.equal(b.generals[0].warExperience,undefined);
});
