import {listProjects,getProject,createProject,updateProject,removeProject,listFiles,putFile,deleteFile,renameFile,getPdf,savePdf,safePath,textFile,templateFor} from './db.js';
import {importProjectZip,exportProjectZip,downloadBlob} from './archive.js';
import {compileLatex,prepareOffline,cachedPackageCount} from './compiler.js';

const $=id=>document.getElementById(id);
const state={project:null,files:[],activePath:null,openTabs:[],editor:null,pending:new Map(),saveTimeout:null,saving:null,compiledPdf:null,pdfUrl:null,compiling:false,busy:false};
const idPath=(p,path)=>`${p}\u0000${path}`;
const safeName=(name)=>String(name||'document').replace(/[\\/:*?"<>|]/g,'_');
let toastTimeout;
function toast(message,ms=3200){const el=$('toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{el.hidden=true;},ms);}
function setSaveStatus(message){$('saveStatus').textContent=message;}
function setConnection(){const online=navigator.onLine;$('connectionText').textContent=online?'Local projects · Stored on this device':'Offline · Local files available';$('connectionDot').classList.toggle('offline',!online);}
function mobileView(view){if(!['files','editor','pdf'].includes(view))return;document.body.dataset.view=view;document.querySelectorAll('.mobile-tab').forEach(el=>el.classList.toggle('active',el.dataset.target===view));if(view==='editor')setTimeout(()=>state.editor?.refresh(),50);}
function getActive(){return state.files.find(f=>f.path===state.activePath)||null;}
function fmtBytes(n){return n>1024*1024?(n/1024/1024).toFixed(1)+' MB':Math.max(1,Math.ceil(n/1024))+' KB';}
function showModal(title,render,actions=[]){
  const m=$('modal');$('modalTitle').textContent=title;const body=$('modalBody');body.replaceChildren();
  if(typeof render==='string')body.innerHTML=render;else if(render)body.append(render);
  const footer=$('modalActions');footer.replaceChildren();
  for(const action of actions){
    const b=document.createElement('button');b.type='button';b.textContent=action.text;b.className=action.className||'';
    b.addEventListener('click',async()=>{
      if(b.disabled)return;b.disabled=true;
      try{const result=await action.click();if(result!==false)closeModal();}
      catch(err){toast(err.message||String(err),5000);b.disabled=false;}
      if(m.hidden)return;b.disabled=false;
    });footer.append(b);
  }
  m.hidden=false;return body;
}
function closeModal(){$('modal').hidden=true;}
function field(label,element){const wrap=document.createElement('div');const lab=document.createElement('label');lab.className='form-label';lab.textContent=label;wrap.append(lab,element);return wrap;}
function textInput(value='',placeholder=''){const input=document.createElement('input');input.type='text';input.value=value;input.placeholder=placeholder;return input;}
function selectInput(options,value){const s=document.createElement('select');for(const [v,label] of options){const opt=new Option(label,v);s.add(opt);}s.value=value;return s;}
function p(text,cls='modal-body-copy'){const el=document.createElement('p');el.className=cls;el.textContent=text;return el;}
function activeOpenTabs(){state.openTabs=state.openTabs.filter(path=>state.files.some(f=>f.path===path));if(state.activePath&&!state.openTabs.includes(state.activePath))state.openTabs.push(state.activePath);if(state.openTabs.length>6)state.openTabs.splice(0,state.openTabs.length-6);}
function renderProjectSelect(projects){
 const picker=$('projectPicker');picker.replaceChildren();
 for(const item of projects){picker.add(new Option(item.name,item.id));}
 if(state.project)picker.value=state.project.id;
}
function renderFiles(){
  const tree=$('fileTree');tree.replaceChildren();$('fileCount').textContent=String(state.files.length);
  for(const file of state.files){
    const row=document.createElement('div');row.className='file-row'+(file.path===state.activePath?' active':'');row.setAttribute('role','treeitem');row.title=file.path;
    const icon=document.createElement('span');icon.className='file-icon';icon.textContent=file.kind==='binary'?'▧':/\.bib$/i.test(file.path)?'♧':/\.(sty|cls|bst)$/i.test(file.path)?'⚙':'≡';
    const label=document.createElement('span');label.className='file-label';label.textContent=file.path;
    row.append(icon,label);
    if(file.path===state.project.main){const badge=document.createElement('span');badge.className='main-badge';badge.textContent='MAIN';row.append(badge);}
    const menu=document.createElement('button');menu.type='button';menu.className='muted-icon';menu.style.fontSize='17px';menu.textContent='⋯';menu.title=`Manage ${file.path}`;menu.setAttribute('aria-label',`Manage ${file.path}`);
    menu.addEventListener('click',e=>{e.stopPropagation();manageFileDialog(file);});
    row.append(menu);row.addEventListener('click',()=>openFile(file.path).catch(err=>toast(err.message)));
    tree.append(row);
  }
}
function renderTabs(){
  activeOpenTabs();const host=$('filenameTabs');host.replaceChildren();
  for(const path of state.openTabs){
    const b=document.createElement('button');b.type='button';b.className='filename-tab'+(state.activePath===path?' active':'');
    b.textContent=path.split('/').pop();b.title=path;b.addEventListener('click',()=>openFile(path));host.append(b);
  }
}
function updateCursor(){
  if(!state.editor||!getActive()||getActive().kind==='binary')return;
  const pos=state.editor.getCursor();$('cursorInfo').textContent=`Line ${pos.line+1}, column ${pos.ch+1}`;
}
async function openFile(path){
  if(path===state.activePath)return;
  await flushSave();state.activePath=path;
  const file=getActive();if(!file)return;
  renderFiles();renderTabs();renderEditor();mobileView('editor');
}
function renderEditor(){
  const file=getActive();if(!file)return;
  const binary=file.kind==='binary';$('binaryFileMessage').hidden=!binary;$('editorHost').hidden=binary;$('langLabel').textContent=binary?'ASSET':/\.bib$/i.test(file.path)?'BIBTEX':/\.sty$/i.test(file.path)?'LATEX STYLE':'LATEX';
  $('editorInfo').textContent=binary?`${fmtBytes(file.blob?.size||0)}`:'UTF-8 · Autosave';
  if(!binary){
    state.editor.off('change',onEditorChange);
    state.editor.setValue(file.text||'');
    state.editor.clearHistory();
    state.editor.on('change',onEditorChange);
    state.editor.refresh();updateCursor();
  }
}
function onEditorChange(editor){
  const f=getActive();if(!f||f.kind!=='text')return;
  f.text=editor.getValue();const id=state.project.id;
  state.pending.set(idPath(id,f.path),{projectId:id,path:f.path,text:f.text});
  setSaveStatus('Saving…');clearTimeout(state.saveTimeout);
  state.saveTimeout=setTimeout(()=>{flushSave().catch(err=>toast('Autosave failed: '+err.message,6000));},320);
}
async function flushSave(){
  clearTimeout(state.saveTimeout);
  if(state.saving)await state.saving;
  if(!state.pending.size)return;
  const changes=[...state.pending.values()];state.pending.clear();
  state.saving=(async()=>{for(const change of changes)await putFile(change.projectId,change.path,change.text,'text');})();
  try{await state.saving;setSaveStatus('All changes saved');}
  catch(err){for(const c of changes){const key=idPath(c.projectId,c.path);if(!state.pending.has(key))state.pending.set(key,c);}setSaveStatus('Save failed');throw err;}
  finally{state.saving=null;}
}
async function switchProject(projectId){
  await flushSave();const project=await getProject(projectId);if(!project)throw new Error('Project not found.');
  state.project=project;state.files=await listFiles(project.id);state.activePath=state.files.some(f=>f.path===project.main)?project.main:state.files[0]?.path||null;state.openTabs=[];
  $('projectTitle').textContent=project.name;renderProjectSelect(await listProjects());renderFiles();renderTabs();renderEditor();await loadSavedPdf();
}
async function refreshFiles(preferred=null){
  await flushSave();state.files=await listFiles(state.project.id);
  state.activePath=preferred&&state.files.some(f=>f.path===preferred)?preferred:state.files.some(f=>f.path===state.activePath)?state.activePath:state.project.main;
  renderFiles();renderTabs();renderEditor();
}
async function newProjectDialog(){
  const body=document.createElement('div');body.append(p('Start a project with scientific document structure, a minimal template, or a blank file.'));
  const name=textInput('New research paper','Project name');const template=selectInput([['paper','Research paper · equations, tables, BibTeX'],['minimal','Minimal LaTeX document'],['blank','Empty document']],'paper');
  body.append(field('PROJECT NAME',name),field('TEMPLATE',template));
  showModal('Create project',body,[{text:'Cancel',click:()=>{}},{text:'Create project',className:'affirm',click:async()=>{
    if(!name.value.trim())throw new Error('Enter a project name.');await flushSave();const project=await createProject(name.value.trim(),templateFor(template.value));await switchProject(project.id);mobileView('editor');toast('Project created and stored offline.');
  }}]);
}
async function addFileDialog(){
  const body=document.createElement('div');body.append(p('You can use folders, for example sections/methods.tex or figures/plot.pdf.'));
  const input=textInput('sections/methods.tex');body.append(field('FILE PATH',input));
  showModal('New file',body,[{text:'Cancel',click:()=>{}},{text:'Create file',className:'affirm',click:async()=>{
    const path=safePath(input.value);if(state.files.some(f=>f.path===path))throw new Error('That filename already exists.');
    await putFile(state.project.id,path,'','text');await refreshFiles(path);mobileView('editor');
  }}]);
}
function manageFileDialog(file){
  const body=document.createElement('div');body.append(p('Rename this file or mark it as the main LaTeX document.'));
  const input=textInput(file.path);body.append(field('FILE PATH',input));
  showModal('File options',body,[
    {text:'Delete',className:'danger-button',click:async()=>{
      if(file.path===state.project.main)throw new Error('Choose another main TeX file before deleting this one.');
      if(!confirm(`Delete ${file.path}? This cannot be undone.`))return false;
      await flushSave();await deleteFile(state.project.id,file.path);await refreshFiles();toast('File deleted.');
    }},
    {text:'Make main',click:async()=>{
      if(!/\.tex$/i.test(file.path))throw new Error('The main document must be a .tex file.');
      state.project=await updateProject({...state.project,main:file.path});renderFiles();toast('Main document updated.');
    }},
    {text:'Rename',className:'affirm',click:async()=>{
      const renamed=safePath(input.value);if(renamed===file.path)return;
      await flushSave();await renameFile(state.project.id,file.path,renamed);
      if(state.project.main===file.path)state.project=await updateProject({...state.project,main:renamed});
      state.openTabs=state.openTabs.map(t=>t===file.path?renamed:t);await refreshFiles(renamed);
    }}
  ]);
}
async function settingsDialog(){
 const body=document.createElement('div');body.append(p('Compilation runs entirely on your device. Standard scientific packages are bundled; unsupported packages may need to be added as project files.'));
 const name=textInput(state.project.name);const engine=selectInput([['pdflatex','pdfLaTeX (recommended for most journals)'],['xelatex','XeLaTeX (Unicode and fontspec)']],state.project.engine);
 const main=selectInput(state.files.filter(f=>/\.tex$/i.test(f.path)).map(f=>[f.path,f.path]),state.project.main);
 body.append(field('PROJECT NAME',name),field('TEX ENGINE',engine),field('MAIN TEX FILE',main));
 const warning=p('Local projects can be removed by iOS if Safari storage is cleared. Export your research papers as ZIP backups regularly.','backup-warning');body.append(warning);
 showModal('Project settings',body,[
 {text:'Delete project',className:'danger-button',click:async()=>{
   if(!confirm(`Permanently delete project "${state.project.name}"? Export a ZIP first.`))return false;
   const id=state.project.id;await flushSave();await removeProject(id);
   const existing=await listProjects();const next=existing[0]||await createProject('My first paper',templateFor('paper'));await switchProject(next.id);toast('Project deleted.');
 }},
 {text:'Save settings',className:'affirm',click:async()=>{
   if(!name.value.trim())throw new Error('Enter a project name.');await flushSave();state.project=await updateProject({...state.project,name:name.value.trim(),engine:engine.value,main:main.value});
   $('projectTitle').textContent=state.project.name;await switchProject(state.project.id);toast('Settings saved.');
 }}]);
}
async function renameProjectDialog(){const body=document.createElement('div');const input=textInput(state.project.name);body.append(field('PROJECT NAME',input));showModal('Rename project',body,[{text:'Cancel',click:()=>{}},{text:'Save',className:'affirm',click:async()=>{if(!input.value.trim())throw new Error('Enter a name.');state.project=await updateProject({...state.project,name:input.value.trim()});await switchProject(state.project.id);}}]);}
async function importAssets(files){
 await flushSave(); // Do not overwrite freshly imported files with pending editor autosaves.
 let added=0;const errors=[];
 for(const file of files){
  if(file.size>30*1024*1024){errors.push(`${file.name} exceeds 30MB`);continue;}
  let path;
  try{path=safePath(file.webkitRelativePath||file.name);}catch{errors.push(`Invalid filename ${file.name}`);continue;}
  if(state.files.some(f=>f.path===path)&&!confirm(`Replace ${path}?`))continue;
  try{if(textFile(path))await putFile(state.project.id,path,await file.text(),'text');else await putFile(state.project.id,path,file,'binary');added++;}
  catch(err){errors.push(`${file.name}: ${err.message}`);}
 }
 await refreshFiles();toast(`${added} file(s) imported.${errors.length?' Some failed: '+errors.join('; '):''}`,6000);
}
async function importZipFile(file){
 if(!file)return;
 setSaveStatus('Importing ZIP…');try{const project=await importProjectZip(file);await switchProject(project.id);toast(`Imported ${project.name}.`);}finally{setSaveStatus('Ready');}
}
async function exportZip(){await flushSave();setSaveStatus('Creating ZIP…');try{const files=await listFiles(state.project.id);const blob=await exportProjectZip(state.project,files);downloadBlob(blob,safeName(state.project.name)+'.zip');toast('Project backup downloaded.');}finally{setSaveStatus('All changes saved');}}
function insertSnippet(template){
 const file=getActive();if(!file||file.kind!=='text')return mobileView('editor');
 template=template.replaceAll('\\n','\n');
 const editor=state.editor;const placeholder='${cursor}';const idx=template.indexOf(placeholder);
 const insertion=template.replace(placeholder,'');const from=editor.getCursor('from');
 editor.replaceSelection(insertion,'around');
 if(idx>=0){const start=editor.indexFromPos(from);editor.setCursor(editor.posFromIndex(start+idx));}
 else if(template.includes('{}')){const from=editor.getCursor();const i=editor.indexFromPos(from);editor.setCursor(editor.posFromIndex(Math.max(0,i-1)));}
 editor.focus();
}
function findDialog(){
 const body=document.createElement('div');body.append(p('Find text in the current file. Search starts at the editor cursor and wraps around.'));
 const query=textInput(state.editor.getSelection()||'');const replace=textInput('');body.append(field('FIND',query),field('REPLACE WITH',replace));
 function next(){
  const text=state.editor.getValue(), q=query.value;if(!q)return false;let start=state.editor.indexFromPos(state.editor.getCursor('to'));
  let at=text.indexOf(q,start);if(at<0)at=text.indexOf(q);if(at<0){toast('No matches.');return false;}
  state.editor.setSelection(state.editor.posFromIndex(at),state.editor.posFromIndex(at+q.length));state.editor.scrollIntoView(null,80);return true;
 }
 showModal('Find & replace',body,[{text:'Find next',click:()=>{next();return false;}},{text:'Replace next',click:()=>{if(!query.value)return false;if(state.editor.getSelection()!==query.value&&!next())return false;state.editor.replaceSelection(replace.value);next();return false;}},{text:'Replace all',className:'affirm',click:()=>{if(!query.value)throw new Error('Enter a search string.');const text=state.editor.getValue();const count=text.split(query.value).length-1;state.editor.setValue(text.split(query.value).join(replace.value));toast(`${count} replacements.`);}}]);
}
function updateLog(text,ok){$('compileLog').textContent=text||'No compiler log available.';$('logStatus').textContent=ok===null?'':ok?'✓':'!';}
async function showPdf(blob){
 if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);
 state.pdfUrl=URL.createObjectURL(blob);state.compiledPdf=blob;
 $('previewEmpty').hidden=true;$('pdfFrame').hidden=false;$('pdfFrame').src=state.pdfUrl;
 $('downloadPdfBtn').disabled=false;$('openPdfBtn').disabled=false;
}
async function loadSavedPdf(){
 if(state.pdfUrl){URL.revokeObjectURL(state.pdfUrl);state.pdfUrl=null;}
 state.compiledPdf=null;$('pdfFrame').src='about:blank';$('pdfFrame').hidden=true;$('previewEmpty').hidden=false;
 $('downloadPdfBtn').disabled=true;$('openPdfBtn').disabled=true;updateLog('Compile to view the TeX log.',null);
 const output=await getPdf(state.project.id);if(output?.blob)await showPdf(output.blob);
}
async function compile(){
 if(state.compiling)return;state.compiling=true;
 const projectAtStart=state.project, filesAtStart=state.files, projectIdAtStart=state.project.id;
 const btn=$('compileBtn');btn.disabled=true;btn.textContent='Compiling…';
 const status=$('compileStatus');status.hidden=false;$('compileStatusText').textContent='Preparing TeX engine…';
 const lines=[];let currentStage='';
 try{
  await flushSave();
  const result=await compileLatex(projectAtStart,filesAtStart,{
    onProgress:(stage,detail)=>{$('compileStatusText').textContent=detail||stage;currentStage=stage;},
    onLog:(msg)=>{if(lines.length<350)lines.push(String(msg));}
  });
  if(state.project?.id===projectIdAtStart)updateLog([result.log, ...lines.slice(-40)].filter(Boolean).join('\n')||'Compilation completed.',!!result.success);
  if(!result.success){if(state.project?.id===projectIdAtStart)$('logDetails').open=true;throw new Error(result.error||'LaTeX compilation failed. See the compilation log.');}
  const pdf=new Blob([result.pdf],{type:'application/pdf'});
  await savePdf(projectIdAtStart,pdf);
  if(state.project?.id===projectIdAtStart){await showPdf(pdf);mobileView('pdf');toast('PDF compiled on this device.');}
  else toast('Finished compiling your previous project. Its PDF was saved there.',5000);
 }catch(err){
  if(!$('compileLog').textContent||$('compileLog').textContent==='Compile to view the TeX log.')updateLog([err.message,...lines].join('\n'),false);
  $('logDetails').open=true;toast(`Compilation: ${err.message||err}`,6500);
 }finally{
  state.compiling=false;btn.disabled=false;btn.innerHTML='<span>▶</span><span>Compile</span>';status.hidden=true;
 }
}
async function savePDF(){if(!state.compiledPdf)throw new Error('Compile your document first.');downloadBlob(state.compiledPdf,safeName(state.project.name)+'.pdf');}
function openPDF(){if(!state.pdfUrl)return;window.open(state.pdfUrl,'_blank','noopener');}
function offlineDialog(){
  const body=document.createElement('div');body.append(p('Download the on-device compiler and scientific package bundles once on Wi-Fi. Everything you download is cached locally, and your documents never need to be sent to a server.'));
  const choice=selectInput([['core','Essentials — smallest download, pdfLaTeX only'],['science','Scientific packages — equations, tables, diagrams, citations'],['all','All bundled packages — largest download']], 'science');
  const status=document.createElement('div');status.className='package-status';status.textContent='An offline download can use significant device storage; iOS may evict cached data under storage pressure.';
  body.append(field('OFFLINE PACKAGE COLLECTION',choice),status);
  showModal('Prepare offline compilation',body,[{text:'Close',click:()=>{}},{text:'Download',className:'affirm',click:async()=>{
    if(!navigator.onLine)throw new Error('Connect to Wi-Fi to download packages first.');
    choice.disabled=true;
    try{
      const stats=await prepareOffline(choice.value,({completed,total,failed})=>{status.textContent=`Downloaded or verified ${completed} of ${total} assets${failed?` · ${failed} failed`:''}. Please keep this page open.`;});
      if(stats.failed.length){status.textContent=`Partial download: ${stats.total-stats.failed.length}/${stats.total}. Errors: ${stats.failed.slice(0,3).join(', ')}`;toast('Some packages did not download. Try again on Wi-Fi.',6500);return false;}
      const cached=await cachedPackageCount();toast(`Offline assets prepared (${cached} package bundles).`);status.textContent='Offline files are ready. Test compilation with Airplane Mode on. Export ZIP backups regularly.';return false;
    }finally{choice.disabled=false;}
  }}]);
}
function helpDialog(){
  const body=document.createElement('div');
  const html=`<p class="modal-body-copy"><strong>No account, Mac or paid app subscription needed.</strong> The editor saves your projects in this browser. Compilation runs with WebAssembly when the matching TeX runtime has been published.</p>
  <ol class="help-list"><li><strong>Install:</strong> In Safari, open the deployed HTTPS site → Share → Add to Home Screen → Open as Web App.</li><li><strong>Prepare offline:</strong> Tap <em>Offline</em> and cache the Scientific package collection on Wi-Fi. Then test in Airplane Mode.</li><li><strong>Research files:</strong> Import an Overleaf project ZIP, or add .tex, .bib, .cls, .sty and images to a local project.</li><li><strong>Compile:</strong> Choose pdfLaTeX or XeLaTeX in Project settings, then tap Compile. BibTeX is supported by the matching engine release; Biber and shell-escape tools are not guaranteed.</li><li><strong>Back up:</strong> Export ZIP frequently. Safari storage can be erased or evicted by iOS.</li></ol><div class="backup-warning"><strong>Note:</strong> This is a website installed as an app, not an App Store binary. A free GitHub Pages deployment is required. The provided source archive does not contain the large TeX runtime.</div>`;
  body.innerHTML=html;showModal('Using OfflineTeX',body,[{text:'Close',className:'affirm',click:()=>{}}]);
}
function bindButtons(){
 $('newProjectBtn').addEventListener('click',()=>newProjectDialog());
 $('newMobileBtn').addEventListener('click',()=>newProjectDialog());
 $('renameProjectBtn').addEventListener('click',()=>renameProjectDialog());
 $('projectSettingsBtn').addEventListener('click',()=>settingsDialog());
 $('showHelpBtn').addEventListener('click',helpDialog);
 $('addFileBtn').addEventListener('click',()=>addFileDialog());
 $('addAssetsBtn').addEventListener('click',()=>$('assetInput').click());
 $('importBtn').addEventListener('click',()=>$('zipInput').click());
 $('importMobileBtn').addEventListener('click',()=>$('zipInput').click());
 $('exportBtn').addEventListener('click',()=>exportZip().catch(e=>toast(e.message,5500)));
 $('exportMobileBtn').addEventListener('click',()=>exportZip().catch(e=>toast(e.message,5500)));
 $('offlineBtn').addEventListener('click',offlineDialog);
 $('compileBtn').addEventListener('click',compile);
 $('compileEmptyBtn').addEventListener('click',compile);
 $('downloadPdfBtn').addEventListener('click',()=>savePDF().catch(e=>toast(e.message)));
 $('openPdfBtn').addEventListener('click',openPDF);
 $('downloadAssetBtn').addEventListener('click',()=>{const f=getActive();if(f?.blob)downloadBlob(f.blob,f.path.split('/').pop());});
 $('projectPicker').addEventListener('change',e=>switchProject(e.target.value).catch(err=>toast(err.message)));
 $('zipInput').addEventListener('change',async e=>{try{await importZipFile(e.target.files?.[0]);}catch(err){toast(err.message,6000);}finally{e.target.value='';}});
 $('assetInput').addEventListener('change',async e=>{try{await importAssets([...e.target.files]);}catch(err){toast(err.message,6000);}finally{e.target.value='';}});
 $('findBtn').addEventListener('click',findDialog);
 $('editUndoBtn').addEventListener('click',()=>state.editor.undo());
 $('editRedoBtn').addEventListener('click',()=>state.editor.redo());
 $('modalCloseBtn').addEventListener('click',closeModal);
 $('modal').addEventListener('pointerdown',e=>{if(e.target===$('modal'))closeModal();});
 document.querySelectorAll('.mobile-tab').forEach(el=>el.addEventListener('click',()=>mobileView(el.dataset.target)));
 document.querySelectorAll('[data-insert]').forEach(el=>{
   // pointerdown preventDefault preserves the current CodeMirror selection/caret on iOS.
   el.addEventListener('pointerdown',e=>e.preventDefault());
   el.addEventListener('click',()=>insertSnippet(el.dataset.insert));
 });
 window.addEventListener('online',setConnection);window.addEventListener('offline',setConnection);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSave().catch(console.error);});
 window.addEventListener('pagehide',()=>flushSave().catch(console.error));
 window.addEventListener('keydown',e=>{
   if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();compile();}
   if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();flushSave().then(()=>toast('Saved locally.')).catch(err=>toast(err.message));}
   if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='f'&&$('modal').hidden){e.preventDefault();findDialog();}
   if(e.key==='Escape'&&!$('modal').hidden)closeModal();
 });
}
async function initialize(){
 setConnection();bindButtons();
 if(!window.CodeMirror||!window.JSZip)throw new Error('Editor dependencies not available. Refresh the app while online once.');
 state.editor=window.CodeMirror($('editorHost'),{value:'',mode:'stex',lineNumbers:true,lineWrapping:matchMedia('(max-width:740px)').matches,indentUnit:2,tabSize:2,viewportMargin:10,extraKeys:{Tab:cm=>cm.replaceSelection('  ','end')},inputStyle:'textarea'});
 state.editor.on('cursorActivity',updateCursor);
 let projects=await listProjects();if(!projects.length){const p=await createProject('My research paper',templateFor('paper'));projects=[p];}
 await switchProject(projects[0].id);
 if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
  navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(err=>console.warn('Offline shell registration failed:',err));
 }
 if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>initialize().catch(fatal));else initialize().catch(fatal);
function fatal(err){console.error(err);setSaveStatus('Error');const box=$('previewEmpty');box.innerHTML='';box.append(p('Cannot initialize editor: '+(err.message||err)));}
