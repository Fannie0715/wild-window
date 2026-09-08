interface Tool { name:string;title:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>unknown }
interface ModelContext {registerTool:(tool:Tool,options?:{signal?:AbortSignal})=>void|Promise<void>}
interface Camera {id:string;name:string;country:string;source:string;embed:string}
export function registerCameraTools(context:ModelContext,cameras:Camera[],read:()=>{cameraId:string;compact:boolean},select:(id:string)=>void,openObserver:()=>void) {
  const lifecycle=new AbortController();
  const tools:Tool[]=[
    {name:'read_wildlife_channels',title:'查看动物直播机位',description:'读取机位地址、观看方式与当前机位。不会打开外站或播放视频。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({current:read(),channels:cameras.map(c=>({id:c.id,name:c.name,country:c.country,source:c.source,playback:c.embed?(c.embed.includes('ipanda.com')?'official_page_in_frame':'embedded_player'):'official_site'}))})},
    {name:'select_wildlife_channel',title:'切换动物直播机位',description:'切换监控器到指定机位的预览，用户点击接通信号后播放。',inputSchema:{type:'object',properties:{cameraId:{type:'string',enum:cameras.map(c=>c.id)}},required:['cameraId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||typeof input!=='object'||!('cameraId'in input)||typeof input.cameraId!=='string'||!cameras.some(c=>c.id===input.cameraId))throw new Error('Unknown cameraId');select(input.cameraId);return read();}},
    {name:'open_animal_observer',title:'打开截图识图入口',description:'打开动物观察员窗口。不会截屏、上传图片或向第三方发送内容；图片由用户选择，打开窗口不会开始识别。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>{openObserver();return {opened:true};}}
  ];
  for(const tool of tools){try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{ /* Optional browser capability. */ }}
  return ()=>lifecycle.abort();
}
