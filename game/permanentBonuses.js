'use strict';
const {randomUUID}=require('node:crypto');
function add(g,attribute,source){
  if(!['attack','defense'].includes(attribute)||typeof source!=='string'||!source)throw Error('永久增益无效');
  const bonus={id:randomUUID(),attribute,source};
  (g.permanentBonuses||(g.permanentBonuses=[])).push(bonus);
  return bonus;
}
function total(g,attribute){return (g.permanentBonuses||[]).filter(b=>b.attribute===attribute).length;}
function penalty(g,attribute){return g.permanentPenalties?.[attribute]||0;}
function effective(g,attribute){return Math.max(0,g[attribute]+total(g,attribute)-penalty(g,attribute));}
function reduce(g,attribute){
  if(!['attack','defense'].includes(attribute))throw Error('永久减益无效');
  if(effective(g,attribute)>0){g.permanentPenalties||(g.permanentPenalties={});g.permanentPenalties[attribute]=(g.permanentPenalties[attribute]||0)+1;}
}
function remove(g,id){
  const i=(g.permanentBonuses||[]).findIndex(b=>b.id===id);
  if(i<0)throw Error('请选择有效的永久增益');
  const removed=g.permanentBonuses.splice(i,1)[0];
  if(g.permanentPenalties?.[removed.attribute])g.permanentPenalties[removed.attribute]=Math.min(g.permanentPenalties[removed.attribute],Math.max(0,g[removed.attribute]+total(g,removed.attribute)));
  return removed;
}
module.exports={add,total,penalty,effective,reduce,remove};
