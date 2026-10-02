// Experimental cumulative allocation bound, before host array/object creation.
// This is deliberately not a claim of an exact Java GC heap size.
function installJavaAllocationQuota(Doppio,{limit=64*1024*1024,onExceeded=()=>{}}={}){
  let allocated=0;
  function charge(bytes){
    if(!Number.isSafeInteger(bytes)||bytes<0||bytes>limit-allocated){onExceeded();throw new Error('Java cumulative allocation limit exceeded');}
    allocated+=bytes;
  }
  const classes=Doppio.VM.ClassFile;
  for(const [Class,isArray] of [[classes.ArrayClassData,true],[classes.ReferenceClassData,false]]){
    const construct=Class.prototype._constructConstructor;
    Class.prototype._constructConstructor=function(thread){
      // Doppio emits constructors with new Function. Reject class-file strings
      // that could escape those generated identifiers/string literals, and
      // bound expansion before a small class file can generate enormous JS.
      const className=this.getInternalName();
      if(!/^[\p{ID_Continue}$_/;\[\]]+$/u.test(className))throw new Error('Unsupported Java class name');
      let generated=256+className.length*4;
      for(const member of [...(this.getMethods?.()||[]),...(this.fields||[])]){
        if(!/^[$_\p{ID_Continue}]+$/u.test(member.name)&&!['<init>','<clinit>'].includes(member.name))throw new Error('Unsupported Java member name');
        if(!/^[$_\p{ID_Continue}/;\[\]()]+$/u.test(member.rawDescriptor))throw new Error('Unsupported Java descriptor');
        generated+=512+(member.name.length+member.rawDescriptor.length)*8;
      }
      if(generated>2*1024*1024)charge(limit+1);else charge(generated);
      const original=construct.call(this,thread),cls=this;
      const stride=isArray?({B:1,Z:1,C:2,S:2,I:4,F:4,D:8}[this.componentClassName[0]]||32):0;
      const wrapped=new Proxy(original,{construct(target,args,newTarget){
        const lengths=args[1],length=isArray?(typeof lengths==='number'?lengths:lengths?.[0]):0;
        charge(256+(isArray?Math.max(0,length||0)*stride:(cls._objectFields?.length||0)*32));
        return Reflect.construct(target,args,newTarget);
      }});
      original.prototype.constructor=wrapped;
      if(isArray){const slice=original.prototype.slice;original.prototype.slice=function(start=0,end=this.array.length){const size=this.array.length;const normalized=value=>value<0?Math.max(size+value,0):Math.min(value,size);charge(Math.max(0,normalized(end)-normalized(start))*stride);return slice.call(this,start,end);};}
      return wrapped;
    };
  }
  return {begin(bytes=limit){limit=bytes;allocated=0;},usage:()=>({allocated,limit}),protectFiles(fs){
    // Java file writes otherwise retain host buffers outside managed arrays.
    const write=fs.write;fs.write=function(...args){const bytes=typeof args[1]==='string'?new TextEncoder().encode(args[1]).length:args[3];charge(bytes);return write.apply(this,args);};
  },protect(vm){
    const heap=vm.getHeap(),malloc=heap.malloc;
    heap.malloc=function(bytes){charge(bytes);return malloc.call(this,bytes);};
    vm.registerNatives({'doppio/JavaScript':{'eval(Ljava/lang/String;)Ljava/lang/String;':thread=>thread.throwNewException('Ljava/lang/SecurityException;','JavaScript interop is disabled in ACM practice')}});
  }};
}
