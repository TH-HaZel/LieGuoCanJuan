'use strict';
const statuses = require('./statuses');
// 封锁链按依赖顺序处理；循环中的天意全部失效。
function resolve(choices, blocked, round) {
  const actions = choices.filter(x=>x.source&&x.target&&x.source.health>0&&!blocked.has(x.source));
  const bySource = new Map(actions.map(x=>[x.source,x]));
  const cyclic = new Set();
  for (const start of actions) {
    const path=[], positions=new Map();let cur=start;
    while(cur&&!positions.has(cur)&&!cyclic.has(cur)) {positions.set(cur,path.length);path.push(cur);cur=bySource.get(cur.target);}
    if(cur&&positions.has(cur))for(const item of path.slice(positions.get(cur)))cyclic.add(item);
  }
  const pending=actions.filter(x=>!cyclic.has(x));
  while(pending.length){
    const index=pending.findIndex(x=>!pending.some(y=>y!==x&&y.target===x.source&&!blocked.has(y.source)));
    if(index<0)throw Error('天意结算存在无法处理的循环');
    const [choice]=pending.splice(index,1);
    if(blocked.has(choice.source))continue;
    const shield=statuses.active(choice.target,round).find(e=>e.kind==='war_immunity');
    if(shield)choice.target.statuses=(choice.target.statuses||[]).filter(e=>e.id!==shield.id);
    else blocked.add(choice.target);
  }
}
module.exports={resolve};
