const compare=(a,b)=>a<b?-1:a>b?1:0;
const planId=day=>`plan-${day}`;

async function load({store,day,lastPractice}){
  const [problems,reviews,stored]=await Promise.all([
    store.listRecords({kind:'problem'}),store.listRecords({kind:'review'}),
    store.getRecord({kind:'plan',id:planId(day)})
  ]);
  const active=new Map(problems.filter(problem=>!problem.payload.archivedAt).map(problem=>[problem.id,problem]));
  const plan=stored||{kind:'plan',id:planId(day),payload:{day}};
  const completed=plan.payload.completed||{};
  const candidates=[],seen=new Set();
  const add=(problemId,reason)=>{if(active.has(problemId)&&!seen.has(problemId)){seen.add(problemId);candidates.push({problemId,reason});}};
  for(const review of reviews.filter(review=>review.payload.dueDay<=day&&!review.payload.completedAt).sort((a,b)=>compare(a.payload.dueDay,b.payload.dueDay)||compare(a.problemId,b.problemId)))add(review.problemId,'review');
  if(lastPractice?.problemId&&!completed[lastPractice.problemId])add(lastPractice.problemId,'resume');
  for(const problemId of [...active.keys()].sort(compare))add(problemId,'practice');
  return {plan,active,candidates};
}

function slots(plan,active){
  const excluded=new Set(plan.payload.excluded||[]);
  // Deferred items retain their slot for today. Archiving hides an item; on
  // restoration it returns to its saved position unless explicitly excluded.
  return (plan.payload.items||[]).filter(item=>active.has(item.problemId)||excluded.has(item.problemId));
}

export async function getDailyQueue({store,day,count=3,lastPractice,timezone}){
  const {plan,active,candidates}=await load({store,day,lastPractice});
  const before=JSON.stringify(plan.payload);
  plan.payload={...plan.payload,day,...(timezone?{timezone}:{}),items:[...(plan.payload.items||[])],completed:{...plan.payload.completed},excluded:[...(plan.payload.excluded||[])]};
  const selected=new Set(plan.payload.items.map(item=>item.problemId)),excluded=new Set(plan.payload.excluded);
  let length=slots(plan,active).length;
  for(const candidate of candidates){
    if(length>=count)break;
    if(selected.has(candidate.problemId)||excluded.has(candidate.problemId))continue;
    plan.payload.items.push(candidate);selected.add(candidate.problemId);length++;
  }
  if(JSON.stringify(plan.payload)!==before)await store.putRecord(plan);
  const entries=slots(plan,active).slice(0,count).filter(item=>active.has(item.problemId)&&!excluded.has(item.problemId)).map(item=>({...item,problem:active.get(item.problemId),completed:!!plan.payload.completed[item.problemId]}));
  const visible=new Set(entries.map(item=>item.problemId));
  return {plan,entries,canReplace:candidates.some(item=>!visible.has(item.problemId)&&!excluded.has(item.problemId))};
}

export async function completeDailyProblem({store,day,problemId,now=Date.now()}){
  const plan=await store.getRecord({kind:'plan',id:planId(day)})||{kind:'plan',id:planId(day),payload:{day}};
  const completed=!plan.payload.completed?.[problemId];
  plan.payload.completed={...plan.payload.completed,[problemId]:completed};
  await store.putRecord(plan);
  const review=await store.getRecord({kind:'review',id:`review-${problemId}`});
  if(review&&review.payload.dueDay<=day){review.payload.completedAt=completed?now:null;await store.putRecord(review);}
  return {plan,completed};
}

export async function deferDailyProblem({store,day,tomorrow,problemId}){
  const plan=await store.getRecord({kind:'plan',id:planId(day)});
  if(!plan?.payload.items?.some(item=>item.problemId===problemId))throw new Error('这道题已不在今日安排中，请刷新后重试。');
  const review=await store.getRecord({kind:'review',id:`review-${problemId}`});
  await store.putRecord({...review,kind:'review',id:`review-${problemId}`,problemId,payload:{...review?.payload,dueDay:tomorrow,completedAt:null}});
  plan.payload.excluded=[...new Set([...(plan.payload.excluded||[]),problemId])];
  await store.putRecord(plan);
  return plan;
}

export async function replaceDailyProblem({store,day,problemId,count=3,lastPractice,timezone}){
  const {plan,entries}=await getDailyQueue({store,day,count,lastPractice,timezone});
  if(!entries.some(item=>item.problemId===problemId))throw new Error('这道题已不在今日安排中，请刷新后重试。');
  const {candidates}=await load({store,day,lastPractice});
  const visible=new Set(entries.map(item=>item.problemId)),excluded=new Set(plan.payload.excluded);
  const replacement=candidates.find(item=>!visible.has(item.problemId)&&!excluded.has(item.problemId));
  if(!replacement)throw new Error('暂时没有可替换的题目，请先在题库导入其他题目。');
  plan.payload.items=plan.payload.items.filter(item=>item.problemId!==replacement.problemId).map(item=>item.problemId===problemId?replacement:item);
  plan.payload.excluded=[...excluded,problemId];
  await store.putRecord(plan);
  return {plan,replacement};
}
