'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateNeutralDeck,defaultNeutral,createTestDeck}=require('../game/deck');
test('默认公共牌组满足分类与数量',()=>{assert.equal(validateNeutralDeck(defaultNeutral).length,20);assert.equal(createTestDeck(['G02','G03']).length,40);});
test('同名低级牌可以携带四张，超出稀有度上限被拒绝',()=>{const ids=[...defaultNeutral];for(const id of ['N09','N10','N11'])ids[ids.indexOf(id)]='N08';assert.equal(validateNeutralDeck(ids).filter(c=>c.id==='N08').length,4);});
test('非法牌、总数、分类和超出稀有度上限均被拒绝',()=>{assert.throws(()=>validateNeutralDeck(defaultNeutral.slice(1)));assert.throws(()=>validateNeutralDeck([...defaultNeutral.slice(1),'X99']));const wrong=[...defaultNeutral];wrong[0]='N15';assert.throws(()=>validateNeutralDeck(wrong));const duplicate=[...defaultNeutral];duplicate[duplicate.indexOf('N09')]='N10';assert.throws(()=>validateNeutralDeck(duplicate),/上限/);});
