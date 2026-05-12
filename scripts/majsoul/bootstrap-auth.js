require('dotenv').config();
const { createBootstrapAuth } = require('../shared/bootstrap-auth');

const run = createBootstrapAuth({
  envPrefix: 'MAJSOUL',
  defaultBaseUrl: 'https://game.maj-soul.com/1/',
  defaultStateDir: 'majsoul',
  defaultStateFileName: 'maj-soul-storage.json',
  promptMessage: '请在浏览器中完成雀魂登录，并确认已经进入大厅，然后回到终端按回车保存登录态。\n',
  aliasHelpText: '请在打开的浏览器里手动完成登录，并进入大厅。',
  stateEnvVarName: 'MAJSOUL_STORAGE_STATE_B64',
  storageStatePathEnvVar: 'MAJSOUL_STORAGE_STATE_PATH',
  storageStateB64EnvVar: 'MAJSOUL_STORAGE_STATE_B64',
  aliasEnvVar: 'MAJSOUL_ACCOUNT_ALIAS',
  timeoutEnvVar: 'MAJSOUL_TIMEOUT_MS',
  viewportWidth: 1600,
});

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
