// CLI-only installation fixture. No authentication, model calls or GUI startup.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'.test-output');await fs.mkdir(output,{recursive:true});
const home=await fs.mkdtemp(path.join(output,'cli-home-'));
assert.equal(path.dirname(await fs.realpath(home)),await fs.realpath(output));
const source=path.resolve(process.env.PLUGIN_SOURCE || root);
const env={...process.env,CODEX_HOME:home};
const cli=process.env.CODEX_CLI || 'codex';
const commands=[];
function run(args){const text=execFileSync(cli,args,{env,encoding:'utf8',timeout:60000});commands.push({args:args.map(x=>x===source?'<source>':x),exit:0});return /^[{[]/.test(text.trim())?JSON.parse(text):text;}
async function hashes(directory,prefix=''){
 const result={};for(const item of await fs.readdir(path.join(directory,prefix),{withFileTypes:true})){
  assert.ok(!item.isSymbolicLink());const relative=path.join(prefix,item.name);
  if(item.isDirectory())Object.assign(result,await hashes(directory,relative));
  else result[relative]=createHash('sha256').update(await fs.readFile(path.join(directory,relative))).digest('hex');
 }return result;
}
try{
 run(['plugin','marketplace','add',source,'--json']);
 run(['plugin','add','procedure-library@procedure-library-local','--json']);
 const listed=run(['plugin','list','--marketplace','procedure-library-local','--json']);
 assert.ok(listed.installed.some(p=>p.pluginId==='procedure-library@procedure-library-local'&&p.version==='0.1.7'&&p.enabled));
 const cache=path.join(home,'plugins/cache/procedure-library-local/procedure-library/0.1.7');
 const expected=await hashes(path.join(source,'codex-plugin'));
 assert.deepEqual(await hashes(cache),expected);
 const lines=execFileSync(process.execPath,[path.join(cache,'scripts/server.mjs')],{cwd:cache,env,encoding:'utf8',input:'{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n'}).trim().split('\n').map(JSON.parse);
 assert.ok(lines[0].result.tools.every(t=>JSON.stringify(t._meta.ui.visibility)==='["app"]'));
 run(['plugin','remove','procedure-library@procedure-library-local']);
 run(['plugin','marketplace','remove','procedure-library-local']);
 const result={commands,version:'0.1.7',runtimeFiles:Object.keys(expected).length,cacheHashesMatch:true,appOnly:true};
 await fs.writeFile(path.join(output,'marketplace-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
 // This exact directory was created by mkdtemp above and never contains user data.
 assert.equal(path.dirname(await fs.realpath(home)),await fs.realpath(output));
 await fs.rm(home,{recursive:true});
}
