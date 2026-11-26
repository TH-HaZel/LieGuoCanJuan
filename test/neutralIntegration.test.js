'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const rooms=require('../server/rooms');
const selection={initial:'G01',deckGenerals:['G02','G03'],marketIds:[]};
function act(room,p,type,body={}){if(type==='neutral-action'&&body.choice==='support'){while(room.neutralRound?.negotiation){const id=room.neutralRound.negotiation.turn;const who=room.players.find(x=>x.id===id);rooms.action(room.code,who.token,'neutral-action',{choice:'pass'});}}const result=rooms.action(room.code,p.token,type,body);if(type==='neutral-action'&&body.choice==='support'&&room.neutralRound?.cards){let snap=result;while(room.neutralRound?.cards){const id=room.players.find(x=>room.neutralRound.current.mains.get(x.id)&&!room.neutralRound.cards.has(x.id)).id;const who=room.players.find(x=>x.id===id);snap=rooms.action(room.code,who.token,'neutral-action',{choice:'card',instanceId:null});}return snap;}return result;}
test('三人可分别选择不同资源，结算后进入下一轮',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection),c=rooms.joinRoom(room.code,'丙',selection);
 act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:3},{instanceId:'s',type:'gold',amount:2}];
 a.generals[0].attack=5;b.generals[0].attack=2;
 act(room,a,'end-turn');act(room,b,'end-turn');let snap=act(room,c,'end-turn');
 assert.equal(snap.round,1);assert.equal(snap.neutral.waitingId,a.id);assert.equal(snap.neutralResources.length,2);
 assert.throws(()=>act(room,b,'neutral-action',{choice:'skip'}));
 act(room,a,'neutral-action',{choice:'main',resourceId:'r',index:0});
 assert.throws(()=>act(room,a,'neutral-action',{choice:'main',resourceId:'s',index:0}));
 act(room,b,'neutral-action',{choice:'main',resourceId:'r',index:0});
 snap=act(room,c,'neutral-action',{choice:'main',resourceId:'s',index:0});assert.equal(snap.neutral.phase,'negotiation');
 act(room,a,'neutral-action',{choice:'support',index:null});
 assert.equal(room.neutralRound.current.supports.has(a.id),true);
 snap=act(room,b,'neutral-action',{choice:'support',index:null});
 assert.equal(snap.neutral,null);assert.equal(snap.round,2);assert.equal(b.generals[0].health,2);
 assert.equal(snap.neutralResources.some(x=>x.instanceId==='r'||x.instanceId==='s'),false);
});
test('所有人跳过时资源保留并公开新资源',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);
 act(room,a,'start');const first=room.neutralPool.visible[0].instanceId;
 act(room,a,'end-turn');act(room,b,'end-turn');act(room,a,'neutral-action',{choice:'skip'});
 const snap=act(room,b,'neutral-action',{choice:'skip'});
 assert.equal(snap.round,2);assert.equal(snap.neutralResources.length,2);assert.ok(snap.neutralResources.some(x=>x.instanceId===first));
});
test('服务器快照不泄露尚未揭示的增援，也不泄露牌堆顺序',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);
 act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:3}];
 a.generals.push({...a.generals[0],name:'秘密援军',attack:4});
 act(room,a,'end-turn');act(room,b,'end-turn');act(room,a,'neutral-action',{choice:'main',resourceId:'r',index:0});act(room,b,'neutral-action',{choice:'main',resourceId:'r',index:0});
 act(room,a,'neutral-action',{choice:'support',index:1});
 let message='';rooms.subscribe(room,b,{write(x){message=x;},on(){}});
 const snapshot=JSON.parse(message.slice(6));assert.equal(snapshot.neutral.contest.supports,undefined);assert.equal(snapshot.neutral.contest.result,undefined);assert.equal(snapshot.neutralPool,undefined);
 const done=act(room,b,'neutral-action',{choice:'support',index:null});
 assert.equal(done.lastNeutralResults[0].supports[0].name,'秘密援军');
});

