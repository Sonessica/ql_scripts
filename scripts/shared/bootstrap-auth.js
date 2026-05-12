const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');

const { trimText, toInt, ensureDir, sanitizeProfileName } = require('./utils');

function createBootstrapAuth(siteConfig) {
  const {
    envPrefix,
    defaultBaseUrl,
    defaultStateDir,
    defaultStateFileName,
    promptMessage,
    aliasHelpText,
    stateEnvVarName,
    storageStatePathEnvVar,
    storageStateB64EnvVar,
    aliasEnvVar,
    timeoutEnvVar,
    viewportWidth = 1600,
  } = siteConfig;

  return async function run() {
    const ROOT_DIR = path.resolve(__dirname, '..', '..');
    const DEFAULT_STATE_PATH = path.join(ROOT_DIR, 'data', defaultStateDir, defaultStateFileName);
    const BASE_URL = process.env[`${envPrefix}_BASE_URL`] || defaultBaseUrl;
    const ACCOUNT_ALIAS = getArgValue(['alias', 'profile']) || trimText(process.env[aliasEnvVar]);
    const PROFILE_KEY = sanitizeProfileName(ACCOUNT_ALIAS, '');
    const STATE_PATH = resolveStatePath(process.env[storageStatePathEnvVar], PROFILE_KEY);
    const TIMEOUT_MS = toInt(process.env[timeoutEnvVar], 120000);

    function log(message) {
      const now = new Date().toLocaleString('zh-CN', { hour12: false });
      const prefix = ACCOUNT_ALIAS ? `[${ACCOUNT_ALIAS}] ` : '';
      console.log(`[${now}] ${prefix}${message}`);
    }

    function resolveStatePath(rawPath, profileKey) {
      const customPath = trimText(rawPath);
      if (customPath) {
        return path.resolve(customPath);
      }

      if (profileKey) {
        return path.join(ROOT_DIR, 'data', defaultStateDir, `${defaultStateFileName.replace('.json', '')}-${profileKey}.json`);
      }

      return path.resolve(DEFAULT_STATE_PATH);
    }

    function getArgValue(names) {
      for (const rawArg of process.argv.slice(2)) {
        for (const name of names) {
          const prefix = `--${name}=`;
          if (rawArg.startsWith(prefix)) {
            return trimText(rawArg.slice(prefix.length));
          }
        }
      }
      return '';
    }

    function waitForUserConfirm() {
      return new Promise((resolve, reject) => {
        if (process.stdin.isTTY) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          rl.on('close', () => {
            reject(new Error('stdin 已关闭，无法等待用户输入。'));
          });

          rl.question(promptMessage, () => {
            rl.removeAllListeners('close');
            rl.close();
            resolve();
          });
        } else {
          const signalFile = path.join(ROOT_DIR, 'data', `.auth-done-${defaultStateDir}`);
          console.log(`\n当前终端不支持交互输入。完成登录后，请在另一个终端执行：`);
          if (process.platform === 'win32') {
            console.log(`  echo. > "${signalFile}"`);
          } else {
            console.log(`  touch "${signalFile}"`);
          }
          console.log(`\n等待信号文件：${signalFile}\n`);

          const interval = setInterval(() => {
            try {
              if (fs.existsSync(signalFile)) {
                clearInterval(interval);
                fs.unlinkSync(signalFile);
                resolve();
              }
            } catch {
              // ignore transient fs errors
            }
          }, 1000);
        }
      });
    }

    ensureDir(path.dirname(STATE_PATH));
    log(`即将打开网页：${BASE_URL}`);
    log(`登录态将保存到：${STATE_PATH}`);
    if (ACCOUNT_ALIAS) {
      log(`当前账号别名：${ACCOUNT_ALIAS}`);
    }

    const browser = await chromium.launch({
      headless: false,
      slowMo: 80,
    });

    try {
      const context = await browser.newContext({
        viewport: { width: viewportWidth, height: 900 },
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
      });

      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

      log(aliasHelpText);
      await waitForUserConfirm();

      await context.storageState({ path: STATE_PATH });
      const raw = fs.readFileSync(STATE_PATH, 'utf8');
      const base64 = Buffer.from(raw, 'utf8').toString('base64');

      log('登录态已保存。');
      console.log(`\n===== 可复制到青龙环境变量 \`${stateEnvVarName}\` 的内容开始 =====\n`);
      console.log(base64);
      console.log(`\n===== 可复制到青龙环境变量 \`${stateEnvVarName}\` 的内容结束 =====\n`);
      console.log(`也可以直接把文件复制到登录态路径：${STATE_PATH}`);

      if (ACCOUNT_ALIAS) {
        console.log(`多账号模式建议在 \`${envPrefix}_MULTI_ACCOUNTS_JSON\` 中使用 \`name=${ACCOUNT_ALIAS}\`，并把 \`storageStatePath\` 指向上面的文件。`);
      }
    } finally {
      await browser.close();
    }
  };
}

module.exports = { createBootstrapAuth };
