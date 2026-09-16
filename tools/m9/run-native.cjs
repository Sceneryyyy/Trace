const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process'),{buildSync}=require('esbuild')
const root=path.resolve(__dirname,'../..'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE
fs.mkdirSync(path.join(root,'artifacts/m9'),{recursive:true})
for(const name of ['spectrogramService','spectrogramSource'])buildSync({entryPoints:[path.join(root,'src/trace/'+name+'.ts')],outfile:path.join(root,'artifacts/m9/'+name+'.cjs'),platform:'node',format:'cjs',bundle:true})
const r=spawnSync(require('electron'),[path.join(__dirname,'service-native.cjs')],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:120000})
fs.writeFileSync(path.join(root,'artifacts/m9/native-service.log'),(r.stdout||'')+(r.stderr||''))
console.log(r.stdout||'');if(r.stderr)console.error(r.stderr);if(r.error)console.error(r.error);process.exitCode=r.error?1:r.status||0
