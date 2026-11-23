const statusLine=document.getElementById('startup');
if (location.protocol==='file:') statusLine.textContent='请解压整个工程，双击「启动体验.cmd」进入睡莲湾。';
else import('./app.js').catch(error=>{
  console.error(error);
  statusLine.textContent='场景未能加载。请确认已完整解压工程，并使用支持 WebGL 的 Edge 打开。';
});