import { validateRecord } from './records.js';
export function normalizeProblem(input) {
  return validateRecord({kind:'problem',id:'import',payload:{...input}}).payload;
}
export function parseImportInput(text) {
  const value=String(text).trim();
  if (/^https?:\/\//i.test(value)) return {type:'url',value:new URL(value).href};
  if (value.startsWith('{') || value.startsWith('[')) return {type:'json',value:JSON.parse(value)};
  return {type:'text',value};
}
