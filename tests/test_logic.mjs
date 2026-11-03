import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {safePath,templateFor,textFile} from '../src/db.js';
import {exportProjectZip} from '../src/archive.js';
const folder=dirname(fileURLToPath(import.meta.url));
const sandbox={window:{},Blob,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Promise,setTimeout,clearTimeout,setImmediate,clearImmediate};
vm.runInNewContext(readFileSync(resolve(folder,'../vendor/jszip.min.js'),'utf8'),sandbox);
globalThis.window={JSZip:sandbox.JSZip||sandbox.window.JSZip};
assert.ok(window.JSZip,'Bundled ZIP library should load');
assert.equal(safePath('figures\\a.png'),'figures/a.png');
assert.equal(textFile('refs.bib'),true);
assert.equal(textFile('figure.png'),false);
for (const invalid of ['','../secrets.tex','x/../../hello.tex','a/./b.tex','a//..//b.tex']){
  assert.throws(()=>safePath(invalid),undefined,`Expected failure for ${invalid}`);
}
for(const type of ['paper','minimal','blank']){
  const template=templateFor(type);
  assert(template.files.some(f=>f.path===template.main&&f.text.includes('\\documentclass')));
  assert(template.files.some(f=>f.path===template.main&&f.text.includes('\\end{document}')));
}
const files=[{path:'main.tex',kind:'text',text:'\\documentclass{article}'},{path:'figures/plot.png',kind:'binary',blob:new Blob([new Uint8Array([137,80,78,71])])}];
const zip=await exportProjectZip({main:'main.tex',engine:'pdflatex'},files);
const archive=await window.JSZip.loadAsync(await zip.arrayBuffer());
assert.equal(await archive.file('main.tex').async('string'),'\\documentclass{article}');
assert.deepEqual([...await archive.file('figures/plot.png').async('uint8array')],[137,80,78,71]);
assert.equal(JSON.parse(await archive.file('.offlinetex.json').async('string')).engine,'pdflatex');
console.log('PASS: safe paths, all templates, scientific ZIP/asset export.');
