// Language changes cancel the previous task before entering another sandbox.
export function createMultiRunner(runners){
  let active=null;
  return {run(input,onEvent){const runner=runners[input.language];if(!runner)return Promise.reject(new Error('此端暂不支持该语言。'));if(active)active.runner.cancel(active.id);const task={id:input.id,runner};active=task;return runner.run(input,onEvent).finally(()=>{if(active===task)active=null;});},cancel(id){if(active?.id===id)active.runner.cancel(id);},destroy(){for(const runner of Object.values(runners))runner.destroy?.();active=null;}};
}