test('国家硬抗只使用独立防御，不计入国家生命',()=>{
 const {createPlayer}=require('../game/player'),game=require('../game/game'),war=require('../game/war');
 const a=createPlayer('甲',1,selection),b=createPlayer('乙',2,selection),room={phase:'waiting',players:[a,b]};
 game.startGame(room,a);b.health=10;b.defense=2;war.startWar(room,a,{targetId:b.id,indices:[0]});war.respondWar(room,b,{choice:'fight'});war.respondWar(room,b,{choice:'hard'});war.respondWar(room,a,{choice:'card',instanceId:null});war.respondWar(room,b,{choice:'card',instanceId:null});
 assert.equal(b.health,9);assert.equal(a.generals[0].health,3);assert.equal(room.war,null);
});
test('中立争夺后排队处理军功簿与战后整顿，再进入下一轮',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);
 act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:3}];
 a.gold=20;b.gold=20;a.generals[0].attack=5;b.generals[0].attack=2;
 a.hand.push({id:'T11',cost:8,variety:'能力',instanceId:'a-t11'},{id:'N19',cost:5,variety:'能力',instanceId:'a-n19'});
 b.hand.push({id:'T11',cost:8,variety:'能力',instanceId:'b-t11'});
 act(room,a,'play-card',{instanceId:'a-t11',targetIndex:0});act(room,a,'play-card',{instanceId:'a-n19',targetIndex:0});act(room,a,'end-turn');
 act(room,b,'play-card',{instanceId:'b-t11',targetIndex:0});act(room,b,'end-turn');
 act(room,a,'neutral-action',{choice:'main',resourceId:'r',index:0});act(room,b,'neutral-action',{choice:'main',resourceId:'r',index:0});
 act(room,a,'neutral-action',{choice:'support',index:null});let snap=act(room,b,'neutral-action',{choice:'support',index:null});
 assert.equal(snap.round,1);assert.equal(snap.pendingChoice.playerId,a.id);assert.equal(a.generals[0].remaining,0);
 assert.throws(()=>act(room,b,'bonus-choice',{attribute:'attack'}));
 snap=act(room,a,'bonus-choice',{attribute:'attack'});assert.equal(snap.pendingChoice.playerId,b.id);
 snap=act(room,b,'bonus-choice',{attribute:'defense'});assert.equal(snap.round,2);assert.equal(snap.pendingChoice,null);
 assert.equal(a.generals[0].permanentBonuses[0].attribute,'attack');assert.equal(b.generals[0].permanentBonuses[0].attribute,'defense');
});
test('争夺中阵亡的武将不产生军功簿选择',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);
 act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:3}];a.generals[0].attack=5;b.generals[0].attack=2;b.generals[0].health=0;
 require('../game/statuses').add(b.generals[0],{source:'T11',kind:'permanent_after_war',value:1});
 act(room,a,'end-turn');act(room,b,'end-turn');act(room,a,'neutral-action',{choice:'main',resourceId:'r',index:0});act(room,b,'neutral-action',{choice:'main',resourceId:'r',index:0});act(room,a,'neutral-action',{choice:'support',index:null});
 const snap=act(room,b,'neutral-action',{choice:'support',index:null});assert.equal(b.generals.length,0);assert.equal(snap.pendingChoice,null);assert.equal(snap.round,2);
});
test('黄沙百战在中立争夺胜利时恢复生命，失败不恢复',()=>{
 const statuses=require('../game/statuses'),{room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);
 act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:3}];a.generals[0].attack=5;b.generals[0].attack=2;
 a.generals[0].health=1;b.generals[0].health=2;
 statuses.add(a.generals[0],{source:'T13',kind:'heal_on_win',value:1});statuses.add(b.generals[0],{source:'T13',kind:'heal_on_win',value:1});
 act(room,a,'end-turn');act(room,b,'end-turn');act(room,a,'neutral-action',{choice:'main',resourceId:'r',index:0});act(room,b,'neutral-action',{choice:'main',resourceId:'r',index:0});act(room,a,'neutral-action',{choice:'support',index:null});act(room,b,'neutral-action',{choice:'support',index:null});
 assert.equal(a.generals[0].health,2);assert.equal(b.generals[0].health,1);assert.equal(a.generals[0].statuses.length,0);assert.equal(b.generals[0].statuses.length,0);
});

