'use strict';

// 仅计算并校验结果；调用方负责谈判、双方同意和状态变更。
function limit(aliveCount) {
  if (!Number.isSafeInteger(aliveCount) || aliveCount < 0) throw Error('存活人数无效');
  return Math.ceil(aliveCount / 2);
}
function planJoin(groups, aliveIds, playerId, targetId) {
  if (!Array.isArray(groups) || !Array.isArray(aliveIds) || new Set(aliveIds).size !== aliveIds.length || aliveIds.some(id => typeof id !== 'string' || !id)) throw Error('同盟数据无效');
  if (playerId === targetId || !aliveIds.includes(playerId) || !aliveIds.includes(targetId)) throw Error('请选择其他存活国家');
  const seen = new Set(), alive = new Set(aliveIds), normalized = [];
  for (const group of groups) {
    if (!Array.isArray(group) || group.some(id => typeof id !== 'string' || !id) || new Set(group).size !== group.length) throw Error('同盟数据无效');
    const members = group.filter(id => alive.has(id));
    for (const id of members) { if (seen.has(id)) throw Error('国家不能同时加入多个同盟'); seen.add(id); }
    if (members.length > 1) normalized.push(members);
  }
  const source = normalized.find(group => group.includes(playerId));
  const target = normalized.find(group => group.includes(targetId));
  if (source && source === target) throw Error('已经属于同一同盟');
  const destination = target ? [...target] : [targetId];
  if (destination.length + 1 > limit(aliveIds.length)) throw Error('同盟人数已达上限');
  const result = normalized.filter(group => group !== source && group !== target).map(group => [...group]);
  if (source) { const remaining = source.filter(id => id !== playerId); if (remaining.length > 1) result.push(remaining); }
  result.push([...destination, playerId]);
  return { groups:result, isSwitch:!!source, limit:limit(aliveIds.length) };
}
function prune(groups, aliveIds) {
  const alive = new Set(aliveIds);
  return groups.map(group => group.filter(id => alive.has(id))).filter(group => group.length > 1);
}
module.exports = { limit, planJoin, prune };
