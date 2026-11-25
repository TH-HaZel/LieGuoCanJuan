'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const bonuses=require('../game/permanentBonuses');
test('永久增益独立记录，按编号移除且保留基础属性',()=>{
  const g={attack:3,defense:2};
  const a=bonuses.add(g,'attack','T11');
  bonuses.add(g,'defense','T11');
  bonuses.add(g,'attack','T11');
  assert.equal(bonuses.total(g,'attack'),2);
  bonuses.remove(g,a.id);
  assert.equal(bonuses.total(g,'attack'),1);
  assert.equal(bonuses.total(g,'defense'),1);
  assert.equal(g.attack,3);
  assert.throws(()=>bonuses.remove(g,a.id));
  assert.throws(()=>bonuses.add(g,'health','T11'));
});
