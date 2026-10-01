// Daily plans are shared records: removing a question must keep other entries.
export function withoutProblemInPlan(record,problemId){
  if(record.kind!=='plan')return record;
  const completed=record.payload.completed,items=record.payload.items;
  const inCompleted=completed&&Object.hasOwn(completed,problemId);
  const inItems=Array.isArray(items)&&items.some(item=>item.problemId===problemId);
  if(!inCompleted&&!inItems)return record;
  const next=structuredClone(record);next.updatedAt=Date.now();
  if(inCompleted)delete next.payload.completed[problemId];
  if(inItems)next.payload.items=items.filter(item=>item.problemId!==problemId);
  return next;
}
