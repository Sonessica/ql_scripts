const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');
require('dotenv').config();

const ROOT_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(ROOT_DIR, 'screenshots');
const DEFAULT_STATE_PATH = path.join(ROOT_DIR, 'data', 'maj-soul-storage.json');
const BASE_URL = process.env.MAJSOUL_BASE_URL || 'https://game.maj-soul.com/1/';
const ACCOUNT_ALIAS = getArgValue(['alias', 'profile']) || trimText(process.env.MAJSOUL_ACCOUNT_ALIAS);
const PROFILE_KEY = sanitizeProfileName(ACCOUNT_ALIAS, '');
const STATE_PATH = resolveStatePath(process.env.MAJSOUL_STORAGE_STATE_PATH, PROFILE_KEY);
const TIMEOUT_MS = toInt(process.env.MAJSOUL_TIMEOUT_MS, 120000);
const INITIAL_LOAD_WAIT_MS = toInt(process.env.MAJSOUL_INITIAL_LOAD_WAIT_MS, 20000);
const AFTER_START_WAIT_MS = toInt(process.env.MAJSOUL_AFTER_START_WAIT_MS, 15000);

function log(message) {
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const prefix = ACCOUNT_ALIAS ? `[${ACCOUNT_ALIAS}] ` : '';
  console.log(`[${now}] ${prefix}${message}`);
}

function trimText(value) {
  return value == null ? '' : String(value).trim();
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeProfileName(value, fallback) {
  const normalized = trimText(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || fallback;
}

function resolveStatePath(rawPath, profileKey) {
  const customPath = trimText(rawPath);
  if (customPath) {
    return path.resolve(customPath);
  }

  if (profileKey) {
    return path.join(ROOT_DIR, 'data', `maj-soul-storage-${profileKey}.json`);
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

function waitForEnter() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('请在浏览器中完成雀魂登录，并进入能看到大厅/首页的状态，然后回到终端按回车继续保存登录态。\n', () => {
      rl.close();
      resolve();
    });
  });
}

async function takeDebugScreenshot(page, suffix) {
  ensureDir(SCREENSHOT_DIR);
  const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
  const namePrefix = PROFILE_KEY ? `${PROFILE_KEY}-` : '';
  const fullPath = path.join(SCREENSHOT_DIR, `${timestamp}-${namePrefix}${suffix}.png`);
  await page.screenshot({ path: fullPath, fullPage: true }).catch(() => {});
  log(`调试截图已保存：${fullPath}`);
}

async function waitAndSnapshot(page, waitMs, suffix, description) {
  log(`${description}，等待 ${waitMs}ms。`);
  await page.waitForTimeout(waitMs);
  await takeDebugScreenshot(page, suffix);
}

async function maybeClickStart(page) {
  const candidates = [/开始游戏/i, /进入游戏/i];
  for (const pattern of candidates) {
    const locator = page.getByText(pattern).first();
    const count = await locator.count().catch(() => 0);
    if (!count) continue;

    const visible = await locator.isVisible().catch(() => false);
    if (!visible) continue;

    try {
      await locator.click({ timeout: 5000, force: true });
      log('已点击开始游戏。');
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

async function main() {
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

  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });

  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  await takeDebugScreenshot(page, 'bootstrap-opened');
  await waitAndSnapshot(page, INITIAL_LOAD_WAIT_MS, 'bootstrap-after-initial-wait', '首屏已打开，继续给登录入口加载时间');

  const clickedStart = await maybeClickStart(page);
  if (clickedStart) {
    await takeDebugScreenshot(page, 'bootstrap-after-start-click');
    await waitAndSnapshot(page, AFTER_START_WAIT_MS, 'bootstrap-after-start-wait', '已点击开始游戏，继续等待登录页加载');
  }

  log('请在打开的浏览器里手动完成登录。');
  log('如果登录页或大厅还在慢慢加载，可以多等一会儿，再回终端按回车保存登录态。');
  await waitForEnter();
  await takeDebugScreenshot(page, 'bootstrap-before-save-state');

  await context.storageState({ path: STATE_PATH });
  const raw = fs.readFileSync(STATE_PATH, 'utf8');
  const base64 = Buffer.from(raw, 'utf8').toString('base64');

  log('登录态已保存。');
  console.log('\n===== 可复制到青龙环境变量 `MAJSOUL_STORAGE_STATE_B64` 的内容开始 =====\n');
  console.log(base64);
  console.log('\n===== 可复制到青龙环境变量 `MAJSOUL_STORAGE_STATE_B64` 的内容结束 =====\n');
  console.log(`也可以直接把文件复制到仓库里的登录态路径：${STATE_PATH}`);

  if (ACCOUNT_ALIAS) {
    console.log(`多账号模式建议在 \`MAJSOUL_MULTI_ACCOUNTS_JSON\` 中使用 \`name=${ACCOUNT_ALIAS}\`，并把 \`storageStatePath\` 指向上面的文件。`);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
