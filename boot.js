const statusLine = document.getElementById('startup');
const retryButton = document.getElementById('startupRetry');
let stageTimer = window.bootWait;

window.lotusStartup = {
  stage(message, timeoutMessage, timeout = 20000) {
    clearTimeout(stageTimer);
    statusLine.textContent = message;
    retryButton.hidden = true;
    stageTimer = setTimeout(() => this.problem(timeoutMessage), timeout);
  },
  problem(message) {
    clearTimeout(stageTimer);
    statusLine.textContent = message;
    retryButton.hidden = false;
  },
  done() {
    clearTimeout(stageTimer);
    retryButton.hidden = true;
  }
};

if (location.protocol === 'file:') {
  lotusStartup.done();
  statusLine.textContent = '请解压整个工程，双击「启动体验.cmd」进入睡莲湾。';
} else {
  lotusStartup.stage('正在加载三维场景组件…', '场景组件加载超时，请检查网络后重试。');
  import('./app.js').catch(error => {
    console.error(error);
    lotusStartup.problem('场景加载失败，请检查工程文件和浏览器的 WebGL 支持后重试。');
  });
}
