require('dotenv').config();
const { createBootstrapAuth } = require('../shared/bootstrap-auth');

const run = createBootstrapAuth({
  envPrefix: 'POI6',
  defaultBaseUrl: 'https://poi6.net/',
  defaultStateDir: 'poi6',
  defaultStateFileName: 'poi6-storage.json',
  promptMessage: '请在浏览器中完成 Poi6 登录，并确认已经进入站内页面，然后回到终端按回车保存登录态。\n',
  aliasHelpText: '请在打开的浏览器里手动完成 Poi6 登录。',
  stateEnvVarName: 'POI6_STORAGE_STATE_B64',
  storageStatePathEnvVar: 'POI6_STORAGE_STATE_PATH',
  storageStateB64EnvVar: 'POI6_STORAGE_STATE_B64',
  aliasEnvVar: 'POI6_ACCOUNT_ALIAS',
  timeoutEnvVar: 'POI6_TIMEOUT_MS',
  viewportWidth: 1440,
});

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
