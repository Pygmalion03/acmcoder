import test from 'node:test';
import assert from 'node:assert/strict';
import {createCredentialVault} from '../shared/credential-vault.js';

const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),values};};
test('session credentials stay in memory, clear immediately disables access',async()=>{
 const disk=storage(),vault=createCredentialVault({storage:disk});await vault.set('https://provider.test/v1','test-only-key');assert.equal(vault.get('https://provider.test/v1'),'test-only-key');assert.equal(vault.get('https://other.test/v1'),null);assert.equal(disk.values.size,0);vault.clear();assert.equal(vault.get('https://provider.test/v1'),null);
});
test('remembered credentials are encrypted, locked on reopen and use fresh salt and IV',async()=>{
 const disk=storage(),vault=createCredentialVault({storage:disk});await vault.set('provider','test-only-key',{password:'test passphrase',remember:true});const first=disk.getItem('acmcoder-ai-vault-v1');assert.ok(!first.includes('test-only-key'));assert.ok(!first.includes('test passphrase'));
 vault.lock();assert.equal(vault.get('provider'),null);await assert.rejects(vault.unlock('wrong'),/解锁失败/);await vault.unlock('test passphrase');assert.equal(vault.get('provider'),'test-only-key');
 await vault.set('provider','test-only-key',{password:'test passphrase',remember:true});assert.notEqual(disk.getItem('acmcoder-ai-vault-v1'),first);
 const reopened=createCredentialVault({storage:disk});assert.equal(reopened.status(),'locked');await reopened.unlock('test passphrase');assert.equal(reopened.get('provider'),'test-only-key');reopened.clear();assert.equal(disk.values.size,0);
});
