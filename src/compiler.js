// Adapter for the MIT-licensed Siglum WebAssembly engine.
// The engine's large binaries are installed by GitHub Actions, not embedded in this source ZIP.
export const baseURL = new URL('../', import.meta.url);
const compilerDir = new URL('compiler/', baseURL);
const runtimeDir = new URL('runtime/', baseURL);
const bundleDir = new URL('runtime/bundles/', baseURL);
let compiler = null;
let initialization = null;

export async function getCompiler({ onProgress = () => {}, onLog = () => {}, enableCtan = false, ctanProxyUrl = null } = {}) {
  if (compiler) { compiler.onProgress=onProgress; compiler.onLog=onLog; return compiler; }
  if (initialization) return initialization;
  initialization = (async () => {
    let module;
    try { module = await import('../compiler/siglum.bundle.js'); }
    catch (err) {throw new Error('The on-device TeX compiler has not been installed. Deploy this repository with the included GitHub Pages workflow first. Editor and project backups still work locally. (' + err.message + ')');}
    const instance = new module.SiglumCompiler({
      wasmUrl: new URL('wasm/busytex.wasm', runtimeDir).href,
      jsUrl: new URL('wasm/busytex.js', runtimeDir).href,
      workerUrl: new URL('siglum-worker.js', compilerDir).href,
      bundlesUrl: bundleDir.href.replace(/\/$/, ''),
      ctanProxyUrl: enableCtan ? (ctanProxyUrl || null) : null,
      enableCtan: !!(enableCtan && ctanProxyUrl),
      enableLazyFS: false, // iOS Safari / GitHub Pages can work without SharedArrayBuffer headers.
      enableDocCache: true,
      verbose: false,
      maxRetries: 8,
      onProgress,
      onLog,
    });
    await instance.init();
    compiler = instance;
    return compiler;
  })().catch(e=>{ initialization=null; throw e; });
  return initialization;
}
export async function compileLatex(project, files, callbacks={}) {
  const engine=await getCompiler(callbacks);
  const main=files.find(f=>f.path===project.main);
  if(!main || main.kind!=='text') throw new Error('Main TeX file is missing. Change it in Project settings.');
  const additionalFiles={};
  for(const file of files) {
    if (file.path===project.main) continue;
    if(file.kind==='text')additionalFiles[file.path]=file.text || '';
    else if(file.blob)additionalFiles[file.path]=new Uint8Array(await file.blob.arrayBuffer());
  }
  return engine.compile(main.text, {engine:project.engine||'pdflatex',mainFile:project.main,additionalFiles,useCache:false});
}
function entryPaths() {
  return [
    new URL('compiler/siglum.bundle.js',baseURL),
    new URL('compiler/siglum-worker.js',baseURL),
    new URL('runtime/wasm/busytex.wasm',baseURL),
    new URL('runtime/wasm/busytex.js',baseURL),
    new URL('runtime/bundles/bundles.json',baseURL),
    new URL('runtime/bundles/file-manifest.json',baseURL),
    new URL('runtime/bundles/package-deps.json',baseURL),
  ];
}
function engineBundleNames(data,mode) {
  const names=new Set();
  const addBundle=(name)=>{
    if(!name||names.has(name)||!data.bundles?.[name])return;
    names.add(name);
    for(const dep of data.bundles[name].requires||[])addBundle(dep);
  };
  for(const name of data.engines?.pdflatex?.required||[])addBundle(name);
  if (mode !== 'core') for (const name of data.engines?.xelatex?.required||[])addBundle(name);
  if(mode==='science') {
    addBundle('bibtex'); // Offline scientific papers need the BibTeX executable/styles bundle.
    const packages=['amsmath','amssymb','mathtools','physics','siunitx','chemformula','mhchem','graphicx','graphics','float','booktabs','multirow','longtable','array','tabularx','hyperref','cleveref','xcolor','geometry','microtype','tikz','pgfplots','caption','subcaption','natbib','biblatex','enumitem','fontspec','listings','algorithm2e','fancyhdr','csquotes','beamer'];
    for(const pkg of packages)addBundle(data.packages?.[pkg]);
  }
  if(mode==='all')for(const name of Object.keys(data.bundles||{}))addBundle(name);
  return [...names];
}
export async function prepareOffline(mode='science',onProgress=()=>{}) {
  if (!('caches' in window)) throw new Error('This browser does not support offline asset caching.');
  const cache=await caches.open('offlinetex-scientific-assets-v2');
  const registryUrl=new URL('bundles.json',bundleDir);
  const res=await fetch(registryUrl);
  if(!res.ok)throw new Error('Package registry is not published yet. Deploy the repository first.');
  const data=await res.json();
  const paths=[...entryPaths(),...engineBundleNames(data,mode).map(n=>new URL(encodeURIComponent(n)+'.data.gz',bundleDir))];
  const unique=[...new Set(paths.map(url=>url.href))];
  const failed=[];let completed=0;let savedBytes=0;
  for(const url of unique) {
    try {
      const request=new Request(url,{cache:'no-cache'});
      const existing=await cache.match(url);
      if(!existing) {
        const response=await fetch(request);
        if(!response.ok)throw new Error('HTTP '+response.status);
        // Clone before measuring length. Avoid loading the entire file into memory.
        savedBytes += Number(response.headers.get('Content-Length')||0);
        await cache.put(url,response);
      }
    } catch(err) {failed.push(`${url.split('/').pop()}: ${err.message}`);}
    completed++;
    onProgress({completed,total:unique.length,failed:failed.length,savedBytes});
  }
  return {completed,total:unique.length,failed,savedBytes};
}
export async function cachedPackageCount() {
  if(!('caches' in window))return 0;
  const cache=await caches.open('offlinetex-scientific-assets-v2');const keys=await cache.keys();return keys.filter(r=>r.url.endsWith('.data.gz')).length;
}
