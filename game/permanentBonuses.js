'use strict';
const {randomUUID}=require('node:crypto');
function add(g,attribute,source){
  if(!['attack','defense'].includes(attribute)||typeof source!=='string'||!source)throw Error('永久增益无效');
  const bonus={id:randomUUID(),attribute,source};
  (g.permanentBonuses||(g.permanentBonuses=[])).push(bonus);
  return bonus;
}
function total(g,attribute){return (g.permanentBonuses||[]).filter(b=>b.attribute===attribute).length;}
function remove(g,id){
  const i=(g.permanentBonuses||[]).findIndex(b=>b.id===id);
  if(i<0)throw Error('请选择有效的永久增益');
  return g.permanentBonuses.splice(i,1)[0];
}
module.exports={add,total,remove};
