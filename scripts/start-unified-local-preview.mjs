import path from 'node:path';
import os from 'node:os';
import {createAcmcoderServer} from '../src/server/server.js';
const directory=path.join(os.tmpdir(),'acmcoder-unified-local-preview');
const server=createAcmcoderServer({unifiedDataDir:path.join(directory,'learning'),credentialDir:path.join(directory,'credentials'),assistSettingsFile:path.join(directory,'legacy/settings.json'),memoryFile:path.join(directory,'legacy/pages.jsonl'),currentMemoryFile:path.join(directory,'legacy/current.json'),progressFile:path.join(directory,'legacy/progress.json')});
server.listen(43118,'127.0.0.1',()=>console.log('Isolated local unified preview http://127.0.0.1:43118/workspace.html'));