test('中立谈判最多报价两次，接受后支付并退出',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection),c=rooms.joinRoom(room.code,'丙',selection);
 act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:3}];a.gold=10;b.gold=0;
 for(const p of [a,b,c])act(room,p,'end-turn');for(const p of [a,b,c])act(room,p,'neutral-action',{choice:'main',resourceId:'r',index:0});
 const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);
 assert.throws(()=>raw(b,{choice:'offer',targetId:a.id,amount:1}));
 raw(a,{choice:'offer',targetId:b.id,amount:2});assert.throws(()=>raw(c,{choice:'accept'}));raw(b,{choice:'reject'});
 raw(b,{choice:'pass'});raw(c,{choice:'pass'});raw(a,{choice:'offer',targetId:b.id,amount:3});raw(b,{choice:'reject'});
 raw(b,{choice:'pass'});raw(c,{choice:'pass'});assert.throws(()=>raw(a,{choice:'offer',targetId:b.id,amount:1}));
 raw(a,{choice:'pass'});assert.equal(room.neutralRound.negotiation,null);assert.throws(()=>raw(a,{choice:'withdraw'}));
});
test('接受报价后转移黄金，最后一名直接取得资源',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);
 act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:3}];a.gold=10;b.gold=0;
 act(room,a,'end-turn');act(room,b,'end-turn');act(room,a,'neutral-action',{choice:'main',resourceId:'r',index:0});act(room,b,'neutral-action',{choice:'main',resourceId:'r',index:0});
 const beforeA=a.gold,beforeB=b.gold;act(room,a,'neutral-action',{choice:'offer',targetId:b.id,amount:2});act(room,b,'neutral-action',{choice:'accept'});
 assert.equal(a.gold,beforeA-2+3+3);assert.equal(b.gold,beforeB+2);assert.equal(b.generals[0].remaining,0);assert.equal(room.round,2);
});
test('单人获得中立资源触发黄沙百战',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');
 room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];a.generals[0].health=1;require('../game/statuses').add(a.generals[0],{source:'T13',kind:'heal_on_win',value:1});
 act(room,a,'end-turn');act(room,b,'end-turn');act(room,a,'neutral-action',{choice:'main',resourceId:'r',index:0});act(room,b,'neutral-action',{choice:'skip'});assert.equal(a.generals[0].health,2);
});

