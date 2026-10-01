const namedEntities={amp:'&',apos:"'",gt:'>',lt:'<',nbsp:' ',quot:'"'};

// Convert content to data, never render third-party HTML in the workspace.
export function htmlToText(html){
  const plain=String(html||'')
    .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,'')
    .replace(/<!--[\s\S]*?-->/g,'')
    .replace(/<\s*br\s*\/?\s*>/gi,'\n')
    .replace(/<\s*sup\b[^>]*>/gi,'^')
    .replace(/<\s*sub\b[^>]*>/gi,'_')
    .replace(/<\s*li\b[^>]*>/gi,'- ')
    .replace(/<\s*\/\s*(p|div|pre|li|ul|ol|h[1-6]|table|tr)\s*>/gi,'\n\n')
    .replace(/<[^>]+>/g,'');
  return plain.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(match,entity)=>{
    if(entity[0]!=='#')return namedEntities[entity.toLowerCase()]??match;
    const hex=entity[1]?.toLowerCase()==='x';
    const point=Number.parseInt(entity.slice(hex?2:1),hex?16:10);
    return Number.isFinite(point)&&point>=0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):match;
  }).replace(/\u00a0/g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

export function extractRawSamples(statement){
  return [...String(statement||'').matchAll(/(?:^|\n)[ \t]*(?:示例|Example)\s*\d+[^\n]*[\s\S]*?(?=\n[ \t]*(?:(?:示例|Example)\s*\d+|(?:提示|Constraints|Follow[- ]?up|进阶|约束)\s*[:：]?)|\s*$)/gi)]
    .map(match=>match[0].trim()).filter(Boolean);
}
