// App-shell cache + on-demand local storage of scientific TeX bundles.
// Browser-managed storage can be evicted: users should export ZIP backups.
const SHELL='offlinetex-shell-v3';
const ASSETS='offlinetex-scientific-assets-v2';
const SHELL_FILES=['./','./index.html','./styles.css','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png','./src/app.js','./src/archive.js','./src/db.js','./src/compiler.js','./vendor/codemirror.js','./vendor/codemirror.css','./vendor/stex.js','./vendor/jszip.min.js'];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(SHELL_FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('offlinetex-shell')&&k!==SHELL).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(u.origin!==self.location.origin)return;
  if(!u.pathname.startsWith(new URL(self.registration.scope).pathname))return;
  // Browsers may send Range requests for large WASM/files. Bypass cache for range responses.
  if(r.headers.has('Range'))return;
  if(r.mode==='navigate'){
    e.respondWith((async()=>{
      try {const response=await fetch(r);const cache=await caches.open(SHELL);cache.put(new URL('./',self.registration.scope),response.clone()).catch(()=>{});return response;}
      catch{ return await caches.match(new URL('./',self.registration.scope)) || new Response('Offline app shell unavailable. Open once online.',{status:503});}
    })());return;
  }
  const isRuntime=u.pathname.includes('/runtime/')||u.pathname.includes('/compiler/');
  e.respondWith((async()=>{
    const existing=await caches.match(r);
    if(existing && isRuntime)return existing;
    try {
      const response=await fetch(r);
      if(response.ok && response.type==='basic'){
        const cache=await caches.open(isRuntime?ASSETS:SHELL);
        cache.put(r,response.clone()).catch(()=>{});
      }
      return response;
    } catch {
      if(existing)return existing;
      return new Response('File is not cached for offline use.',{status:503,statusText:'Offline asset unavailable'});
    }
  })());
});
