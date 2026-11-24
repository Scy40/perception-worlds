const statusLine = document.getElementById('startup');
const startButton = document.getElementById('startCamera');

import('./app.js').then(() => {
  statusLine.textContent = '点击开始，浏览器询问时请选择「允许」。';
  startButton.disabled = false;
}).catch(error => {
  console.error(error);
  statusLine.textContent = '场景未能加载。请刷新页面，或用电脑上的 Chrome 或 Edge 打开。';
});
