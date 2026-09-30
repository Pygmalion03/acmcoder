// Only used on checksum-pinned compiler binaries at build time. No user module
// rewriting: wasm-ld emits the user program's limit itself.
export function limitWasmMemory(input, maximumPages) {
  const bytes=new Uint8Array(input);
  if(!Number.isSafeInteger(maximumPages)||maximumPages<1||maximumPages>65536)throw new Error('Invalid WASM memory limit');
  if(bytes.length<8||[0,97,115,109,1,0,0,0].some((n,i)=>bytes[i]!==n))throw new Error('Invalid WASM header');
  function read(offset,end=bytes.length){let value=0,shift=0,start=offset;
    while(offset<end&&offset-start<5){const b=bytes[offset++];if(shift===28&&(b&127)>15)throw new Error('Invalid WASM integer');value+=(b&127)*2**shift;if(!(b&128))return {value,next:offset};shift+=7;}
    throw new Error('Truncated WASM integer');
  }
  function encode(value){const out=[];do{const b=value%128;value=Math.floor(value/128);out.push(b|(value?128:0));}while(value);return out;}
  let offset=8,found=null;
  while(offset<bytes.length){const start=offset,id=bytes[offset++],size=read(offset);offset=size.next;const end=offset+size.value;if(end>bytes.length)throw new Error('Truncated WASM section');
    if(id===5){if(found)throw new Error('Duplicate WASM memory section');const count=read(offset,end);if(count.value!==1)throw new Error('Expected one compiler memory');const flags=read(count.next,end);if(flags.value!==0&&flags.value!==1)throw new Error('Unsupported compiler memory');const min=read(flags.next,end);let cursor=min.next,max=maximumPages;
      if(flags.value===1){const old=read(cursor,end);cursor=old.next;max=Math.min(max,old.value);}
      if(cursor!==end||min.value>max)throw new Error('Compiler memory exceeds limit');
      const payload=[1,1,...encode(min.value),...encode(max)];found={start,end,replacement:[5,...encode(payload.length),...payload]};
    }
    offset=end;
  }
  if(!found)throw new Error('Missing compiler memory');
  const output=new Uint8Array(found.start+found.replacement.length+bytes.length-found.end);
  output.set(bytes.subarray(0,found.start));output.set(found.replacement,found.start);output.set(bytes.subarray(found.end),found.start+found.replacement.length);return output;
}
