from playwright.sync_api import sync_playwright
from pathlib import Path
import re
root=Path(__file__).resolve().parent.parent
html=(root/'index.html').read_text()
html=re.sub(r'<script[^>]*\bsrc="[^"]+"[^>]*></script>','',html)
html=re.sub(r'<link[^>]*\brel="stylesheet"[^>]*>','',html)
source=(root/'src/app.js').read_text()
source=re.sub(r'^import .*?from .*?;\n','',source,flags=re.M)
shim=r'''
var fakeFiles=[],fakeProjects=[],fakeOutputs={};
var templateFor=(t)=>({main:'main.tex',files:[{path:'main.tex',kind:'text',text:'\\documentclass{article}\n\\begin{document}\nMy scientific research paper\n\\end{document}\n'}, {path:'references.bib',kind:'text',text:'@article{test,author={Author},title={Paper},year={2026}}'}]});
var listProjects=async()=>fakeProjects;
var getProject=async id=>fakeProjects.find(p=>p.id===id);
var createProject=async(name,template)=>{const proj={id:'p'+(fakeProjects.length+1),name,engine:'pdflatex',main:template.main};fakeProjects.unshift(proj);fakeFiles.push(...template.files.map(f=>({projectId:proj.id,...f})));return proj;};
var updateProject=async p=>{fakeProjects=fakeProjects.map(x=>x.id===p.id?p:x);return p;};
var removeProject=async id=>{fakeProjects=fakeProjects.filter(p=>p.id!==id);};
var listFiles=async id=>fakeFiles.filter(f=>f.projectId===id);
var putFile=async(id,path,data,kind)=>{const f=fakeFiles.find(f=>f.projectId===id&&f.path===path);if(f){f.kind=kind;f.text=kind==='text'?data:'';f.blob=kind==='binary'?data:null;}else fakeFiles.push({projectId:id,path,kind,text:kind==='text'?data:'',blob:kind==='binary'?data:null});};
var deleteFile=async(id,path)=>{fakeFiles=fakeFiles.filter(f=>!(f.projectId===id&&f.path===path));};
var renameFile=async(id,from,to)=>{const f=fakeFiles.find(f=>f.projectId===id&&f.path===from);f.path=to;};
var getPdf=async id=>fakeOutputs[id]||null;
var savePdf=async(id,blob)=>fakeOutputs[id]={blob};
var safePath=p=>{if(!p||p.includes('..'))throw new Error('Bad path');return p;};
var textFile=p=>/\.(tex|bib|cls|sty)$/.test(p);
var compileLatex=async()=>{throw new Error('Compiler assets are not installed in this visual test')};
var prepareOffline=async()=>({total:0,failed:[]});
var cachedPackageCount=async()=>0;
var importProjectZip=async()=>{};
var exportProjectZip=async()=>new Blob();
var downloadBlob=()=>{};
'''
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    errors=[]
    def visit(width,height,filename,mobile=False):
        page=b.new_page(viewport={'width':width,'height':height},is_mobile=mobile,has_touch=mobile)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(html, wait_until='domcontentloaded')
        page.add_style_tag(content=(root/'vendor/codemirror.css').read_text())
        page.add_style_tag(content=(root/'styles.css').read_text())
        page.add_script_tag(content=(root/'vendor/codemirror.js').read_text())
        page.add_script_tag(content=(root/'vendor/stex.js').read_text())
        page.add_script_tag(content=(root/'vendor/jszip.min.js').read_text())
        page.evaluate(shim)
        page.evaluate(source)
        page.wait_for_timeout(300)
        print(width,'initial file rows',page.locator('.file-row').count(),'status',page.locator('#saveStatus').inner_text())
        page.screenshot(path=str(root/filename),full_page=True)
        return page
    desktop=visit(1365,800,'desktop-preview.png')
    desktop.locator('#newProjectBtn').click()
    desktop.locator('#modalBody input').fill('Optics Manuscript')
    desktop.locator('#modalActions .affirm').click()
    desktop.wait_for_timeout(250)
    print('new project',desktop.locator('#projectTitle').inner_text())
    desktop.locator('#addFileBtn').click()
    desktop.locator('#modalBody input').fill('sections/methods.tex')
    desktop.locator('#modalActions .affirm').click()
    desktop.wait_for_timeout(400)
    print('files after new file',desktop.locator('.file-row').count())
    mobile=visit(390,844,'mobile-preview.png',mobile=True)
    print('mobile nav?', mobile.locator('.mobile-tabs').is_visible(),'editor?',mobile.locator('#editorPanel').is_visible())
    mobile.locator('button.mobile-tab[data-target="files"]').click()
    print('files on mobile?',mobile.locator('#filesPanel').is_visible(), 'project actions?', mobile.locator('#newMobileBtn').is_visible(),mobile.locator('#importMobileBtn').is_visible(),mobile.locator('#exportMobileBtn').is_visible())
    mobile.locator('button.mobile-tab[data-target="editor"]').click()
    print('editor on mobile?',mobile.locator('#editorPanel').is_visible())
    mobile.locator('.snippets button',has_text='α').click()
    print('inserted alpha?', '\\alpha' in mobile.locator('.CodeMirror').inner_text())
    print('errors:',errors)
    assert not errors, errors
    b.close()
