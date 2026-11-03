import { safePath, textFile, createProject } from './db.js';

const PER_FILE_LIMIT = 30 * 1024 * 1024;
const ALL_FILES_LIMIT = 180 * 1024 * 1024;
const MAX_FILES = 2000;

function unzipRoot(entries) {
  const names=entries.map(e=>e.name);
  const root=names[0]?.split('/')[0] + '/';
  return root && names.every(n=>n.startsWith(root))?root:'';
}
export async function importProjectZip(file) {
  if (!window.JSZip) throw new Error('ZIP handling library is unavailable.');
  if (file.size > ALL_FILES_LIMIT) throw new Error('ZIP archive is too large for mobile import.');
  const zip=await window.JSZip.loadAsync(file);
  const entries=Object.values(zip.files).filter(e=>!e.dir && !e.name.includes('__MACOSX') && !e.name.endsWith('.DS_Store'));
  if (entries.length>MAX_FILES) throw new Error('Too many files in project.');
  const root=unzipRoot(entries);
  const files=[];let total=0;
  for (const entry of entries) {
    const path=safePath(entry.name.slice(root.length));
    if (path === '.offlinetex.json') continue;
    const bytes=await entry.async('uint8array');
    total+=bytes.byteLength;
    if(bytes.byteLength>PER_FILE_LIMIT || total>ALL_FILES_LIMIT) throw new Error('Uncompressed project is too large for mobile storage.');
    if(textFile(path)) files.push({path,kind:'text',text:new TextDecoder().decode(bytes)});
    else files.push({path,kind:'binary',blob:new Blob([bytes])});
  }
  if(!files.length)throw new Error('No project files found in the ZIP archive.');
  const metadataEntry=Object.values(zip.files).find(e=>e.name === root + '.offlinetex.json');
  let meta={};
  if(metadataEntry) {try{meta=JSON.parse(await metadataEntry.async('string'));}catch{/* ignore malformed optional metadata */}}
  const mains=files.filter(f=>/\.tex$/i.test(f.path));
  const main=mains.some(f=>f.path===meta.main)?meta.main:mains.some(f=>f.path==='main.tex')?'main.tex':mains[0]?.path;
  if(!main) throw new Error('No .tex document in ZIP. Import a LaTeX project.');
  const cleanName=file.name.replace(/\.zip$/i,'') || 'Imported paper';
  const project=await createProject(cleanName,{main,files});
  if(meta.engine && ['pdflatex','xelatex'].includes(meta.engine)) {
    project.engine=meta.engine;
    const { updateProject } = await import('./db.js');
    await updateProject(project);
  }
  return project;
}
export async function exportProjectZip(project, files) {
  if(!window.JSZip)throw new Error('ZIP handling library is unavailable.');
  const zip=new window.JSZip();
  for (const file of files) {
    if(file.kind==='text')zip.file(file.path,file.text || '');
    else if(file.blob)zip.file(file.path,new Uint8Array(await file.blob.arrayBuffer()));
  }
  zip.file('.offlinetex.json',JSON.stringify({main:project.main,engine:project.engine,version:1},null,2));
  return zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
}
export function downloadBlob(blob,filename) {
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);
}
