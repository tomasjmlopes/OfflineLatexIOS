// Projects and content stay in the browser's IndexedDB. No account or network calls.
const DATABASE = 'offlinetex-research-v1';
let connectionPromise;

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  });
}
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Storage operation aborted'));
    tx.onerror = () => reject(tx.error || new Error('Storage operation failed'));
  });
}
function database() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support local project storage.'));
  if (!connectionPromise) connectionPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DATABASE, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('files')) {
        const store = db.createObjectStore('files', { keyPath: ['projectId','path'] });
        store.createIndex('projectId','projectId',{unique:false});
      }
      if (!db.objectStoreNames.contains('outputs')) db.createObjectStore('outputs',{keyPath:'projectId'});
    };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); resolve(db); };
    req.onerror = () => reject(req.error);
  });
  return connectionPromise;
}
const newId = () => (crypto.randomUUID?.() || `p-${Date.now()}-${Math.random().toString(36).slice(2)}`);
export function safePath(input) {
  const normalized = String(input ?? '').replaceAll('\\','/').replace(/^\/+/, '').replace(/\/{2,}/g,'/').trim();
  const parts = normalized.split('/');
  if (!normalized || normalized.length > 240 || /[\u0000-\u001f]/.test(normalized) || parts.some(p => !p || p === '.' || p === '..' || p.startsWith('__MACOSX'))) throw new Error('Invalid filename or folder path.');
  return normalized;
}
export function textFile(path) { return /\.(tex|bib|sty|cls|bst|def|cfg|clo|txt|md|csv|tsv|dat|json|bbx|cbx|lbx|eps|svg)$/i.test(path); }
export function templateFor(type) {
  if (type === 'minimal') return {
    main: 'main.tex', files: [
      {path:'main.tex',kind:'text',text:String.raw`\documentclass[11pt]{article}
\usepackage{amsmath,amssymb,graphicx}
\begin{document}
\title{My LaTeX Document}
\author{Your Name}
\maketitle

Hello, LaTeX! Here is a mathematical expression:
\begin{equation}
E = mc^2.
\end{equation}

\end{document}
`}
    ]};
  if (type === 'blank') return {main:'main.tex',files:[{path:'main.tex',kind:'text',text:'\\documentclass{article}\n\\begin{document}\n\n\\end{document}\n'}]};
  return {main:'main.tex',files:[
    {path:'main.tex',kind:'text',text:String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[T1]{fontenc}
\usepackage{amsmath,amssymb,mathtools}
\usepackage{graphicx,booktabs}
\usepackage{siunitx}
\usepackage{hyperref}

\title{A Scientific Research Paper}
\author{Your Name\\Research Institute}
\date{\today}

\begin{document}
\maketitle
\begin{abstract}
Write a concise abstract describing the scientific question, approach and key findings.
\end{abstract}

\section{Introduction}
This paper demonstrates an offline LaTeX workflow with equations,
references and bibliographies. See \cite{einstein1905}.

\section{Methods}
A representative expression is
\begin{equation}\label{eq:gaussian}
  f(x)=\frac{1}{\sqrt{2\pi\sigma^2}}\exp\!\left[-\frac{(x-\mu)^2}{2\sigma^2}\right].
\end{equation}
Equation~\ref{eq:gaussian} describes a Gaussian probability density.

\begin{table}[ht]
  \centering
  \caption{Example measurements.}
  \begin{tabular}{l S[table-format=2.1]}
    \toprule
    Quantity & {Value} \\
    \midrule
    Resolution (nm) & 0.2 \\
    Acquisition time (ms) & 15.0 \\
    \bottomrule
  \end{tabular}
\end{table}

\section{Results and discussion}
Place your results, figures and discussions here. Figures can be added
from the Files panel using \verb|\includegraphics|.

\section{Conclusions}
Summarize your main contribution.

\bibliographystyle{unsrt}
\bibliography{references}
\end{document}
`},
    {path:'references.bib',kind:'text',text:String.raw`@article{einstein1905,
  author  = {Albert Einstein},
  title   = {Zur Elektrodynamik bewegter K\"orper},
  journal = {Annalen der Physik},
  volume  = {322},
  number  = {10},
  pages   = {891--921},
  year    = {1905}
}
`}
  ]};
}
export async function listProjects() {
  const db = await database();
  const tx = db.transaction('projects','readonly');
  const projects = await request(tx.objectStore('projects').getAll());
  return projects.sort((a,b) => b.updatedAt - a.updatedAt);
}
export async function getProject(id) {
  const db = await database(); const tx=db.transaction('projects','readonly');
  return request(tx.objectStore('projects').get(id));
}
export async function createProject(name, template = templateFor('paper')) {
  const db = await database(); const now=Date.now(); const id=newId();
  const project={id,name:String(name || 'Untitled project').slice(0,100),main:safePath(template.main || 'main.tex'),engine:'pdflatex',updatedAt:now,createdAt:now};
  const tx=db.transaction(['projects','files'],'readwrite');
  tx.objectStore('projects').put(project);
  const store=tx.objectStore('files');
  for (const file of template.files || []) {const path=safePath(file.path);store.put({projectId:id,path,kind:file.kind || (textFile(path)?'text':'binary'),text:file.text || '',blob:file.blob || null,updatedAt:now});}
  await transactionDone(tx);
  return project;
}
export async function updateProject(project) {
  const db=await database();const tx=db.transaction('projects','readwrite');
  const updated={...project,updatedAt:Date.now()};tx.objectStore('projects').put(updated);await transactionDone(tx);return updated;
}
export async function removeProject(id) {
  const db=await database();const tx=db.transaction(['projects','files','outputs'],'readwrite');
  tx.objectStore('projects').delete(id);tx.objectStore('outputs').delete(id);
  const index=tx.objectStore('files').index('projectId');
  index.openKeyCursor(IDBKeyRange.only(id)).onsuccess=(e)=>{const cur=e.target.result;if(cur){tx.objectStore('files').delete(cur.primaryKey);cur.continue();}};
  await transactionDone(tx);
}
export async function listFiles(projectId) {
  const db=await database();const tx=db.transaction('files','readonly');
  const files=await request(tx.objectStore('files').index('projectId').getAll(projectId));
  return files.sort((a,b)=>a.path.localeCompare(b.path));
}
export async function putFile(projectId, path, content, kind = 'text') {
  path=safePath(path);const db=await database();const now=Date.now();
  const record={projectId,path,kind,updatedAt:now,text:kind==='text'?String(content):'',blob:kind==='binary'?(content instanceof Blob?content:new Blob([content])):null};
  const tx=db.transaction(['files','projects'],'readwrite');tx.objectStore('files').put(record);
  const store=tx.objectStore('projects');
  const req=store.get(projectId);req.onsuccess=()=>{if(req.result)store.put({...req.result,updatedAt:now});};
  await transactionDone(tx);return record;
}
export async function deleteFile(projectId,path) {
  const db=await database();const tx=db.transaction('files','readwrite');tx.objectStore('files').delete([projectId,safePath(path)]);await transactionDone(tx);
}
export async function renameFile(projectId,from,to) {
  from=safePath(from);to=safePath(to);
  const db=await database();const tx=db.transaction('files','readwrite');const store=tx.objectStore('files');
  const [old,existing]=await Promise.all([request(store.get([projectId,from])),request(store.get([projectId,to]))]);
  if (!old) throw new Error('File not found.');if(existing)throw new Error('A file already has that name.');
  store.put({...old,path:to,updatedAt:Date.now()});store.delete([projectId,from]);await transactionDone(tx);
}
export async function savePdf(projectId,blob) {
  const db=await database();const tx=db.transaction('outputs','readwrite');tx.objectStore('outputs').put({projectId,blob,updatedAt:Date.now()});await transactionDone(tx);
}
export async function getPdf(projectId) {
  const db=await database();const tx=db.transaction('outputs','readonly');return request(tx.objectStore('outputs').get(projectId));
}
