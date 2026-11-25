'use strict';
const {randomUUID}=require('node:crypto');
function active(g,round){return (g.statuses||[]).filter(s=>s.expires===null||round<s.expires);}
function add(g,{source,kind,value,expires=null}){
  const status={id:randomUUID(),source,kind,value,expires,polarity:value>0?'positive':'negative',removable:true};
  (g.statuses||(g.statuses=[])).push(status);return status;
}
function remove(g,id,round,polarity='positive'){const i=(g.statuses||[]).findIndex(s=>s.id===id&&s.removable&&s.polarity===polarity&&(s.expires===null||round<s.expires));if(i<0)throw Error('请选择有效的临时增益');g.statuses.splice(i,1);}
module.exports={active,add,remove};
