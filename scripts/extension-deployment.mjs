import {normalizeDeployment} from '../shared/deployment.js';

export function configureExtensionManifest(source,configuration){
  const {cloudOrigin,websiteOrigins}=normalizeDeployment(configuration),manifest=structuredClone(source);
  // These are the fixed capture/local-service permissions. Account and
  // website permissions are derived from the same public deployment config.
  manifest.host_permissions=['https://leetcode.cn/*','https://leetcode.com/*','http://127.0.0.1:43117/*',
    ...[...new Set([cloudOrigin,...websiteOrigins])].map(origin=>`${origin}/*`)];
  const bridge=manifest.content_scripts.find(script=>script.js.includes('website-bridge.js'));
  if(!bridge)throw new Error('Website handoff bridge is missing from the extension manifest');
  bridge.matches=websiteOrigins.map(origin=>`${origin}/*`);
  return manifest;
}
