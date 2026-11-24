'use strict';
const crypto = require('node:crypto');
const {general,generals,createTestDeck} = require('./deck');
function createPlayer(name, seat, selection) {
  const initial=selection?.initial, deckGenerals=selection?.deckGenerals;
  if(!initial||!Array.isArray(deckGenerals)||deckGenerals.includes(initial))throw new Error('初始武将不能与主牌组武将重复');
  const starter=general(initial),deck=createTestDeck(deckGenerals);
  const marketIds=selection.marketIds===undefined?generals.filter(g=>g.id!==initial&&!deckGenerals.includes(g.id)).slice(0,5).map(g=>g.id):selection.marketIds;
  if(!Array.isArray(marketIds)||marketIds.length>5||new Set(marketIds).size!==marketIds.length||marketIds.includes(initial))throw new Error('额外武将池最多五名，不能重复或包含初始武将');
  const marketPool=marketIds.map(general);
  return {id:crypto.randomUUID(),token:crypto.randomBytes(24).toString('hex'),name,seat,country:'唐朝',health:35,maxHealth:35,gold:0,defense:0,buffs:[],generals:[starter],hand:[],deck,discard:[],marketPool,market:[],purchased:false,turnsStarted:0};
}
function publicPlayer(p) {return {id:p.id,name:p.name,seat:p.seat,country:p.country,health:p.health,maxHealth:p.maxHealth,gold:p.gold,defense:p.defense,buffs:p.buffs,generals:p.generals,handCount:p.hand.length,deckCount:p.deck.length,discardCount:p.discard.length};}
module.exports={createPlayer,publicPlayer};
