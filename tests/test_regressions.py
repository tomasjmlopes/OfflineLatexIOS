"""Source-level browser regression checks using Chromium, no server or TeX runtime."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parent.parent
html=(root/'index.html').read_text()
html=re.sub(r'<script[^>]*\bsrc="[^"]+"[^>]*></script>','',html)
html=re.sub(r'<link[^>]*\brel="stylesheet"[^>]*>','',html)
source=(root/'src/app.js').read_text()
source=re.sub(r'^import .*?from .*?;\n','',source,flags=re.M)
# Reuse the same deterministic in-memory mock as the original visual UI test.
visual=(root/'tests/test_visual.py').read_text()
shim=visual.split("shim=r'''",1)[1].split("'''",1)[0]

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1365,'height':800})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:d.accept())
    page.set_content(html,wait_until='domcontentloaded')
    page.add_style_tag(content=(root/'vendor/codemirror.css').read_text())
    page.add_style_tag(content=(root/'styles.css').read_text())
    for name in ['codemirror.js','stex.js','jszip.min.js']:
        page.add_script_tag(content=(root/'vendor'/name).read_text())
    page.evaluate(shim)
    page.evaluate(source+"\nwindow.__appState=state; window.__appFlushSave=flushSave;")
    page.locator('.file-row').first.wait_for()
    page.evaluate('''() => {
      window.compileLatex=async project => {
        window.__compiledProjectId=project.id;
        return await new Promise(resolve=>window.__resolveCompile=resolve);
      };
    }''')
    project_a=page.locator('#projectPicker').input_value()
    page.locator('#newProjectBtn').click()
    page.locator('#modalBody input').fill('Test project B')
    page.locator('#modalActions .affirm').click()
    page.wait_for_function("document.getElementById('projectTitle').textContent === 'Test project B'")
    project_b=page.locator('#projectPicker').input_value()
    assert project_a!=project_b
    page.select_option('#projectPicker',project_a)
    page.wait_for_function("document.getElementById('projectTitle').textContent === 'My research paper'")
    page.locator('#compileBtn').click()
    page.wait_for_function('window.__resolveCompile !== undefined')
    assert page.evaluate('window.__compiledProjectId')==project_a
    page.select_option('#projectPicker',project_b)
    page.wait_for_function("document.getElementById('projectTitle').textContent === 'Test project B'")
    page.evaluate("window.__resolveCompile({success:true,pdf:new Uint8Array([37,80,68,70]),log:'test'})")
    page.wait_for_function('document.getElementById("compileBtn").disabled === false')
    assert page.locator('#downloadPdfBtn').is_disabled(), 'BUG: Compiled A PDF assigned to B!'
    page.select_option('#projectPicker',project_a)
    page.wait_for_function('document.getElementById("downloadPdfBtn").disabled === false')
    print('PASS: switching projects while compiling does not misattribute the PDF.')

    # Autosave must be drained before imported file content replaces a pending edit.
    page.evaluate("document.querySelector('.CodeMirror').CodeMirror.setValue('OLDER UNSAVED TEXT')")
    page.locator('#assetInput').set_input_files({'name':'main.tex','mimeType':'text/plain','buffer':b'NEWLY IMPORTED TEXT'})
    page.wait_for_function("document.querySelector('.CodeMirror').CodeMirror.getValue() === 'NEWLY IMPORTED TEXT'")
    page.wait_for_timeout(450)
    assert page.evaluate("fakeFiles.find(f=>f.projectId===fakeProjects.find(p=>p.id===document.getElementById('projectPicker').value).id && f.path==='main.tex').text")=='NEWLY IMPORTED TEXT'
    print('PASS: importing a replacement file cannot be undone by an older autosave.')

    # .offlinetex.json must never select an image as the .tex entrypoint.
    archive=(root/'src/archive.js').read_text()
    archive=re.sub(r'^import .*?from .*?;\n','',archive,flags=re.M)
    archive=archive.replace('export async function','async function').replace('export function','function')
    check=page.evaluate('''async (archiveSource) => {
      const run=new Function('safePath','textFile','createProject','window', archiveSource+';return importProjectZip;');
      const importZip=run(safePath,textFile,async(name,options)=>({name,main:options.main}),window);
      const zip=new window.JSZip();
      zip.file('main.tex','\\\\documentclass{article}');
      zip.file('figure.png',new Uint8Array([1,2]));
      zip.file('.offlinetex.json',JSON.stringify({main:'figure.png'}));
      const bytes=await zip.generateAsync({type:'blob'});
      return (await importZip(new File([bytes],'test.zip'))).main;
    }''',archive)
    assert check=='main.tex',f'BUG: ZIP entrypoint is {check} instead of main.tex'
    print('PASS: invalid ZIP metadata cannot select a non-.tex main document.')

    # A failed write must not overwrite a more recent pending edit.
    page.evaluate('''() => {
      window.putFile=async () => await new Promise((resolve,reject)=>{window.__failSave=()=>reject(new Error('Simulated failure'));});
      window.__appState.editor.setValue('FIRST EDIT');
      window.__inflightSave=window.__appFlushSave().catch(e=>e.message);
    }''')
    page.wait_for_function('window.__failSave !== undefined')
    page.evaluate("window.__appState.editor.setValue('SECOND NEWER EDIT')")
    page.evaluate('window.__failSave()')
    page.evaluate('window.__inflightSave')
    pending_text=page.evaluate("[...window.__appState.pending.values()].map(c=>c.text)[0]")
    assert pending_text=='SECOND NEWER EDIT',f'BUG: failed write lost newer edits: {pending_text}'
    print('PASS: failed autosave retains later edits rather than restoring stale text.')
    assert not errors,errors
    browser.close()
