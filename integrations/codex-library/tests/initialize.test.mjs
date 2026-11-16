import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {Library} from '../codex-plugin/scripts/library.mjs';import {createServer} from '../codex-plugin/scripts/server.mjs';
const base=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1')),'../.test-output');await fs.mkdir(base,{recursive:true});const tmp=await fs.mkdtemp(path.join(base,'init-ui-'));const codex=path.join(tmp,'codex'),root=path.join(tmp,'source'),other=path.join(tmp,'other');await fs.mkdir(root);await fs.mkdir(other);await fs.mkdir(codex,{recursive:true});await fs.writeFile(path.join(codex,'.codex-global-state.json'),JSON.stringify({'local-projects':{s:{id:'s',name:'Source',rootPaths:[root]},o:{id:'o',name:'Other',rootPaths:[other]}},'thread-project-assignments':{source:{projectKind:'local',projectId:'s'}}}));const library=new Library({env:{...process.env,CODEX_HOME:codex,LOCALAPPDATA:path.join(tmp,'appdata')},action:async()=>({langid:2052})});
test('only missing source is selected; explicit initialization creates an empty directory without a private helper',async()=>{const s=await library.state({threadId:'source'});assert.equal(s.selectedProject,root);assert.deepEqual(s.projects.map(x=>x.path),[root]);await assert.rejects(fs.stat(path.join(root,'procedures')));await assert.rejects(library.initializeProject({projectPath:other,expectedPath:path.join(other,'procedures')},{threadId:'source'}));await assert.rejects(library.initializeProject({projectPath:root,expectedPath:other},{threadId:'source'}));const dispatch=createServer(library);const r=await dispatch({id:1,method:'tools/call',params:{name:'procedure_library_initialize',arguments:{projectPath:root,expectedPath:path.join(root,'procedures')},_meta:{threadId:'source'}}});assert.ok(!r.result.isError);assert.deepEqual(await fs.readdir(path.join(root,'procedures')),[]);await fs.writeFile(path.join(root,'procedures','keep.md'),'# Keep');await library.initializeProject({projectPath:root,expectedPath:path.join(root,'procedures')},{threadId:'source'});assert.equal(await fs.readFile(path.join(root,'procedures','keep.md'),'utf8'),'# Keep');await assert.rejects(library.initializeProject({projectPath:root,expectedPath:path.join(root,'procedures')},{}));});


test('existing files and junctions at the library path are rejected',async()=>{
 const fileRoot=path.join(tmp,'file-root'),linkRoot=path.join(tmp,'link-root'),outside=path.join(tmp,'outside');
 for(const directory of [fileRoot,linkRoot,outside])await fs.mkdir(directory);
 await fs.writeFile(path.join(fileRoot,'procedures'),'not a directory');
 await fs.symlink(outside,path.join(linkRoot,'procedures'),'junction');
 const previous=JSON.parse(await fs.readFile(path.join(codex,'.codex-global-state.json'),'utf8'));
 for(const [id,root]of [['file',fileRoot],['link',linkRoot]]){
  previous['local-projects'][id]={id,name:id,rootPaths:[root]};previous['thread-project-assignments'][id]={projectKind:'local',projectId:id};
 }
 await fs.writeFile(path.join(codex,'.codex-global-state.json'),JSON.stringify(previous));
 for(const [id,root]of [['file',fileRoot],['link',linkRoot]])await assert.rejects(library.initializeProject({projectPath:root,expectedPath:path.join(root,'procedures')},{threadId:id}),/real directory/);
 assert.deepEqual(await fs.readdir(outside),[]);
});
