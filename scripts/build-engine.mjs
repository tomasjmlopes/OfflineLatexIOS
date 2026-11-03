import {build} from 'esbuild';
import {copyFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
await mkdir('compiler',{recursive:true});
await build({
  entryPoints:['scripts/engine-entry.js'], outfile:'compiler/siglum.bundle.js',
  bundle:true, format:'esm', platform:'browser', target:['es2022'],
  define:{global:'globalThis'},
  plugins:[{name:'disable-broken-blake3-browser-export',setup(b){b.onResolve({filter:/^blake3-wasm\/browser(?:\.js)?$/},()=>({path:resolve('scripts/blake3-disabled.js')}));}}]
});
await copyFile('node_modules/@siglum/engine/src/worker.js','compiler/siglum-worker.js');
console.log('Built browser WASM compiler adapter.');
