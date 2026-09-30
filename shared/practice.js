import { validateRecord } from './records.js';

export const templates = { python: 'import sys\n\n', cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}\n', java: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n    }\n}\n' };
export const draftId = ({ problemId, language }) => `${problemId}--${language}`;
export function normalizeDraft(input) {
  const record = validateRecord({ kind:'draft', id:input.id || draftId(input), problemId:input.problemId, language:input.language,
    payload:{ code:input.code,stdin:input.stdin,expected:input.expected,mode:input.mode || 'normal',previousAttemptId:input.previousAttemptId ?? null } });
  return { ...record.payload, id:record.id,problemId:record.problemId,language:record.language,updatedAt:Date.now() };
}
export function snapshot(draft, reason) {
  return { ...draft,id:crypto.randomUUID(),reason,createdAt:Date.now() };
}

export function createPracticeController({ store,runner,onChange = () => {} }) {
  let selected = null;
  let epoch = 0;
  let running = null;
  return {
    async select({problemId,language}) {
      const current = ++epoch;
      if (running) runner.cancel(running);
      selected = {problemId,language};
      const draft = await store.getDraft(selected);
      if (current === epoch) onChange({type:'draft',draft});
      return draft;
    },
    save(draft) { return store.saveDraft(draft); },
    async run(draft) {
      await store.saveDraft(draft);
      const current = epoch;
      const id = crypto.randomUUID(); running = id;
      return runner.run({id,language:draft.language,code:draft.code,stdin:draft.stdin},event => {
        if (current === epoch && running === id) onChange({type:'run',event,problemId:draft.problemId});
      });
    },
    cancel() { if (running) runner.cancel(running); running = null; }
  };
}
