// Real headless browser and iframe bridge; this is not native-host acceptance.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Library} from '../codex-plugin/scripts/library.mjs';
import {createServer,VERSION} from '../codex-plugin/scripts/server.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../.test-output');
await fs.mkdir(base,{recursive:true});const temp=await fs.mkdtemp(path.join(base,'browser-'));const project=path.join(temp,'ICT');await fs.mkdir(path.join(project,'procedures'),{recursive:true});
const secondProject=path.join(temp,'tradeloom');const missingProject=path.join(temp,'No library');await fs.mkdir(path.join(secondProject,'procedures'),{recursive:true});await fs.mkdir(missingProject);
const target=path.join(project,'procedures','fixture.md');await fs.writeFile(target,'# Harness card\n<script>window.injected=true</script>');
const env={...process.env,CODEX_HOME:path.join(temp,'codex'),LOCALAPPDATA:path.join(temp,'appdata')};await fs.mkdir(env.CODEX_HOME,{recursive:true});await fs.writeFile(path.join(env.CODEX_HOME,'.codex-global-state.json'),JSON.stringify({'local-projects':{a:{id:'a',name:'ICT',rootPaths:[project]},b:{id:'b',name:'tradeloom',rootPaths:[secondProject]},c:{id:'c',name:'No library',rootPaths:[missingProject]}},'thread-project-assignments':{'thread-a':{projectKind:'local',projectId:'a'},'thread-b':{projectKind:'local',projectId:'b'},'thread-c':{projectKind:'local',projectId:'c'}}}));
let recycleCalls=0;
const library=new Library({env,action:async request=>{if(request.action==='locale')return {langid:0x0804};if(request.action==='recycle'){recycleCalls++;await fs.rename(request.path,path.join(temp,'recycled-fixture.md'));return {recycled:true};}return {opened:true};}});
await library.select(secondProject);
const dispatch=createServer(library);
const app=await fs.readFile(new URL('../codex-plugin/ui/app.html',import.meta.url),'utf8');
const host=`<!doctype html><html><body style="margin:0"><iframe src="/app" style="display:block;border:0;width:100%;height:100vh"></iframe><script>window.calls=[];window.threadId=new URL(location.href).searchParams.get('source')||'thread-a';addEventListener('message',async e=>{if(e.source!==document.querySelector('iframe').contentWindow)return;const d=e.data;if(d.id===undefined)return;let result;if(d.method==='ui/initialize')result={hostCapabilities:{serverTools:true},hostContext:{locale:'zh-CN',sourceThreadId:'11111111-1111-4111-8111-111111111111',cwd:${JSON.stringify(path.toNamespacedPath(project))},secret:'NEVER_UI_LOG'}};else if(d.method==='tools/call'){calls.push(d.params.name);d.params._meta={threadId:window.threadId};const r=await fetch('/rpc',{method:'POST',body:JSON.stringify(d)});const body=await r.json();e.source.postMessage(body,'*');return;}else result={};e.source.postMessage({jsonrpc:'2.0',id:d.id,result},'*');});</script></body></html>`;
const server=http.createServer(async(req,res)=>{if(req.url==='/rpc'){let body='';for await(const part of req)body+=part;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await dispatch(JSON.parse(body))));}else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.url==='/app'?app:host);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const browser=spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--disable-extensions','--user-data-dir='+path.join(temp,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;
try {
 let port;for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(temp,'profile/DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.ok(port,'headless browser must start');
 const page=await (await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 let next=0;const pending=new Map();socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const item=pending.get(data.id);if(item){pending.delete(data.id);data.error?item.reject(new Error(data.error.message)):item.resolve(data.result);}}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const frame="document.querySelector('iframe').contentWindow";
 const wait=async expression=>{for(let i=0;i<100;i++){try{if(await evaluate(expression))return;}catch{}await new Promise(r=>setTimeout(r,50));}throw new Error('UI did not reach expected state: '+expression);};
 await send('Emulation.setDeviceMetricsOverride',{width:1040,height:680,deviceScaleFactor:1.5,mobile:false});
 await wait(frame+'.document.querySelectorAll("#projects option").length>1');
 assert.equal(await evaluate(frame+'.document.getElementById("projects").value'),project);
 assert.equal(await evaluate(frame+'.document.getElementById("build-version").textContent'),'v'+VERSION);
 await evaluate(frame+`.document.getElementById('projects').value=${JSON.stringify(secondProject)};`+frame+`.document.getElementById('projects').dispatchEvent(new Event('change'))`);
 await wait(frame+`.eval(${JSON.stringify("selectionSource==='manual'&&selectedProject==="+JSON.stringify(secondProject))})`);
 const stateCallsBefore=await evaluate("calls.filter(name=>name==='procedure_library_state').length");
 await evaluate(`(()=>{const option=${frame}.document.createElement('option');option.value=${JSON.stringify(missingProject)};option.textContent='stale missing project';${frame}.document.getElementById('projects').append(option);})()`);
 await evaluate(frame+'.document.getElementById("refresh").click()');
 await wait("calls.filter(name=>name==='procedure_library_state').length>"+stateCallsBefore);
 await wait(`!Array.from(${frame}.document.getElementById('projects').options).some(option=>option.value===${JSON.stringify(missingProject)})`);
 assert.equal(await evaluate(frame+'.document.getElementById("projects").value'),secondProject);
 // A previously selected manual folder that no longer has a library cannot survive refresh.
 await evaluate(frame+`.eval(${JSON.stringify(`selectedProject=${JSON.stringify(missingProject)};selectionSource='manual';`)})`);
 await evaluate(frame+'.document.getElementById("refresh").click()');
 await wait(frame+'.document.getElementById("projects").value==='+JSON.stringify(project));
 await evaluate(frame+`.document.getElementById('projects').value=${JSON.stringify(secondProject)};`+frame+`.document.getElementById('projects').dispatchEvent(new Event('change'))`);
 await wait(frame+`.eval(${JSON.stringify("selectionSource==='manual'&&selectedProject==="+JSON.stringify(secondProject))})`);
 await evaluate(frame+`.postMessage({jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params:{locale:'en-US'}},'*')`);
 await wait(frame+'.document.getElementById("central").textContent==="Central library"');
 assert.equal(await evaluate(frame+'.document.getElementById("projects").value'),secondProject);
 await evaluate(frame+`.document.getElementById('projects').value=${JSON.stringify(project)};`+frame+`.document.getElementById('projects').dispatchEvent(new Event('change'))`);
 await wait(frame+'.document.querySelectorAll(".card").length===1');
 await wait('!'+frame+'.document.getElementById("delete").disabled');
 assert.equal(await evaluate(frame+'.injected===true'),false);
 assert.match(await evaluate(frame+'.document.getElementById("content").textContent'),/<script>/);
 await evaluate(frame+'.document.getElementById("search").value="no match";'+frame+'.document.getElementById("search").dispatchEvent(new Event("input"))');
 await wait(frame+'.document.getElementById("title").textContent==="No matching cards"');
 assert.match(await evaluate(frame+'.document.getElementById("status").textContent'),/0 \/ 1/);
 await evaluate(frame+'.document.getElementById("search").value="";'+frame+'.document.getElementById("search").dispatchEvent(new Event("input"))');
 await wait('!'+frame+'.document.getElementById("delete").disabled');
 await evaluate(frame+'.document.getElementById("delete").click()');
 assert.equal(await evaluate(frame+'.document.activeElement.id'),'cancel-delete');
 await evaluate(frame+'.document.getElementById("cancel-delete").click()');assert.equal(recycleCalls,0);await fs.stat(target);
 await evaluate(frame+'.document.getElementById("delete").click();'+frame+'.document.getElementById("confirm-delete").click()');
 await wait(frame+'.document.querySelectorAll(".card").length===0');assert.equal(recycleCalls,1);
 for(const [locale,label] of [['zh-TW','中央庫'],['en-US','Central library']]){
  await evaluate(frame+`.postMessage({jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params:{locale:${JSON.stringify(locale)}}},'*')`);
  await wait(frame+'.document.getElementById("central").textContent==='+JSON.stringify(label));
 }
 const measurements=[];
 for(const width of [390,600,1040]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});
  const measured=await evaluate(`({width:${width},parent:{scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth},app:{scroll:${frame}.document.documentElement.scrollWidth,client:${frame}.document.documentElement.clientWidth,viewport:${frame}.innerWidth}})`);
  measurements.push(measured);console.log('Viewport',JSON.stringify(measured));
  assert.ok(measured.app.scroll<=measured.app.client,'App must fit its actual client width');
 }
 await fs.writeFile(path.join(base,'ui-width-measurements.json'),JSON.stringify(measurements,null,2));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:700,deviceScaleFactor:1,mobile:false});
 await fs.writeFile(path.join(base,'native-app-harness.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await send('Page.navigate',{url:url+'/?source=thread-c'});
 await wait(frame+'.document.getElementById("content").textContent.includes("来源项目")');
 assert.equal(await evaluate(frame+'.document.getElementById("projects").value'),missingProject);
 assert.equal(await evaluate(frame+`.eval('selectedProject')`),missingProject);
 assert.equal(await evaluate(frame+`.document.getElementById('path').textContent`),path.join(missingProject,'procedures'));
 assert.equal(await evaluate(`Array.from(${frame}.document.getElementById('projects').options).some(x=>x.value===${JSON.stringify(missingProject)})`),true);
 await assert.rejects(()=>fs.stat(path.join(missingProject,'procedures')),{code:'ENOENT'});
 console.log('Real iframe bridge passed: source project precedence, manual selection survives refresh/locale, missing-source project selected as the only unavailable-library exception; initialization, app tools, raw text safety, cancellation, one simulated recycle, locale changes, narrow layout. Not native Codex acceptance.');
 await send('Browser.close');
} finally {if(socket?.readyState===WebSocket.OPEN)socket.close();browser.kill();await new Promise(resolve=>server.close(resolve));}
