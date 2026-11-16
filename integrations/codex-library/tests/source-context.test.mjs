import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Library} from '../codex-plugin/scripts/library.mjs';
import {createServer} from '../codex-plugin/scripts/server.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../.test-output');
await fs.mkdir(base,{recursive:true});
const temp=await fs.mkdtemp(path.join(base,'context-'));const codex=path.join(temp,'codex'),appdata=path.join(temp,'appdata');await fs.mkdir(codex);
const A=path.join(temp,'ICT'),B=path.join(A,'tradeloom'),C=path.join(A,'no-library');
for(const root of [A,B])await fs.mkdir(path.join(root,'procedures'),{recursive:true});await fs.mkdir(C);
await fs.writeFile(path.join(A,'procedures','card.md'),'# A card');
const data={'local-projects':Object.fromEntries([['a','ICT',A],['b','tradeloom',B],['c','No library',C]].map(([id,name,root])=>[id,{id,name,rootPaths:[id==='b'?path.toNamespacedPath(root):root]}])),'thread-project-assignments':{'thread-a':{projectKind:'local',projectId:'a'},'thread-b':{projectKind:'local',projectId:'b'},'thread-c':{projectKind:'local',projectId:'c'}}};
await fs.writeFile(path.join(codex,'.codex-global-state.json'),JSON.stringify(data));
const env={...process.env,CODEX_HOME:codex,LOCALAPPDATA:appdata,CODEX_THREAD_ID:'thread-a'};
const library=new Library({env,action:async()=>({langid:0x0804})});
test('source A/B overrides saved by request, empty libraries stay and unavailable projects are excluded',async()=>{
 await library.select(B);const a=await library.state({threadId:'thread-a'}),b=await library.state({thread_id:'thread-b'});
 assert.equal(a.selectedProject,A);assert.equal(b.selectedProject,B);assert.equal(a.selectionSource,'thread');assert.deepEqual(a.projects.map(x=>x.path),[A,B]);
 assert.equal((await library.state()).selectedProject,B);assert.equal((await library.state()).selectionSource,'saved'); // process environment A is ignored.
 const absent=await library.state({threadId:'thread-c'});assert.equal(absent.selectedProject,C);assert.equal(absent.sourceProject.hasLibrary,false);assert.equal(absent.projects.some(x=>x.path===C),true);assert.equal(await library.hasLibrary(C),false);
 await assert.rejects(()=>library.select(C),/PROJECT_LIBRARY_MISSING/);assert.equal((await library.state()).selectedProject,B);
 await fs.writeFile(library.paths.settings,JSON.stringify({project:C}));const invalid=await library.state();assert.equal(invalid.selectedProject,null);assert.equal(invalid.selectionSource,'none');assert.equal(invalid.projects.some(x=>x.path===C),false);
 const dispatch=createServer(library);const result=await dispatch({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'procedure_library_state',arguments:{threadId:'thread-a'},_meta:{threadId:'thread-b'}}});assert.equal(result.result.structuredContent.selectedProject,B);
 assert.equal((await dispatch({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'procedure_library_state',arguments:{threadId:'thread-a'}}})).result.structuredContent.selectedProject,null);
 assert.equal(await library.hasLibrary(C),false);
});
test('exact SQLite metadata fallback picks the most specific registered project read-only',async()=>{
 const dbPath=path.join(codex,'state_5.sqlite');const db=new DatabaseSync(dbPath);db.exec('CREATE TABLE threads(id TEXT PRIMARY KEY,cwd TEXT)');db.prepare('INSERT INTO threads VALUES (?,?)').run('metadata-only',path.toNamespacedPath(path.join(C,'src')));db.close();
 const before=createHash('sha256').update(await fs.readFile(dbPath)).digest('hex');
 const state=await library.state({threadId:'metadata-only'});assert.equal(state.selectedProject,C);assert.equal(state.sourceProject.hasLibrary,false);
 assert.equal(createHash('sha256').update(await fs.readFile(dbPath)).digest('hex'),before);
});
test('exact unregistered cwd with namespace prefix is a source, not a saved-project guess',async()=>{
 const unregistered=path.join(temp,'unregistered');const empty=path.join(temp,'unregistered-without-library');
 await fs.mkdir(path.join(unregistered,'procedures'),{recursive:true});await fs.mkdir(empty);
 const db=new DatabaseSync(path.join(codex,'state_5.sqlite'));
 db.prepare('INSERT INTO threads VALUES (?,?)').run('unregistered',path.toNamespacedPath(unregistered));
 db.prepare('INSERT INTO threads VALUES (?,?)').run('unregistered-empty',path.toNamespacedPath(empty));db.close();
 await library.select(B);
 const source=await library.state({threadId:'unregistered'});assert.equal(source.selectionSource,'thread');assert.equal(source.selectedProject,unregistered);assert.equal(source.projects.some(x=>x.path===unregistered),true);
 const missing=await library.state({threadId:'unregistered-empty'});assert.equal(missing.selectedProject,empty);assert.equal(missing.sourceProject.hasLibrary,false);assert.equal(missing.projects.some(x=>x.path===empty),true);assert.equal(await library.hasLibrary(empty),false);
});
test('real stdio carries per-request metadata and ignores argument/env identity',()=>{
 const requests=[{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'procedure_library_state',_meta:{threadId:'thread-a'}}},{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'procedure_library_state',_meta:{threadId:'thread-b'}}}];
 const server=fileURLToPath(new URL('../codex-plugin/scripts/server.mjs',import.meta.url));const results=execFileSync(process.execPath,[server],{env,input:requests.map(JSON.stringify).join('\n')+'\n',encoding:'utf8'}).trim().split('\n').map(JSON.parse);
 assert.equal(results[0].result.structuredContent.selectedProject,A);assert.equal(results[1].result.structuredContent.selectedProject,B);
});
