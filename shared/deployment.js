import config from './deployment-config.js';

function exactOrigin(value) {
  if(typeof value!=='string'||!/^https:\/\/[^/?#]+\/?$/.test(value)||/[\s\\*]/.test(value))throw new Error('INVALID_DEPLOYMENT_ORIGIN');
  let url;try{url=new URL(value);}catch{throw new Error('INVALID_DEPLOYMENT_ORIGIN');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash)throw new Error('INVALID_DEPLOYMENT_ORIGIN');
  return url.origin;
}

export function normalizeDeployment(value) {
  const cloudOrigin=exactOrigin(value?.cloudOrigin);
  if(!Array.isArray(value.websiteOrigins)||!value.websiteOrigins.length)throw new Error('INVALID_DEPLOYMENT_ORIGIN');
  const websiteOrigins=[...new Set(value.websiteOrigins.map(exactOrigin))];
  if(!websiteOrigins.includes(cloudOrigin))throw new Error('CLOUD_ORIGIN_NOT_IN_WEBSITES');
  return Object.freeze({cloudOrigin,websiteOrigins:Object.freeze(websiteOrigins)});
}

export const DEPLOYMENT=normalizeDeployment(config);
export const CLOUD_ORIGIN=DEPLOYMENT.cloudOrigin;
export const WEBSITE_ORIGINS=DEPLOYMENT.websiteOrigins;

// Older extension grants had no origin field and were issued only by this
// service. This migration identity must not follow self-hosted configuration.
const LEGACY_DEVICE_ORIGIN='https://acmcoder-unified-preview.pages.dev';
export const matchesStoredOrigin=(value,origin)=>!!value&&(value.origin??LEGACY_DEVICE_ORIGIN)===origin;

export function validateVerificationUrl(value,origin,userCode) {
  let url;try{url=new URL(value);}catch{throw new Error('INVALID_VERIFICATION_URL');}
  if(url.origin!==origin||url.username||url.password||url.pathname!=='/connect.html'||url.hash||
    !/^[A-F0-9]{10}$/.test(userCode||'')||url.searchParams.get('code')!==userCode||
    [...url.searchParams.keys()].length!==1)throw new Error('INVALID_VERIFICATION_URL');
  return url.href;
}
