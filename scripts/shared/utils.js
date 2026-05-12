const fs = require('fs');
const path = require('path');

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

function formatMinutes(waitMs) {
  const minutes = waitMs / 60000;
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
}

function buildScreenshotUrl(baseUrl, screenshotPath) {
  const normalizedBaseUrl = trimText(baseUrl);
  if (!normalizedBaseUrl || !screenshotPath) {
    return '';
  }

  const screenshotName = path.basename(screenshotPath).split(path.sep).join('/');
  return `${normalizedBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(screenshotName)}`;
}

async function saveStorageState(context, storageStatePath, log, accountConfig) {
  ensureDir(path.dirname(storageStatePath));
  await context.storageState({ path: storageStatePath });
  log(`已刷新本地登录态：${storageStatePath}`, accountConfig);
}

async function takeScreenshot(page, screenshotDir, screenshotPrefix, suffix, log, accountConfig) {
  ensureDir(screenshotDir);
  const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
  const fileName = `${timestamp}-${screenshotPrefix}-${suffix}.png`;
  const fullPath = path.join(screenshotDir, fileName);
  await page.screenshot({ path: fullPath, fullPage: true });
  log(`截图已保存：${fullPath}`, accountConfig);
  return fullPath;
}

async function pushBarkNotification(accountConfig, title, body, screenshotPath, log) {
  if (!accountConfig.barkPushUrl) {
    return;
  }

  let requestUrl;
  try {
    requestUrl = new URL(accountConfig.barkPushUrl);
  } catch {
    throw new Error(`Bark 推送地址格式错误，请检查配置：${accountConfig.barkPushUrl}`);
  }

  requestUrl.searchParams.set('title', title);
  requestUrl.searchParams.set('body', body);

  if (accountConfig.barkGroup) {
    requestUrl.searchParams.set('group', accountConfig.barkGroup);
  }

  const screenshotUrl = buildScreenshotUrl(accountConfig.barkScreenshotBaseUrl, screenshotPath);
  if (screenshotUrl) {
    requestUrl.searchParams.set('icon', screenshotUrl);
    requestUrl.searchParams.set('image', screenshotUrl);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(requestUrl.toString(), { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Bark 推送超时（15 秒）');
    }
    throw new Error(`Bark 推送失败：${error.message}`);
  } finally {
    clearTimeout(timeout);
  }

  log('Bark 推送已发送。', accountConfig);
}

module.exports = {
  trimText,
  toBoolean,
  toInt,
  ensureDir,
  pickValue,
  sanitizeProfileName,
  formatMinutes,
  buildScreenshotUrl,
  saveStorageState,
  takeScreenshot,
  pushBarkNotification,
};
