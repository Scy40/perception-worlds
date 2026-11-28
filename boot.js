const statusLine = document.getElementById('startup');
const retryButton = document.getElementById('startupRetry');
let stageTimer = window.bootWait;

window.lotusStartup = {
  stage(message, timeoutMessage, timeout = 20000) {
    clearTimeout(stageTimer);
    this.failed = false;
    statusLine.textContent = message;
    retryButton.hidden = true;
    stageTimer = setTimeout(() => { statusLine.textContent = timeoutMessage; }, timeout);
  },
  failed: false,
  problem(message, retry = () => location.reload()) {
    clearTimeout(stageTimer);
    statusLine.textContent = message;
    retryButton.onclick = retry;
    retryButton.hidden = false;
    this.failed = true;
  },
  done() {
    clearTimeout(stageTimer);
    retryButton.hidden = true;
    this.failed = false;
  }
};

if (location.protocol === 'file:') {
  lotusStartup.done();
  statusLine.textContent = '请解压整个工程，双击「启动体验.cmd」进入睡莲湾。';
} else {
  lotusStartup.stage('正在加载三维场景组件…', '场景组件仍在下载，请稍候。');
  const timeout = setTimeout(() => {
    if (!lotusStartup.failed && statusLine.dataset.modules !== 'ready')
      lotusStartup.problem('场景组件加载超时，请检查网络后重试。');
  }, 90000);
  import('./app.js?survey=14').catch(error => {
    console.error(error);
    if (!lotusStartup.failed)
      lotusStartup.problem('三维场景文件加载失败，请检查网络后重试。');
  }).finally(() => clearTimeout(timeout));
}
