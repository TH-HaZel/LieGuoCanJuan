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
