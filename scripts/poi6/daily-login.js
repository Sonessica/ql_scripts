const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
require('dotenv').config();

const {
  trimText, toBoolean, toInt, ensureDir, pickValue, sanitizeProfileName,
  formatMinutes, saveStorageState, takeScreenshot, pushBarkNotification,
} = require('../shared/utils');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data', 'poi6');
const SCREENSHOT_DIR = path.join(ROOT_DIR, 'screenshots', 'poi6');
const DEFAULT_STATE_PATH = path.join(DATA_DIR, 'poi6-storage.json');
const DEFAULT_BASE_URL = process.env.POI6_BASE_URL || 'https://poi6.net/';
const DEFAULT_HEADLESS = toBoolean(process.env.POI6_HEADLESS, true);
const DEFAULT_TIMEOUT_MS = toInt(process.env.POI6_TIMEOUT_MS, 120000);
const DEFAULT_ONLINE_WAIT_MS = toInt(process.env.POI6_ONLINE_WAIT_MS, 300000);
const DEFAULT_EMAIL = trimText(process.env.POI6_EMAIL);
const DEFAULT_PASSWORD = trimText(process.env.POI6_PASSWORD);
const DEFAULT_REMEMBER_LOGIN = toBoolean(process.env.POI6_REMEMBER_LOGIN, true);
const DEFAULT_STORAGE_STATE_B64 = trimText(process.env.POI6_STORAGE_STATE_B64);
const DEFAULT_STORAGE_STATE_PATH = path.resolve(process.env.POI6_STORAGE_STATE_PATH || DEFAULT_STATE_PATH);
const DEFAULT_BARK_PUSH_URL = trimText(process.env.POI6_BARK_PUSH_URL);
const DEFAULT_BARK_SCREENSHOT_BASE_URL = trimText(process.env.POI6_BARK_SCREENSHOT_BASE_URL);
const DEFAULT_BARK_GROUP = trimText(process.env.POI6_BARK_GROUP) || 'poi6';
const CONTINUE_ON_ERROR = toBoolean(process.env.POI6_CONTINUE_ON_ERROR, true);

function log(message, accountConfig) {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const prefix = accountConfig ? `[${accountConfig.name}] ` : '';
  console.log(`[${now}] ${prefix}${message}`);
}

function resolveStorageStatePath(rawPath, profileKey, isMultiMode) {
  const customPath = trimText(rawPath);
  if (customPath) {
    return path.resolve(customPath);
  }

  if (isMultiMode) {
    return path.join(DATA_DIR, `poi6-storage-${profileKey}.json`);
  }

  return DEFAULT_STORAGE_STATE_PATH;
}

function normalizeAccountConfig(source, index, isMultiMode) {
  const name = trimText(pickValue(source, ['name', 'alias', 'profile'])) || (isMultiMode ? `account-${index + 1}` : 'default');
  const profileKey = sanitizeProfileName(name, isMultiMode ? `account-${index + 1}` : 'default');

  return {
    name,
    profileKey,
    screenshotPrefix: profileKey,
    baseUrl: trimText(pickValue(source, ['baseUrl', 'base_url'], DEFAULT_BASE_URL)) || DEFAULT_BASE_URL,
    headless: toBoolean(pickValue(source, ['headless'], DEFAULT_HEADLESS), DEFAULT_HEADLESS),
    timeoutMs: toInt(pickValue(source, ['timeoutMs', 'timeout_ms'], DEFAULT_TIMEOUT_MS), DEFAULT_TIMEOUT_MS),
    onlineWaitMs: toInt(pickValue(source, ['onlineWaitMs', 'online_wait_ms'], DEFAULT_ONLINE_WAIT_MS), DEFAULT_ONLINE_WAIT_MS),
    email: trimText(pickValue(source, ['email', 'account', 'username'], isMultiMode ? '' : DEFAULT_EMAIL)),
    password: trimText(pickValue(source, ['password'], isMultiMode ? '' : DEFAULT_PASSWORD)),
    rememberLogin: toBoolean(pickValue(source, ['rememberLogin', 'remember_login'], isMultiMode ? '' : DEFAULT_REMEMBER_LOGIN), DEFAULT_REMEMBER_LOGIN),
    storageStateB64: trimText(
      pickValue(source, ['storageStateB64', 'storage_state_b64', 'storageStateBase64'], isMultiMode ? '' : DEFAULT_STORAGE_STATE_B64)
    ),
    storageStatePath: resolveStorageStatePath(
      pickValue(source, ['storageStatePath', 'storage_state_path'], isMultiMode ? '' : DEFAULT_STORAGE_STATE_PATH),
      profileKey,
      isMultiMode
    ),
    barkPushUrl: trimText(pickValue(source, ['barkPushUrl', 'bark_push_url'], isMultiMode ? '' : DEFAULT_BARK_PUSH_URL)),
    barkScreenshotBaseUrl: trimText(
      pickValue(source, ['barkScreenshotBaseUrl', 'bark_screenshot_base_url'], isMultiMode ? '' : DEFAULT_BARK_SCREENSHOT_BASE_URL)
    ),
    barkGroup: trimText(pickValue(source, ['barkGroup', 'bark_group'], isMultiMode ? '' : DEFAULT_BARK_GROUP)) || DEFAULT_BARK_GROUP,
  };
}

