const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
require('dotenv').config();

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const SCREENSHOT_DIR = path.join(ROOT_DIR, 'screenshots');
const DEFAULT_STATE_PATH = path.join(DATA_DIR, 'maj-soul-storage.json');
const DEFAULT_BASE_URL = process.env.MAJSOUL_BASE_URL || 'https://game.maj-soul.com/1/';
const DEFAULT_HEADLESS = toBoolean(process.env.MAJSOUL_HEADLESS, true);
const DEFAULT_TIMEOUT_MS = toInt(process.env.MAJSOUL_TIMEOUT_MS, 120000);
const DEFAULT_INITIAL_LOAD_WAIT_MS = toInt(process.env.MAJSOUL_INITIAL_LOAD_WAIT_MS, 20000);
const DEFAULT_AFTER_START_WAIT_MS = toInt(process.env.MAJSOUL_AFTER_START_WAIT_MS, 15000);
const DEFAULT_POST_LOGIN_WAIT_MS = toInt(process.env.MAJSOUL_POST_LOGIN_WAIT_MS, 50000);
const DEFAULT_FINAL_STABILIZE_WAIT_MS = toInt(process.env.MAJSOUL_FINAL_STABILIZE_WAIT_MS, 8000);
const DEFAULT_ACCOUNT = trimText(process.env.MAJSOUL_ACCOUNT);
const DEFAULT_PASSWORD = trimText(process.env.MAJSOUL_PASSWORD);
const DEFAULT_STORAGE_STATE_B64 = trimText(process.env.MAJSOUL_STORAGE_STATE_B64);
const DEFAULT_STORAGE_STATE_PATH = path.resolve(process.env.MAJSOUL_STORAGE_STATE_PATH || DEFAULT_STATE_PATH);
const CONTINUE_ON_ERROR = toBoolean(process.env.MAJSOUL_CONTINUE_ON_ERROR, true);

function log(message, accountConfig) {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const prefix = accountConfig ? `[${accountConfig.name}] ` : '';
  console.log(`[${now}] ${prefix}${message}`);
}

function trimText(value) {
  return value == null ? '' : String(value).trim();
}

function toBoolean(value, fallback) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function pickValue(source, keys, fallback = '') {
  for (const key of keys) {
    if (source[key] != null && source[key] !== '') {
      return source[key];
    }
  }
  return fallback;
}

