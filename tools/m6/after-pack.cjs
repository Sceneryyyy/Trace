const fs=require('fs'),path=require('path'),PE=require('pe-library'),ResEdit=require('resedit')
module.exports=async context=>{
 const root=path.resolve(__dirname,'../..'),directory=path.resolve(context.appOutDir),allowed=path.join(root,'dist-trace')+path.sep
 if(!directory.startsWith(allowed))throw Error('Unexpected package output')
 const target=path.join(directory,'Trace.exe'),exe=PE.NtExecutable.from(fs.readFileSync(target),{ignoreCert:true}),resources=PE.NtExecutableResource.from(exe)
 const icon=ResEdit.Data.IconFile.from(fs.readFileSync(path.join(root,'resources/trace/icon.ico')))
 if(!icon.icons.length)throw Error('Trace icon missing')
 const groups=ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries)
 for(const group of groups)ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries,group.id,group.lang,icon.icons.map(i=>i.data))
 const versions=ResEdit.Resource.VersionInfo.fromEntries(resources.entries)
 for(const version of versions){
  version.setFileVersion(0,1,0,8);version.setProductVersion(0,1,0,8)
  for(const lang of version.getAllLanguagesForStringValues())version.setStringValues(lang,{CompanyName:'Trace contributors',FileDescription:'Trace 声迹 · Audio Recorder & Analyzer',InternalName:'Trace',OriginalFilename:'Trace.exe',ProductName:'Trace',ProductVersion:'0.1.0-preview.8',LegalCopyright:'Trace contributors. Includes Prism and Electron; see bundled licenses.'})
  version.outputToResourceEntries(resources.entries)
 }
 resources.outputResource(exe);const temp=target+'.resource-tmp';fs.writeFileSync(temp,Buffer.from(exe.generate()));await renameWithRetry(temp,target)
 const defaultApp=path.join(directory,'resources/default_app.asar');if(fs.existsSync(defaultApp))fs.rmSync(defaultApp)
}

async function renameWithRetry(from,to){
 for(let attempt=0;;attempt++){try{fs.renameSync(from,to);return}catch(error){if(!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt===9)throw error;await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)))}}
}
