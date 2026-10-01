import {onRequest} from './functions/api/[[path]].js';

// Advanced-mode Pages entry. Keep the existing API handler and use the Pages
// asset binding for everything else; user language resources remain static.
export default {
  fetch(request,env,executionContext){
    if(new URL(request.url).pathname.startsWith('/api/')){
      return onRequest({request,env,waitUntil:promise=>executionContext.waitUntil(promise)});
    }
    return env.ASSETS.fetch(request);
  }
};
