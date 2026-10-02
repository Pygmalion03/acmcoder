// Install before Doppio captures the browser's Node scheduling primitives.
// MessageChannel avoids the nested setTimeout clamp during javac execution.
BrowserFS.install(self);
const immediateChannel=new MessageChannel(),immediateJobs=new Map();let immediateId=0;
self.setImmediate=(callback,...args)=>{const id=++immediateId;immediateJobs.set(id,()=>callback(...args));immediateChannel.port2.postMessage(id);return id;};
self.clearImmediate=id=>immediateJobs.delete(id);
immediateChannel.port1.onmessage=({data})=>{const job=immediateJobs.get(data);immediateJobs.delete(data);job?.();};
