// Paths relative to out-trace. Development test bundles are never product files.
module.exports=function productPath(value){
 const p=value.replaceAll('\\','/')
 return p===''||p==='main'||p==='main/chunks'||p.startsWith('main/chunks/')&&p.endsWith('.js')||
 ['main/index.js','main/file-worker.js','main/media-runner.js','main/report-worker.js','preload','preload/index.js','renderer','renderer/index.html','renderer/assets'].includes(p)||
 p.startsWith('renderer/assets/')
}