test('中立争夺暗盖进攻牌，全部确认后结算',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:3}];a.generals[0].attack=2;b.generals[0].attack=3;a.gold=10;
 a.hand.push({id:'T08',instanceId:'attack',name:'玄甲军',cost:2});act(room,a,'end-turn');act(room,b,'end-turn');act(room,a,'neutral-action',{choice:'main',resourceId:'r',index:0});act(room,b,'neutral-action',{choice:'main',resourceId:'r',index:0});
 const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);raw(a,{choice:'pass'});raw(b,{choice:'pass'});raw(a,{choice:'support',index:null});raw(b,{choice:'support',index:null});
 assert.throws(()=>raw(b,{choice:'card',instanceId:null}));const old=a.gold;raw(a,{choice:'card',instanceId:'attack'});assert.equal(a.gold,old);assert.equal(a.hand.some(c=>c.instanceId==='attack'),true);
 let msg='';rooms.subscribe(room,b,{write(x){msg=x},on(){}});const snap=JSON.parse(msg.slice(6));assert.equal(snap.neutral.contest.result,undefined);assert.equal(snap.neutral.contest.supports,undefined);assert.ok(!JSON.stringify(snap.neutral).includes('玄甲军'));
 raw(b,{choice:'card',instanceId:null});assert.equal(a.hand.some(c=>c.instanceId==='attack'),false);assert.ok(a.discard.some(c=>c.instanceId==='attack'));assert.equal(room.lastNeutralResults[0].result.winnerId,null);assert.equal(a.gold,old-2+3);
});
test('破釜沉舟中立落败时仅参战将领额外受伤',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:3}];a.gold=20;
 a.generals[0].attack=1;b.generals[0].attack=12;
 const ally={...structuredClone(a.generals[0]),name:'增援',health:2,attack:1,remaining:0};const reserve={...structuredClone(ally),name:'未参战'};a.generals.push(ally,reserve);
 a.hand.push({id:'N01',instanceId:'n01',name:'破釜沉舟',cost:5});act(room,a,'end-turn');act(room,b,'end-turn');
 const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);raw(a,{choice:'main',resourceId:'r',index:0});raw(b,{choice:'main',resourceId:'r',index:0});raw(a,{choice:'pass'});raw(b,{choice:'pass'});raw(a,{choice:'support',index:1});raw(b,{choice:'support',index:null});
 raw(a,{choice:'card',instanceId:'n01'});raw(b,{choice:'card',instanceId:null});
 assert.equal(a.generals[0].health,1);assert.equal(ally.health,1);assert.equal(reserve.health,2);assert.equal(room.lastNeutralResults[0].result.scores.find(x=>x.playerId===a.id).power,4);
});
test('破釜沉舟中立争夺并列不扣生命',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:3}];a.gold=20;a.generals[0].attack=1;b.generals[0].attack=3;
 a.hand.push({id:'N01',instanceId:'n01',name:'破釜沉舟',cost:5});act(room,a,'end-turn');act(room,b,'end-turn');
 const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);raw(a,{choice:'main',resourceId:'r',index:0});raw(b,{choice:'main',resourceId:'r',index:0});raw(a,{choice:'pass'});raw(b,{choice:'pass'});raw(a,{choice:'support',index:null});raw(b,{choice:'support',index:null});raw(a,{choice:'card',instanceId:'n01'});raw(b,{choice:'card',instanceId:null});
 assert.equal(a.generals[0].health,3);assert.equal(b.generals[0].health,3);assert.equal(room.lastNeutralResults[0].result.winnerId,null);
});
test('破釜沉舟额外伤害导致濒死主将阵亡',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];a.gold=20;a.generals[0].attack=1;a.generals[0].health=1;b.generals[0].attack=8;
 a.hand.push({id:'N01',instanceId:'n01',name:'破釜沉舟',cost:5});act(room,a,'end-turn');act(room,b,'end-turn');
 const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);raw(a,{choice:'main',resourceId:'r',index:0});raw(b,{choice:'main',resourceId:'r',index:0});raw(a,{choice:'pass'});raw(b,{choice:'pass'});raw(a,{choice:'support',index:null});raw(b,{choice:'support',index:null});raw(a,{choice:'card',instanceId:'n01'});raw(b,{choice:'card',instanceId:null});
 assert.equal(a.generals.length,0);
});
test('中立争夺先声夺人选择主将比较，雷雨对所有进攻牌生效',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection),c=rooms.joinRoom(room.code,'丙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:3}];
 for(const p of [a,b,c]){p.gold=20;p.generals[0].id='test-'+p.name;}a.generals[0].attack=2;b.generals[0].attack=5;c.generals[0].attack=3;
 a.hand.push({id:'N06',instanceId:'n06',name:'先声夺人',cost:4});b.hand.push({id:'N13',instanceId:'n13',name:'雷雨交加',cost:6});c.hand.push({id:'T08',instanceId:'t08',name:'玄甲军',cost:2});
 for(const p of [a,b,c])act(room,p,'end-turn');const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);
 for(const p of [a,b,c])raw(p,{choice:'main',resourceId:'r',index:0});for(const p of [a,b,c])raw(p,{choice:'pass'});for(const p of [a,b,c])raw(p,{choice:'support',index:null});
 assert.throws(()=>raw(a,{choice:'card',instanceId:'n06',targetId:a.id}));assert.throws(()=>raw(a,{choice:'card',instanceId:'n06'}));raw(a,{choice:'card',instanceId:'n06',targetId:b.id});
 let msg='';rooms.subscribe(room,b,{write(x){msg=x},on(){}});const snapshot=JSON.parse(msg.slice(6));assert.equal(snapshot.neutral.contest.result,undefined);assert.ok(!JSON.stringify(snapshot.neutral).includes('n06'));
 raw(b,{choice:'card',instanceId:'n13'});raw(c,{choice:'card',instanceId:'t08'});
 const revealed=room.lastNeutralResults[0].cards.find(x=>x.playerId===a.id);assert.equal(revealed.card.id,'N06');assert.equal(revealed.targetId,b.id);
 const scores=room.lastNeutralResults[0].result.scores;assert.equal(scores.find(s=>s.playerId===a.id).power,4);assert.equal(scores.find(s=>s.playerId===b.id).power,5);assert.equal(scores.find(s=>s.playerId===c.id).power,3);
});
test('先声夺人比较武将基础攻击而非永久成长后的攻击',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];a.gold=20;a.generals[0].attack=10;b.generals[0].attack=3;
 a.hand.push({id:'N06',instanceId:'n06',name:'先声夺人',cost:4});act(room,a,'end-turn');act(room,b,'end-turn');const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);
 raw(a,{choice:'main',resourceId:'r',index:0});raw(b,{choice:'main',resourceId:'r',index:0});raw(a,{choice:'pass'});raw(b,{choice:'pass'});raw(a,{choice:'support',index:null});raw(b,{choice:'support',index:null});raw(a,{choice:'card',instanceId:'n06',targetId:b.id});raw(b,{choice:'card',instanceId:null});
 assert.equal(room.lastNeutralResults[0].result.scores.find(s=>s.playerId===a.id).power,11);
});
test('单张鸣金收兵目标直接失败，其余人并列仍扣目标主将血',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection),c=rooms.joinRoom(room.code,'丙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:3}];
 for(const p of [a,b,c]){p.gold=20;p.generals[0].attack=3;}b.generals[0].attack=8;a.hand.push({id:'N29',instanceId:'n29',name:'鸣金收兵',cost:10});
 for(const p of [a,b,c])act(room,p,'end-turn');const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);for(const p of [a,b,c])raw(p,{choice:'main',resourceId:'r',index:0});for(const p of [a,b,c])raw(p,{choice:'pass'});for(const p of [a,b,c])raw(p,{choice:'support',index:null});
 assert.throws(()=>raw(a,{choice:'card',instanceId:'n29',targetId:a.id}));raw(a,{choice:'card',instanceId:'n29',targetId:b.id});raw(b,{choice:'card',instanceId:null});raw(c,{choice:'card',instanceId:null});
 assert.equal(a.generals[0].health,3);assert.equal(b.generals[0].health,2);assert.equal(c.generals[0].health,3);assert.equal(room.lastNeutralResults[0].result.winnerId,null);assert.equal(room.lastNeutralResults[0].result.scores.find(x=>x.playerId===b.id).forcedDefeat,true);assert.ok(room.neutralPool.visible.some(x=>x.instanceId==='r'));
});
test('多人同时鸣金收兵全部失效，正常比较战力',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:3}];a.gold=20;b.gold=20;a.generals[0].attack=4;b.generals[0].attack=3;
 a.hand.push({id:'N29',instanceId:'a29',name:'鸣金收兵',cost:10});b.hand.push({id:'N29',instanceId:'b29',name:'鸣金收兵',cost:10});act(room,a,'end-turn');act(room,b,'end-turn');const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);raw(a,{choice:'main',resourceId:'r',index:0});raw(b,{choice:'main',resourceId:'r',index:0});raw(a,{choice:'pass'});raw(b,{choice:'pass'});raw(a,{choice:'support',index:null});raw(b,{choice:'support',index:null});raw(a,{choice:'card',instanceId:'a29',targetId:b.id});raw(b,{choice:'card',instanceId:'b29',targetId:a.id});
 assert.equal(room.lastNeutralResults[0].result.winnerId,a.id);assert.equal(a.generals[0].health,3);assert.equal(b.generals[0].health,2);assert.ok(a.discard.some(x=>x.instanceId==='a29'));assert.ok(b.discard.some(x=>x.instanceId==='b29'));
});
test('识破反制鸣金收兵，正常比较战力并支付费用',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection),c=rooms.joinRoom(room.code,'丙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:3}];
 for(const p of [a,b,c])p.gold=20;a.generals[0].attack=3;b.generals[0].attack=5;c.generals[0].attack=2;
 a.hand.push({id:'N29',instanceId:'a29',name:'鸣金收兵',cost:10});c.hand.push({id:'N30',instanceId:'c30',name:'识破',cost:6});for(const p of [a,b,c])act(room,p,'end-turn');
 const oldA=a.gold,oldC=c.gold,raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);for(const p of [a,b,c])raw(p,{choice:'main',resourceId:'r',index:0});for(const p of [a,b,c])raw(p,{choice:'pass'});for(const p of [a,b,c])raw(p,{choice:'support',index:null});
 raw(a,{choice:'card',instanceId:'a29',targetId:b.id});raw(b,{choice:'card',instanceId:null});raw(c,{choice:'card',instanceId:'c30'});
 assert.equal(room.lastNeutralResults[0].cards.find(x=>x.card.id==='N29').outcome,'countered');assert.equal(room.lastNeutralResults[0].result.winnerId,b.id);assert.equal(b.generals[0].health,3);assert.equal(a.gold,oldA-10+3);assert.equal(c.gold,oldC-6);assert.ok(a.discard.some(x=>x.instanceId==='a29'));assert.ok(c.discard.some(x=>x.instanceId==='c30'));
});
test('识破没有鸣金收兵时仍消耗',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:3}];a.gold=20;a.generals[0].attack=1;b.generals[0].attack=5;a.hand.push({id:'N30',instanceId:'a30',name:'识破',cost:6});act(room,a,'end-turn');act(room,b,'end-turn');const old=a.gold;
 const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);for(const p of [a,b])raw(p,{choice:'main',resourceId:'r',index:0});for(const p of [a,b])raw(p,{choice:'pass'});for(const p of [a,b])raw(p,{choice:'support',index:null});raw(a,{choice:'card',instanceId:'a30'});raw(b,{choice:'card',instanceId:null});
 assert.equal(room.lastNeutralResults[0].result.winnerId,b.id);assert.equal(a.gold,old-6+3);assert.ok(a.discard.some(x=>x.instanceId==='a30'));
});
test('战争经验可在己方回合清除冷却并校验非法操作',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');
 const g=a.generals[0];g.remaining=3;g.warExperience=2;const raw=(p,index)=>rooms.action(room.code,p.token,'experience-cooldown',{index});
 assert.throws(()=>raw(b,0));assert.throws(()=>raw(a,-1));assert.throws(()=>raw(a,100));assert.equal(g.warExperience,2);assert.equal(g.remaining,3);
 raw(a,0);assert.equal(g.warExperience,1);assert.equal(g.remaining,0);assert.throws(()=>raw(a,0));assert.equal(g.warExperience,1);
 g.remaining=2;g.warExperience=0;assert.throws(()=>raw(a,0));assert.equal(g.remaining,2);
});
test('中立争夺主将与隐藏增援使用经验后结算战力',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];a.generals[0].attack=1;a.generals[0].warExperience=2;b.generals[0].attack=5;
 const support={...structuredClone(a.generals[0]),name:'增援',attack:1,warExperience:1};a.generals.push(support);act(room,a,'end-turn');act(room,b,'end-turn');const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);
 assert.throws(()=>raw(a,{choice:'main',resourceId:'r',index:0,experience:3}));raw(a,{choice:'main',resourceId:'r',index:0,experience:2});raw(b,{choice:'main',resourceId:'r',index:0});raw(a,{choice:'pass'});raw(b,{choice:'pass'});
 assert.throws(()=>raw(a,{choice:'support',index:1,experience:2}));raw(a,{choice:'support',index:1,experience:1});raw(b,{choice:'support',index:null});assert.equal(a.generals[0].warExperience,2);assert.equal(support.warExperience,1);
 raw(a,{choice:'card',instanceId:null});raw(b,{choice:'card',instanceId:null});const score=room.lastNeutralResults[0].result.scores.find(x=>x.playerId===a.id);assert.equal(score.power,5);assert.equal(a.generals[0].warExperience,0);assert.equal(support.warExperience,0);assert.equal(room.lastNeutralResults[0].result.winnerId,null);
});
test('中立争夺撤退不会消耗已选择经验',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];a.generals[0].warExperience=2;
 act(room,a,'end-turn');act(room,b,'end-turn');const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);raw(a,{choice:'main',resourceId:'r',index:0,experience:2});raw(b,{choice:'main',resourceId:'r',index:0});raw(a,{choice:'withdraw'});assert.equal(a.generals[0].warExperience,2);assert.equal(room.round,2);
});
test('中立资源只有一位争夺者时消耗选定经验',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);act(room,a,'start');room.neutralPool.visible=[{instanceId:'r',type:'gold',amount:1}];a.generals[0].warExperience=2;
 act(room,a,'end-turn');act(room,b,'end-turn');act(room,a,'neutral-action',{choice:'main',resourceId:'r',index:0,experience:1});act(room,b,'neutral-action',{choice:'skip'});assert.equal(a.generals[0].warExperience,1);assert.equal(room.lastNeutralResults[0].result.scores[0].power,4);
});
test('六人分别争夺三份资源，隐藏选择不泄漏并按顺序结算',()=>{
 const {room,player:first}=rooms.createRoom('甲',selection),ps=[first];for(const name of ['乙','丙','丁','戊','己'])ps.push(rooms.joinRoom(room.code,name,selection));
 act(room,first,'start');room.neutralPool.visible=['r1','r2','r3'].map(instanceId=>({instanceId,type:'gold',amount:3}));
 for(let i=0;i<6;i++){ps[i].generals[0].attack=i%2?1:5;act(room,ps[i],'end-turn');}
 const raw=(p,body)=>rooms.action(room.code,p.token,'neutral-action',body);
 for(let i=0;i<6;i++)raw(ps[i],{choice:'main',resourceId:'r'+(Math.floor(i/2)+1),index:0});
 for(let i=0;i<6;i+=2){const [a,b]=[ps[i],ps[i+1]];raw(a,{choice:'pass'});raw(b,{choice:'pass'});raw(a,{choice:'support',index:null});raw(b,{choice:'support',index:null});raw(a,{choice:'card',instanceId:null});
   let message='';rooms.subscribe(room,b,{write(x){message=x;},on(){}});const snap=JSON.parse(message.slice(6));assert.equal(snap.neutral.contest.result,undefined);assert.equal(snap.neutral.contest.supports,undefined);
   raw(b,{choice:'card',instanceId:null});
 }
 assert.equal(room.round,2);assert.equal(room.neutralRound,null);assert.equal(room.lastNeutralResults.length,3);
 for(let i=0;i<6;i+=2){assert.equal(room.lastNeutralResults[i/2].result.winnerId,ps[i].id);assert.equal(ps[i+1].generals[0].health,2);}
 for(const id of ['r1','r2','r3'])assert.ok(!room.neutralPool.visible.some(r=>r.instanceId===id));
});