function sanitizeProfileName(value, fallback) {
  const normalized = trimText(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || fallback;
}

function resolveStorageStatePath(rawPath, profileKey, isMultiMode) {
  const customPath = trimText(rawPath);
  if (customPath) {
    return path.resolve(customPath);
  }

  if (isMultiMode) {
    return path.join(DATA_DIR, `maj-soul-storage-${profileKey}.json`);
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
    initialLoadWaitMs: toInt(
      pickValue(source, ['initialLoadWaitMs', 'initial_load_wait_ms'], DEFAULT_INITIAL_LOAD_WAIT_MS),
      DEFAULT_INITIAL_LOAD_WAIT_MS
    ),
    afterStartWaitMs: toInt(
      pickValue(source, ['afterStartWaitMs', 'after_start_wait_ms'], DEFAULT_AFTER_START_WAIT_MS),
      DEFAULT_AFTER_START_WAIT_MS
    ),
    postLoginWaitMs: toInt(
      pickValue(source, ['postLoginWaitMs', 'post_login_wait_ms'], DEFAULT_POST_LOGIN_WAIT_MS),
      DEFAULT_POST_LOGIN_WAIT_MS
    ),
    finalStabilizeWaitMs: toInt(
      pickValue(source, ['finalStabilizeWaitMs', 'final_stabilize_wait_ms'], DEFAULT_FINAL_STABILIZE_WAIT_MS),
      DEFAULT_FINAL_STABILIZE_WAIT_MS
    ),
    account: trimText(pickValue(source, ['account', 'username'], isMultiMode ? '' : DEFAULT_ACCOUNT)),
    password: trimText(pickValue(source, ['password'], isMultiMode ? '' : DEFAULT_PASSWORD)),
    storageStateB64: trimText(
      pickValue(source, ['storageStateB64', 'storage_state_b64', 'storageStateBase64'], isMultiMode ? '' : DEFAULT_STORAGE_STATE_B64)
    ),
    storageStatePath: resolveStorageStatePath(
      pickValue(source, ['storageStatePath', 'storage_state_path'], isMultiMode ? '' : DEFAULT_STORAGE_STATE_PATH),
      profileKey,
      isMultiMode
    ),
  };
}

function loadAccountsConfig() {
  const raw = trimText(process.env.MAJSOUL_MULTI_ACCOUNTS_JSON);
  if (!raw) {
    return [normalizeAccountConfig({}, 0, false)];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`MAJSOUL_MULTI_ACCOUNTS_JSON 不是合法 JSON：${error.message}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('MAJSOUL_MULTI_ACCOUNTS_JSON 必须是非空数组。');
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`MAJSOUL_MULTI_ACCOUNTS_JSON 第 ${index + 1} 项必须是对象。`);
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

  log('未提供 storage state，后续将尝试账号密码登录。', accountConfig);
  return undefined;
}

async function saveStorageState(context, accountConfig) {
  ensureDir(path.dirname(accountConfig.storageStatePath));
  await context.storageState({ path: accountConfig.storageStatePath });
  log(`已刷新本地登录态：${accountConfig.storageStatePath}`, accountConfig);
}

async function takeScreenshot(page, accountConfig, suffix) {
  ensureDir(SCREENSHOT_DIR);
  const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
  const fullPath = path.join(SCREENSHOT_DIR, `${timestamp}-${accountConfig.screenshotPrefix}-${suffix}.png`);
  await page.screenshot({ path: fullPath, fullPage: true }).catch(() => {});
  log(`截图已保存：${fullPath}`, accountConfig);
}

async function waitAndSnapshot(page, accountConfig, waitMs, suffix, description) {
  log(`${description}，等待 ${waitMs}ms。`, accountConfig);
  await page.waitForTimeout(waitMs);
  await takeScreenshot(page, accountConfig, suffix);
}

async function clickLocator(locator, accountConfig, description, timeout = 5000) {
  const target = locator.first();
  const count = await target.count().catch(() => 0);
  if (!count) return false;

  const visible = await target.isVisible().catch(() => false);
  if (!visible) return false;

  try {
    await target.click({ timeout, force: true });
    log(`已点击：${description}`, accountConfig);
    return true;
  } catch {
    return false;
  }
}

async function clickByPatterns(page, accountConfig, patterns, description) {
  for (const pattern of patterns) {
    if (await clickLocator(page.getByRole('button', { name: pattern }), accountConfig, `${description}（button）`)) {
      return true;
    }
    if (await clickLocator(page.getByText(pattern), accountConfig, `${description}（text）`)) {
      return true;
    }
  }
  return false;
}

async function fillBySelectors(page, accountConfig, selectors, value, label) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (!count) continue;

    const visible = await locator.isVisible().catch(() => false);
    if (!visible) continue;

    try {
      await locator.click({ timeout: 5000 });
      await locator.fill(value, { timeout: 5000 });
      log(`已填写：${label}`, accountConfig);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function existsByPatterns(page, patterns) {
  for (const pattern of patterns) {
    const locator = page.getByText(pattern).first();
    const count = await locator.count().catch(() => 0);
    if (!count) continue;

    if (await locator.isVisible().catch(() => false)) {
      return true;
    }
  }
  return false;
}

async function maybeClickStart(page, accountConfig) {
  const clicked = await clickByPatterns(page, accountConfig, [/开始游戏/i, /进入游戏/i], '开始游戏');
  if (clicked) {
    await takeScreenshot(page, accountConfig, 'after-start-click');
    await waitAndSnapshot(
      page,
      accountConfig,
      accountConfig.afterStartWaitMs,
      'after-start-wait',
      '已点击开始游戏，继续等待登录页加载'
    );
  }
}

async function hasLoginEntrance(page) {
  return existsByPatterns(page, [/账号登录/i, /游客登录/i, /注册账号/i]);
}

async function hasLoginForm(page) {
  const selectors = [
    'input[type="password"]',
    'input[name*="user"]',
    'input[name*="account"]',
    'input[placeholder*="账号"]',
    'input[placeholder*="手机"]',
    'input[placeholder*="邮箱"]',
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (!count) continue;

    if (await locator.isVisible().catch(() => false)) {
      return true;
    }
  }
  return false;
}

async function isProbablyLoggedIn(page) {
  if (await hasLoginEntrance(page)) return false;
  if (await hasLoginForm(page)) return false;

  const canvasCount = await page.locator('canvas').count().catch(() => 0);
  if (canvasCount > 0) return true;

  const localStorageKeys = await page.evaluate(() => Object.keys(window.localStorage || {})).catch(() => []);
  return Array.isArray(localStorageKeys) && localStorageKeys.length > 0;
}

async function tryPasswordLogin(page, accountConfig) {
  if (!accountConfig.account || !accountConfig.password) {
    return false;
  }

  await clickByPatterns(page, accountConfig, [/账号登录/i, /^登录$/i], '账号登录入口');
  await takeScreenshot(page, accountConfig, 'after-login-entry-click');
  await waitAndSnapshot(
    page,
    accountConfig,
    accountConfig.afterStartWaitMs,
    'after-login-form-wait',
    '已进入登录流程，继续等待表单完全渲染'
  );

  const accountFilled = await fillBySelectors(
    page,
    accountConfig,
    [
      'input[type="text"]',
      'input[type="email"]',
      'input[name*="user"]',
      'input[name*="account"]',
      'input[placeholder*="账号"]',
      'input[placeholder*="手机"]',
      'input[placeholder*="邮箱"]',
    ],
    accountConfig.account,
    '账号'
  );

  const passwordFilled = await fillBySelectors(
    page,
    accountConfig,
    [
      'input[type="password"]',
      'input[name*="password"]',
      'input[placeholder*="密码"]',
    ],
    accountConfig.password,
    '密码'
  );

  if (!accountFilled || !passwordFilled) {
    log('未能定位到登录表单，无法执行账号密码登录。', accountConfig);
    return false;
  }

  await takeScreenshot(page, accountConfig, 'after-fill-login-form');
  await clickByPatterns(page, accountConfig, [/登录/i, /确认/i], '登录提交');
  await takeScreenshot(page, accountConfig, 'after-login-submit');
  await waitAndSnapshot(
    page,
    accountConfig,
    accountConfig.postLoginWaitMs,
    'after-post-login-wait',
    '登录已提交，继续等待验证完成并进入大厅'
  );
  return isProbablyLoggedIn(page);
}

async function dismissCommonPopups(page, accountConfig) {
  const popupPatterns = [/确定/i, /确认/i, /知道了/i, /我知道了/i, /关闭/i, /收下/i];
  for (let i = 0; i < 3; i += 1) {
    const clicked = await clickByPatterns(page, accountConfig, popupPatterns, `通用弹窗第 ${i + 1} 次`);
    if (!clicked) break;
    await waitAndSnapshot(
      page,
      accountConfig,
      1500,
      `after-popup-wait-${i + 1}`,
      `已处理第 ${i + 1} 次通用弹窗，继续等待页面刷新`
    );
  }
}

function buildContextOptions(storageStatePath) {
  const options = {
    viewport: { width: 1600, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  };


  if (storageStatePath) {
    options.storageState = storageStatePath;
  }

  return options;
}

async function runSingleAccount(accountConfig) {
  const storageStatePath = prepareStorageState(accountConfig);
  const browser = await chromium.launch({ headless: accountConfig.headless });
  const context = await browser.newContext(buildContextOptions(storageStatePath));

  const page = await context.newPage();

  try {
    log(`打开雀魂网页版：${accountConfig.baseUrl}`, accountConfig);
    await page.goto(accountConfig.baseUrl, { waitUntil: 'domcontentloaded', timeout: accountConfig.timeoutMs });
    await takeScreenshot(page, accountConfig, 'opened');
    await waitAndSnapshot(
      page,
      accountConfig,
      accountConfig.initialLoadWaitMs,
      'after-initial-wait',
      '首屏已打开，继续等待首页资源和入口加载完成'
    );
    await maybeClickStart(page, accountConfig);

    if (!(await isProbablyLoggedIn(page))) {
      log('当前尚未检测到有效登录态，开始尝试账号密码登录。', accountConfig);
      const loggedIn = await tryPasswordLogin(page, accountConfig);
      if (!loggedIn) {
        throw new Error('未检测到有效登录态，且账号密码登录也失败了。请先运行 bootstrap-auth.js 采集该账号登录态。');
      }
    } else {
      await takeScreenshot(page, accountConfig, 'restored-session-detected');
      await waitAndSnapshot(
        page,
        accountConfig,
        accountConfig.postLoginWaitMs,
        'after-restored-session-wait',
        '已恢复登录态，继续等待自动验证和大厅加载完成'
      );
    }

    log('已进入疑似登录态页面，开始处理首屏弹窗。', accountConfig);
    await takeScreenshot(page, accountConfig, 'before-dismiss-popups');
    await dismissCommonPopups(page, accountConfig);
    await takeScreenshot(page, accountConfig, 'after-dismiss-popups');
    await waitAndSnapshot(
      page,
      accountConfig,
      accountConfig.finalStabilizeWaitMs,
      'after-final-stabilize-wait',
      '弹窗处理完成，继续等待页面稳定'
    );

    await saveStorageState(context, accountConfig);
    await takeScreenshot(page, accountConfig, 'login-auto-claim-finished');
    log('任务结束：已完成登录并等待自动领取流程，请结合截图确认月卡奖励是否已到账。', accountConfig);
  } catch (error) {
    await takeScreenshot(page, accountConfig, 'claim-error');
    throw error;
  } finally {
    await browser.close();
  }
}

async function main() {
  const accounts = loadAccountsConfig();
  log(`本次共需处理 ${accounts.length} 个账号。`);

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
    throw new Error(`以下账号执行失败：${summary}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