function loadAccountsConfig() {
  const raw = trimText(process.env.POI6_MULTI_ACCOUNTS_JSON);
  if (!raw) {
    return [normalizeAccountConfig({}, 0, false)];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`POI6_MULTI_ACCOUNTS_JSON 不是合法 JSON：${error.message}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('POI6_MULTI_ACCOUNTS_JSON 必须是非空数组。');
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`POI6_MULTI_ACCOUNTS_JSON 第 ${index + 1} 项必须是对象。`);
    }
    return normalizeAccountConfig(item, index, true);
  });
}

function prepareStorageState(accountConfig) {
  ensureDir(path.dirname(accountConfig.storageStatePath));

  if (accountConfig.storageStateB64) {
    try {
      const decoded = Buffer.from(accountConfig.storageStateB64, 'base64').toString('utf8');
      JSON.parse(decoded);
      fs.writeFileSync(accountConfig.storageStatePath, decoded, 'utf8');
      log(`已从环境变量还原登录态文件：${accountConfig.storageStatePath}`, accountConfig);
      return accountConfig.storageStatePath;
    } catch (error) {
      throw new Error(`storage state Base64 解码失败：${error.message}`);
    }
  }

  if (fs.existsSync(accountConfig.storageStatePath)) {
    log(`检测到本地登录态文件：${accountConfig.storageStatePath}`, accountConfig);
    return accountConfig.storageStatePath;
  }

  return undefined;
}

function buildContextOptions(storageStatePath) {
  const options = {
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  };

  if (storageStatePath) {
    options.storageState = storageStatePath;
  }

  return options;
}

async function isLoginFormVisible(page) {
  const emailVisible = await page.locator('input[type="email"]').first().isVisible().catch(() => false);
  const passwordVisible = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
  return emailVisible && passwordVisible;
}

async function loginIfNeeded(page, accountConfig) {
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);

  const atLoginPage = page.url().includes('/auth/login');
  const loginFormVisible = await isLoginFormVisible(page);
  if (!atLoginPage && !loginFormVisible) {
    log('当前未检测到登录表单，默认复用已有登录态。', accountConfig);
    return;
  }

  if (!accountConfig.email || !accountConfig.password) {
    throw new Error('当前处于 Poi6 登录页，但未提供 POI6_EMAIL / POI6_PASSWORD，也没有可用登录态。');
  }

  log('检测到登录页，开始账号密码登录。', accountConfig);
  await page.locator('input[type="email"]').first().fill(accountConfig.email, { timeout: 10000 });
  await page.locator('input[type="password"]').first().fill(accountConfig.password, { timeout: 10000 });

  const rememberLocator = page.locator('input[name="remember"]').first();
  const rememberExists = (await rememberLocator.count().catch(() => 0)) > 0;
  if (rememberExists) {
    const checked = await rememberLocator.isChecked().catch(() => false);
    if (accountConfig.rememberLogin && !checked) {
      await rememberLocator.check({ force: true }).catch(() => {});
    }
    if (!accountConfig.rememberLogin && checked) {
      await rememberLocator.uncheck({ force: true }).catch(() => {});
    }
  }

  const loginButton = page.locator('button').filter({ hasText: /登入|login/i }).first();
  await loginButton.click({ timeout: 10000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);

  if (await isLoginFormVisible(page)) {
    throw new Error('提交登录后仍停留在登录页，请检查账号密码是否正确，或站点是否出现额外验证。');
  }

  log('Poi6 登录成功，开始保持在线。', accountConfig);
}

async function runSingleAccount(accountConfig) {
  const storageStatePath = prepareStorageState(accountConfig);
  const browser = await chromium.launch({ headless: accountConfig.headless });
  const context = await browser.newContext(buildContextOptions(storageStatePath));
  const page = await context.newPage();

  try {
    log(`打开 Poi6：${accountConfig.baseUrl}`, accountConfig);
    await page.goto(accountConfig.baseUrl, { waitUntil: 'domcontentloaded', timeout: accountConfig.timeoutMs });
    await loginIfNeeded(page, accountConfig);

    log(`开始固定在线 ${accountConfig.onlineWaitMs}ms，用于触发 Poi6 每日在线签到。`, accountConfig);
    await page.waitForTimeout(accountConfig.onlineWaitMs);

    await saveStorageState(context, accountConfig.storageStatePath, log, accountConfig);
    const screenshotPath = await takeScreenshot(page, SCREENSHOT_DIR, accountConfig.screenshotPrefix, 'poi6-online-final', log, accountConfig);
    const barkBody = [
      `账号：${accountConfig.name}`,
      `在线时长：${formatMinutes(accountConfig.onlineWaitMs)} 分钟`,
      'Poi6 已完成固定在线时长，请以最终截图为准确认积分是否到账。',
      `截图：${screenshotPath}`,
    ].join('\n');

    await pushBarkNotification(accountConfig, `Poi6 在线签到完成：${accountConfig.name}`, barkBody, screenshotPath, log).catch((error) => {
      log(`Bark 推送失败：${error.message}`, accountConfig);
    });

    log('任务结束：已完成 Poi6 登录并保持在线。', accountConfig);
  } catch (error) {
    let screenshotPath = '';
    try {
      screenshotPath = await takeScreenshot(page, SCREENSHOT_DIR, accountConfig.screenshotPrefix, 'poi6-login-error', log, accountConfig);
    } catch {
      // ignore screenshot errors
    }

    const barkBody = [
      `账号：${accountConfig.name}`,
      `执行失败：${error.message}`,
      screenshotPath ? `截图：${screenshotPath}` : '截图：未成功生成',
    ].join('\n');

    await pushBarkNotification(accountConfig, `Poi6 在线签到失败：${accountConfig.name}`, barkBody, screenshotPath, log).catch((pushError) => {
      log(`Bark 推送失败：${pushError.message}`, accountConfig);
    });

    throw error;
  } finally {
    await browser.close();
  }
}

async function main() {
  const accounts = loadAccountsConfig();
  log(`本次共需处理 ${accounts.length} 个 Poi6 账号。`);

  const results = [];

  for (const accountConfig of accounts) {
    try {
      await runSingleAccount(accountConfig);
      results.push({ name: accountConfig.name, success: true });
    } catch (error) {
      results.push({ name: accountConfig.name, success: false, error });
      log(`执行失败：${error.message}`, accountConfig);
      if (!CONTINUE_ON_ERROR) {
        break;
      }
    }
  }

  const successCount = results.filter((item) => item.success).length;
  const failed = results.filter((item) => !item.success);
  log(`执行完成：成功 ${successCount} 个，失败 ${failed.length} 个。`);

  if (failed.length > 0) {
    const summary = failed.map((item) => `${item.name}（${item.error.message}）`).join('；');
    throw new Error(`以下 Poi6 账号执行失败：${summary}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
