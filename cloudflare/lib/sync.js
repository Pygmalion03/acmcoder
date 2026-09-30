import { validateMutation } from '../../shared/records.js';

// Small batches keep the per-request D1 statement budget bounded on the free tier.
export const MAX_PUSH = 4;
export function createSyncRepository(db, records) {
  return {
    async push({userId,mutations}) {
      if (!Array.isArray(mutations) || mutations.length < 1 || mutations.length > MAX_PUSH) throw new Error('INVALID_BATCH');
      const validated=mutations.map(validateMutation);
      const result={applied:[],conflicts:[],errors:[]};
      for(const mutation of validated){
        try{
          const response=await records.apply({userId,mutation});
          result.applied.push(...response.applied);result.conflicts.push(...response.conflicts);
        }catch(error){
          if(!/^(CAPACITY_REACHED|DAILY_RUN_LIMIT|PROBLEM_NOT_FOUND|IMMUTABLE_RECORD|MUTATION_REUSED)$/.test(error.message))throw error;
          result.errors.push({mutationId:mutation.mutationId,code:error.message,...(error.retryAt?{retryAt:error.retryAt}:{})});
          if(error.message==='CAPACITY_REACHED')break;
        }
      }
      // A push acknowledgement must never advance the client's pull cursor.
      return result;
    },
    async pull({userId,cursor=0,limit=50}){
      if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('INVALID_CURSOR');
      const rows=(await db.prepare(`SELECT c.seq,r.* FROM record_changes c JOIN unified_records r
        ON r.user_id=c.user_id AND r.kind=c.kind AND r.id=c.id
        WHERE c.user_id=? AND c.seq>? ORDER BY c.seq LIMIT ?`).bind(userId,cursor,limit+1).all()).results;
      const page=rows.slice(0,limit);
      return {changes:page.map(row=>({kind:row.kind,id:row.id,...(row.problem_id?{problemId:row.problem_id}:{}),...(row.language?{language:row.language}:{}),revision:row.revision,updatedAt:row.updated_at,deleted:!!row.deleted,payload:row.deleted?null:JSON.parse(row.payload_json)})),nextCursor:page.at(-1)?.seq??cursor,hasMore:rows.length>limit};
    }
  };
}
