import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';

export const SUPPORT = new Set(['index.md','classify.md','_模板.md','source.md','license','_inbox.md','readme.md','index.template.md','_layers.md','project.md']);
function projectRoot(value) {
  // Codex metadata can use Win32 extended-length paths; compare the same normal form.
  const ordinary=value.startsWith('\\\\?\\UNC\\')?'\\\\'+value.slice(8):value.startsWith('\\\\?\\')?value.slice(4):value;
  return path.resolve(ordinary);
}
export function locations(env=process.env) {
  const home=env.USERPROFILE || os.homedir();
  return {codex:path.resolve(env.CODEX_HOME || path.join(home,'.codex')),settings:path.join(env.LOCALAPPDATA || path.join(home,'AppData','Local'),'ProcedureLibraryViewer','settings.json')};
}
async function readJson(file,fallback) {try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return fallback;}}
export function windowsAction(request) {
  return new Promise((resolve,reject)=>{
    const script=fileURLToPath(new URL('./windows-actions.ps1',import.meta.url));
    const shell=path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const child=execFile(shell,['-NoProfile','-NonInteractive','-File',script],{windowsHide:true,encoding:'utf8',timeout:30000},(error,stdout,stderr)=>{
      if(error)return reject(new Error(stderr.trim() || error.message));
      try{resolve(JSON.parse(stdout.replace(/^\uFEFF/,'')));}catch{reject(new Error('Windows action returned invalid data.'));}
    });
    child.stdin.end(JSON.stringify(request));
  });
}
export class Library {
  constructor({env=process.env,action=windowsAction,threadCwd}={}) {this.paths=locations(env);this.action=action;this.threadCwd=threadCwd || (id=>this.readThreadCwd(id));}
  async hasLibrary(root) {
    try {const directory=path.join(root,'procedures');const stat=await fs.lstat(directory);return stat.isDirectory()&&!stat.isSymbolicLink()&&await fs.realpath(directory)===directory;}catch{return false;}
  }
  async readThreadCwd(id) {
    // Metadata only, exact thread key, read-only SQLite. Never inspect conversation bodies.
    let files;try{files=(await fs.readdir(this.paths.codex)).filter(name=>/^state_\d+\.sqlite$/.test(name)).sort((a,b)=>Number(b.match(/\d+/)[0])-Number(a.match(/\d+/)[0]));}catch{return null;}
    if(!files.length)return null;
    let db;
    try {
      const {DatabaseSync}=await import('node:sqlite');
      db=new DatabaseSync(path.join(this.paths.codex,files[0]),{readOnly:true});
      db.exec('PRAGMA query_only=ON');
      const row=db.prepare('SELECT cwd FROM threads WHERE id = ? LIMIT 1').get(id);
      return typeof row?.cwd==='string'?row.cwd:null;
    }catch{return null;}finally{db?.close();}
  }
  async state(meta={}) {
    const data=await readJson(path.join(this.paths.codex,'.codex-global-state.json'),{});
    const records=data['local-projects'];
    const values=Array.isArray(records)?records:Object.values(records && typeof records==='object'?records:{});
    const registered=values.filter(x=>x && typeof x.name==='string' && Array.isArray(x.rootPaths) && typeof x.rootPaths[0]==='string'&&path.isAbsolute(x.rootPaths[0])).map(x=>({id:x.id,label:x.name,path:projectRoot(x.rootPaths[0])}));
    const projects=[];for(const item of registered)if(await this.hasLibrary(item.path))projects.push({label:item.label,path:item.path});
    const saved=await readJson(this.paths.settings,{});
    const savedPath=typeof saved.project==='string'&&path.isAbsolute(saved.project)?projectRoot(saved.project):null;
    const validSaved=savedPath&&await this.hasLibrary(savedPath)?savedPath:null;
    if(validSaved&&!projects.some(x=>x.path===validSaved))projects.push({label:path.basename(validSaved),path:validSaved});
    const threadId=typeof meta?.threadId==='string'&&meta.threadId.trim()?meta.threadId.trim():typeof meta?.thread_id==='string'&&meta.thread_id.trim()?meta.thread_id.trim():null;
    let sourceProject=null;
    if(threadId) {
      const assignments=data['thread-project-assignments'];
      const assignment=assignments&&Object.hasOwn(assignments,threadId)?assignments[threadId]:null;
      let source=assignment?.projectKind==='local'?registered.find(x=>x.id===assignment.projectId):null;
      if(!source) {
        const cwd=await this.threadCwd(threadId);
        if(typeof cwd==='string'&&path.isAbsolute(cwd)) {
          const root=projectRoot(cwd);
          source=registered.filter(x=>{const relative=path.relative(x.path,root);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}).sort((a,b)=>b.path.length-a.path.length)[0];
          if(!source)try{if((await fs.stat(root)).isDirectory())source={label:path.basename(root),path:root};}catch{}
        }
      }
      if(source)sourceProject={label:source.label,path:source.path,hasLibrary:await this.hasLibrary(source.path)};
    }
    if(sourceProject&&!projects.some(x=>x.path===sourceProject.path))projects.push({label:sourceProject.label,path:sourceProject.path});
    let langid=0x0409;
    try{langid=(await this.action({action:'locale'})).langid;}catch{}
    return {projects,selectedProject:sourceProject?.path || validSaved,selectionSource:sourceProject?'thread':validSaved?'saved':'none',sourceProject,centralPath:path.join(this.paths.codex,'procedures'),langid};
  }
  async select(projectPath) {
    if(typeof projectPath!=='string' || !projectPath.trim() || !path.isAbsolute(projectPath))throw new Error('Choose an absolute project root.');
    const root=projectRoot(projectPath);
    if(!(await fs.stat(root)).isDirectory())throw new Error('The project root is not a directory.');
    if(!await this.hasLibrary(root))throw new Error('PROJECT_LIBRARY_MISSING');
    await fs.mkdir(path.dirname(this.paths.settings),{recursive:true});
    const temporary=this.paths.settings+'.'+process.pid+'.tmp';
    await fs.writeFile(temporary,JSON.stringify({project:root},null,2),'utf8');
    await fs.rename(temporary,this.paths.settings);
    return {selectedProject:root};
  }
  async initializeProject({projectPath,expectedPath},meta={}) {
    const state=await this.state(meta);
    const source=state.sourceProject;
    if(!source || typeof projectPath!=='string' || !path.isAbsolute(projectPath) || projectRoot(projectPath)!==source.path)throw new Error('Initialization requires the current source project.');
    const root=await fs.realpath(source.path);
    if(root!==source.path || !(await fs.lstat(root)).isDirectory())throw new Error('The source root must be a real project directory.');
    const library=path.join(root,'procedures');
    if(expectedPath!==library)throw new Error('The displayed library path changed.');
    let created=false;
    try {await fs.mkdir(library);created=true;}
    catch(error) {if(error.code!=='EEXIST')throw error;}
    if(!await this.hasLibrary(root))throw new Error('The project library must be a real directory.');
    return {projectPath:root,path:library,created};
  }
  root({library,projectPath}) {
    if(library==='central')return path.join(this.paths.codex,'procedures');
    if(library!=='project' || typeof projectPath!=='string' || !path.isAbsolute(projectPath))throw new Error('Choose a project first.');
    return path.join(path.resolve(projectPath),'procedures');
  }
  async list(args) {
    const root=this.root(args);let entries;
    try{entries=await fs.readdir(root,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return {path:root,exists:false,cards:[],total:0};throw e;}
    const cards=[];let total=0;
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
      if(!entry.isFile() || !entry.name.toLowerCase().endsWith('.md') || SUPPORT.has(entry.name.toLowerCase()))continue;
      total++;
      const file=path.join(root,entry.name);
      try {
        const text=new TextDecoder('utf-8',{fatal:true}).decode(await fs.readFile(file)).replace(/^\uFEFF/,'');
        const title=text.split(/\r?\n/).find(line=>line.startsWith('# '))?.slice(2).trim() || entry.name.slice(0,-3);
        const words=String(args.query || '').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
        if(words.every(word=>(title+'\n'+entry.name+'\n'+text).toLocaleLowerCase().includes(word)))cards.push({name:entry.name,title,path:file});
      } catch(e){cards.push({name:entry.name,title:entry.name,path:file,error:e.message});}
    }
    return {path:root,exists:true,cards,total};
  }
  async target(args) {
    const root=this.root(args);const name=args.name;
    if(typeof name!=='string' || path.basename(name)!==name || !name.toLowerCase().endsWith('.md') || SUPPORT.has(name.toLowerCase()))throw new Error('Only a card directly inside this library is allowed.');
    const target=path.join(root,name);
    if(args.expectedPath!==target)throw new Error('The displayed card path changed. Refresh and select it again.');
    if(await fs.realpath(root)!==root)throw new Error('Linked library folders cannot be modified.');
    const stat=await fs.lstat(target);
    if(!stat.isFile() || stat.isSymbolicLink() || await fs.realpath(target)!==target)throw new Error('Folders and linked files are not cards.');
    return target;
  }
  async read(args) {const target=await this.target(args);return {path:target,text:new TextDecoder('utf-8',{fatal:true}).decode(await fs.readFile(target)).replace(/^\uFEFF/,'')};}
  async recycle(args) {
    const target=await this.target(args);
    const result=await this.action({action:'recycle',path:target});
    if(result.recycled!==true)throw new Error('The Recycle Bin operation was not completed.');
    try{await fs.lstat(target);throw new Error('The file still exists.');}catch(e){if(e.code!=='ENOENT')throw e;}
    return {recycled:true,path:target};
  }
  async openFolder(args) {
    const root=this.root(args);
    if(!(await fs.stat(root)).isDirectory())throw new Error('The library folder does not exist.');
    return this.action({action:'open',path:root});
  }
}