test('初始国家防御为零，硬抗按进攻战力扣除生命',()=>{
 const {createPlayer}=require('../game/player'),game=require('../game/game'),war=require('../game/war');
 const a=createPlayer('甲',1,selection),b=createPlayer('乙',2,selection),room={phase:'waiting',players:[a,b]};
 game.startGame(room,a);assert.equal(b.defense,0);assert.equal(b.health,35);
 war.startWar(room,a,{targetId:b.id,indices:[0]});war.respondWar(room,b,{choice:'fight'});war.respondWar(room,b,{choice:'hard'});
 war.respondWar(room,a,{choice:'card',instanceId:null});war.respondWar(room,b,{choice:'card',instanceId:null});
 assert.equal(b.health,32);assert.equal(b.generals[0].health,3);assert.equal(a.generals[0].health,3);assert.equal(room.war,null);
});


test('以战养战中立争夺获胜获得二金，失败不获金且能力保留',()=>{
 const {room,player:a}=rooms.createRoom('甲',selection),b=rooms.joinRoom(room.code,'乙',selection);
 act(room,a,'start');room.neutralPool.visible=[{instanceId:'income-resource',type:'gold',amount:3}];
 for(const p of [a,b]){p.gold=20;p.hand.push({...require('../game/deck').cards.find(c=>c.id==='T12'),instanceId:'income-'+p.id});}
 act(room,a,'play-card',{instanceId:'income-'+a.id});act(room,a,'end-turn');
 act(room,b,'play-card',{instanceId:'income-'+b.id});act(room,b,'end-turn');
 a.generals[0].attack=1;b.generals[0].attack=5;
 act(room,a,'neutral-action',{choice:'main',resourceId:'income-resource',index:0});act(room,b,'neutral-action',{choice:'main',resourceId:'income-resource',index:0});
 act(room,a,'neutral-action',{choice:'support',index:null});
 const beforeA=a.gold,beforeB=b.gold;
 act(room,b,'neutral-action',{choice:'support',index:null});
 assert.equal(b.gold,beforeB+3+2);assert.equal(a.gold,beforeA+3);
 assert.equal(a.warIncome,1);assert.equal(b.warIncome,1);
});
