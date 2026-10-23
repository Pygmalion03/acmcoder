// New answers are saved per turn. Existing aggregate conversations remain
// readable and exportable without rewriting the user's original history.
export async function conversationTurnId({problemId,language,requestId}) {
  const bytes=new TextEncoder().encode(JSON.stringify([problemId,language,requestId]));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return `turn-${Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')}`;
}

export async function readConversationPage(store,{problemId,language,cursor=null,pageSize=20}) {
  pageSize=Math.max(2,Math.min(100,Math.floor(pageSize)||20));
  async function readLegacy(at,remaining){
    const messages=[];let position=at||{records:null};
    while(position){
      // Old imports and conflict copies may have a non-canonical ID. Read
      // their records too, one bounded legacy record at a time.
      const page=await store.listConversationTurns({problemId,language,legacy:true,cursor:position.records,limit:1});
      const old=page.items[0]?.payload.messages||[];
      const end=Math.min(old.length,position.end??old.length),start=Math.max(0,end-remaining);
      messages.unshift(...old.slice(start,end));remaining-=end-start;
      position=start?{records:position.records,end:start}:page.nextCursor?{records:page.nextCursor}:null;
      if(!remaining)break;
    }
    return {messages,nextCursor:position?{legacy:position}:null};
  }
  if(cursor?.legacy)return readLegacy(cursor.legacy,pageSize);
  const page=await store.listConversationTurns({problemId,language,cursor:cursor?.turns||null,limit:Math.floor(pageSize/2)});
  const messages=[...page.items].reverse().flatMap(record=>record.payload.messages);
  if(page.nextCursor)return {messages,nextCursor:{turns:page.nextCursor}};
  const old=await readLegacy(null,pageSize-messages.length);
  return {messages:[...old.messages,...messages],nextCursor:old.nextCursor};
}
