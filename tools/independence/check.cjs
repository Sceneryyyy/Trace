// Enforce the product boundary against accidental upstream build dependencies.
// Historical sources/tests and third-party notices remain attribution records.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript')
const {builtinModules}=require('node:module')
const root=path.resolve(process.argv[2]||path.join(__dirname,'../..'))
const json=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'))
const failures=[],record=message=>failures.push(message)
const pkg=json('package.json'),deps=new Set(Object.keys({...pkg.dependencies,...pkg.devDependencies}))
const within=(file,directory)=>file===directory||file.startsWith(directory+path.sep)
const trace=path.join(root,'src/trace'),assets=path.join(root,'resources/trace')
let files=0,imports=0
function inspectImport(file,name){
 imports++
 if(name.startsWith('.')){
  const target=path.resolve(path.dirname(file),name)
  if(!within(target,trace)&&!within(target,assets))record(path.relative(root,file)+' imports outside Trace: '+name)
 }else if(name.startsWith('@/'))record(path.relative(root,file)+' uses the removed upstream alias: '+name)
 else if(!name.startsWith('node:')&&!builtinModules.includes(name)){
  const dependency=name.startsWith('@')?name.split('/').slice(0,2).join('/'):name.split('/')[0]
  if(!deps.has(dependency))record(path.relative(root,file)+' imports undeclared dependency: '+name)
 }
}
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,item.name)
 if(item.isDirectory())walk(file)
 else if(/\.tsx?$/.test(file)){
  files++
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true)
  function visit(node){
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))inspectImport(file,node.moduleSpecifier.text)
   if(ts.isCallExpression(node)&&node.arguments.length&&ts.isStringLiteral(node.arguments[0])&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require'))inspectImport(file,node.arguments[0].text)
   ts.forEachChild(node,visit)
  }
  visit(source)
 }
}}
walk(trace)
for(const relative of ['src/main','src/preload','src/renderer','src/shared','src/plugin-ui','src/types','plugin/CMakeLists.txt','tui/CMakeLists.txt','native/binding.gyp'])if(fs.existsSync(path.join(root,relative)))record('Upstream build input remains: '+relative)
for(const [name,command]of Object.entries(pkg.scripts||{})){
 if(/visualizer_dsp|rebuild:native.*cwd.*native|scripts\/build\/|stage:tui|plugin-ui|tools\/m0\//.test(command))record('Upstream package script: '+name)
}
if(pkg.name!=='trace'||pkg.main!=='./out-trace/main/index.js')record('Root package must describe the Trace application')
if(pkg.scripts?.postinstall||pkg.scripts?.install||pkg.scripts?.preinstall)record('Root dependency installation must not build a native application')
const compiler=json('tsconfig.json')
if((compiler.include||[]).some(value=>!value.startsWith('src/trace/')))record('TypeScript includes upstream application sources')
for(const relative of ['native/portable/CMakeLists.txt','native/recorder/CMakeLists.txt']){
 const source=fs.readFileSync(path.join(root,relative),'utf8')
 if(/\.\.\/src\/(?!recorder\/)[^\s)]*\.(cpp|c|h)\b|visualizer_dsp|binding\.gyp/.test(source))record('Upstream CMake source dependency: '+relative)
}
const suite=fs.readFileSync(path.join(root,'test/trace-suites.mjs'),'utf8')
if(/visualizer_dsp|native\/build\/Release/.test(suite))record('Default tests require the Prism addon')
const fft=json('native/vendor/prism-fft/SOURCE.json')
for(const entry of fft.files){
 const file=path.join(root,'native/vendor/prism-fft',entry.file)
 const digest=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
 if(digest!==entry.sha256)record('Vendored FFT differs from its reviewed source identity: '+entry.file)
}
for(const relative of ['.github/workflows/trace.yml','.github/workflows/trace-release.yml']){
 const workflow=fs.readFileSync(path.join(root,relative),'utf8')
 if(/PRISM_SKIP|npm run rebuild:native|test:capture-support|test:lufsmeter-native/.test(workflow))record('CI still depends on upstream build steps: '+relative)
}
const report={status:failures.length?'fail':'pass',scope:'Trace source imports, declared dependencies, installation hooks, CMake/test/CI build boundaries and vendored FFT identity; no device or package runtime claim',traceFiles:files,imports,failures}
console.log(JSON.stringify(report,null,2))
process.exitCode=failures.length?1:0
