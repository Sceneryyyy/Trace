export const feedbackEmail='472841772@qq.com'
export const feedbackTemplate='问题描述：\n\n复现步骤：\n1. \n2. \n\n期望结果：\n\n实际结果：\n\n发生频率：\n\n附件：请手动添加 Trace 诊断目录中的 diagnostics.json。请先检查附件，不要附带私人录音。\n'
export function feedbackMailto(version:string):string{
 return 'mailto:'+feedbackEmail+'?subject='+encodeURIComponent('[Trace '+version+'] 问题反馈')+'&body='+encodeURIComponent('Trace 版本：'+version+'\n\n'+feedbackTemplate)
}
