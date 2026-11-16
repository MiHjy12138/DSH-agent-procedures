import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {Library,windowsAction} from '../codex-plugin/scripts/library.mjs';
import {tools,URI,MIME,VERSION} from '../codex-plugin/scripts/server.mjs';
const manifestVersion=JSON.parse(await fs.readFile(new URL('../codex-plugin/.codex-plugin/plugin.json',import.meta.url),'utf8')).version;
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../.test-output');
await fs.mkdir(base,{recursive:true});
const fixture=await fs.mkdtemp(path.join(base,'data-'));
const env={...process.env,CODEX_HOME:path.join(fixture,'codex'),LOCALAPPDATA:path.join(fixture,'appdata')};
const root=path.join(fixture,'ICT');await fs.mkdir(path.join(root,'procedures'),{recursive:true});await fs.mkdir(env.CODEX_HOME,{recursive:true});
await fs.writeFile(path.join(env.CODEX_HOME,'.codex-global-state.json'),JSON.stringify({'local-projects':{a:{name:'ICT',rootPaths:[root]},b:{name:'tradeloom',rootPaths:[path.join(root,'tradeloom'),root]}}}));
const card=path.join(root,'procedures','中文 空格.md');await fs.writeFile(card,'\ufeff# 原文标题\nUTF-8 凭证\n<script>must remain text</script>');await fs.writeFile(path.join(root,'procedures','INDEX.md'),'# support');
const context={library:'project',projectPath:root};
test('stdio native protocol, app resource and visibility',()=>{
 assert.equal(VERSION,manifestVersion);
 const server=fileURLToPath(new URL('../codex-plugin/scripts/server.mjs',import.meta.url));
 const requests=[{id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}},{method:'notifications/initialized'},{id:2,method:'tools/list'},{id:3,method:'resources/list'},{id:4,method:'resources/read',params:{uri:URI}},{id:5,method:'tools/call',params:{name:'procedure_library_list',arguments:context}},{id:6,method:'tools/call',params:{name:'bad'}}];
 const lines=execFileSync(process.execPath,[server],{input:requests.map(x=>JSON.stringify({jsonrpc:'2.0',...x})).join('\n')+'\n',encoding:'utf8',env}).trim().split('\n').map(JSON.parse);
 assert.equal(lines.length,6);assert.equal(lines[0].result.serverInfo.version,VERSION);assert.equal(lines[1].result.tools[0]._meta.ui.resourceUri,`ui://procedure-library/app/${VERSION}`);assert.equal(lines[1].result.tools.filter(t=>t._meta.ui.visibility.includes('model')).length,0);
 assert.deepEqual(lines[1].result.tools[0]._meta['openai/ui'].entrypoints,[{type:'global'},{type:'thread'}]);
 assert.equal(lines[3].result.contents[0].mimeType,MIME);assert.match(lines[3].result.contents[0].text,/ui\/initialize/);assert.doesNotMatch(lines[3].result.contents[0].text,/<(?:script|link)[^>]+(?:src|href)=["']https?:/i);
 assert.match(lines[3].result.contents[0].text,new RegExp('v'+VERSION.replaceAll('.','\\.')));
 assert.ok(lines[3].result.contents[0].text.includes(`appInfo:{name:'procedure-library',version:'${VERSION}'}`));
 assert.equal(lines[4].result.structuredContent.cards.length,1);assert.equal(lines[5].result.isError,true);
 assert.equal(tools.find(x=>x.name==='procedure_library_recycle').annotations.destructiveHint,true);
 assert.equal(tools.filter(x=>x.annotations.destructiveHint).length,1);
 for(const tool of lines[1].result.tools.filter(x=>x.name!=='procedure_library_open')){assert.equal(tool._meta.ui.resourceUri,undefined);assert.equal(tool._meta['openai/ui'],undefined);assert.deepEqual(tool._meta.ui.visibility,['app']);}
 assert.equal(lines[4].result._meta,undefined);assert.equal(lines[4].result.structuredContent.resourceUri,undefined);
});
test('actual file/settings consumer: project scope, search, target protection and text',async()=>{
 const library=new Library({env,action:async request=>request.action==='locale'?{langid:0x0804}:{}});
 const state=await library.state();assert.equal(state.projects.length,1);assert.equal(state.projects[0].path,root);
 await library.select(root);assert.equal((await new Library({env,action:library.action}).state()).selectedProject,root);
 assert.equal((await library.list({...context,query:'原文 UTF-8'})).cards.length,1);const filtered=await library.list({...context,query:'unmatched'});assert.equal(filtered.cards.length,0);assert.equal(filtered.total,1);
 const data=await library.read({...context,name:'中文 空格.md',expectedPath:card});assert.match(data.text,/<script>/);assert.equal(data.text.charCodeAt(0),35);
 for(const name of ['INDEX.md','../outside.md','procedures','bad.txt'])await assert.rejects(()=>library.target({...context,name,expectedPath:path.join(root,'procedures',name)}));
 await assert.rejects(()=>library.target({...context,name:'中文 空格.md',expectedPath:card+'wrong'}));
 const directory=path.join(root,'procedures','directory.md');await fs.mkdir(directory);await assert.rejects(()=>library.target({...context,name:'directory.md',expectedPath:directory}));
 const outside=path.join(fixture,'outside');await fs.mkdir(outside);const linked=path.join(fixture,'linked');await fs.mkdir(linked);await fs.symlink(outside,path.join(linked,'procedures'),'junction');
 await fs.writeFile(path.join(outside,'card.md'),'outside');await assert.rejects(()=>library.target({library:'project',projectPath:linked,name:'card.md',expectedPath:path.join(linked,'procedures','card.md')}));
 const blocked=new Library({env,action:async()=>({recycled:false})});await assert.rejects(()=>blocked.recycle({...context,name:'中文 空格.md',expectedPath:card}));assert.equal((await fs.stat(card)).isFile(),true);
});
test('upstream metadata files are excluded from listing, reading and recycling case-insensitively',async()=>{
 let actions=0;const library=new Library({env,action:async()=>{actions++;return {recycled:true};}});
 const names=['rEaDmE.MD','INDEX.template.md','_layers.md','PROJECT.md'];
 for(const name of names)await fs.writeFile(path.join(root,'procedures',name),'# Metadata fixture');
 const listed=await library.list(context);
 assert.ok(names.every(name=>!listed.cards.some(card=>card.name.toLowerCase()===name.toLowerCase())));
 for(const name of names){const expectedPath=path.join(root,'procedures',name);const args={...context,name,expectedPath};
  await assert.rejects(library.read(args));await assert.rejects(library.recycle(args));
  assert.equal(await fs.readFile(expectedPath,'utf8'),'# Metadata fixture');
 }
 assert.equal(actions,0);
});

test('one real Windows Recycle Bin move of a Unicode space fixture',async()=>{
 const name='原生插件 回收验证.md';const target=path.join(root,'procedures',name);await fs.writeFile(target,'# test fixture');
 const library=new Library({env,action:windowsAction});const result=await library.recycle({...context,name,expectedPath:target});assert.equal(result.recycled,true);await assert.rejects(()=>fs.stat(target),{code:'ENOENT'});
 await fs.writeFile(path.join(base,'recycle-fixture.json'),JSON.stringify({path:target,directory:path.dirname(target),name}));
 console.log('Recycled unique fixture:',target);
});
