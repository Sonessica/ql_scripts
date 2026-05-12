### 雀魂脚本说明

这个文档描述的是 `ql_scripts` 仓库里当前保留的 **雀魂网页版自动化脚本**。
当前实现采用的是一套非常克制的流程：**继承登录态 -> 固定等待进入大厅 -> 保存最终截图 -> 人工确认月卡是否自动到账**。

> 这个实现刻意不做复杂页面判断，也不做领取按钮定位。对雀魂这个案例来说，月卡通常会在进入大厅时自动到账，因此脚本只负责把流程稳定跑完，并把最终画面留给你确认。

### 相关文件

- `scripts/majsoul/bootstrap-auth.js`：本地一次性采集登录态
- `scripts/majsoul/claim-monthly-pass.js`：青龙里日常运行的固定等待巡检脚本
- `.env.example`：仓库级环境变量模板

### 运行前准备

#### 1. 安装依赖

在仓库目录执行：

```bash
npm install
npx playwright install chromium
```

#### 2. 本地手动采集登录态

推荐先在自己的电脑上执行：

```bash
npm run majsoul:auth
```

或者直接运行：

```bash
node scripts/majsoul/bootstrap-auth.js
```

执行后会：

- 打开雀魂网页版
- 让你在浏览器中手动完成登录并进入大厅
- 你回到终端按回车后，保存登录态到 `data/majsoul/maj-soul-storage.json`
- 同时输出一段 Base64，可直接粘到青龙环境变量 `MAJSOUL_STORAGE_STATE_B64`

### 环境变量

可参考根目录的 `.env.example`：

- `MAJSOUL_BASE_URL`：默认 `https://game.maj-soul.com/1/`
- `MAJSOUL_HEADLESS`：青龙里建议 `true`
- `MAJSOUL_STORAGE_STATE_B64`：单账号模式下推荐，用于把本地登录态带到青龙
- `MAJSOUL_STORAGE_STATE_PATH`：单账号模式下可选，默认 `data/majsoul/maj-soul-storage.json`
- `MAJSOUL_ACCOUNT_ALIAS`：本地采集多账号登录态时可选，用来生成独立登录态文件
- `MAJSOUL_MULTI_ACCOUNTS_JSON`：多账号模式配置，填写后会按顺序逐个处理账号
- `MAJSOUL_CONTINUE_ON_ERROR`：多账号模式下，某个账号失败后是否继续处理后续账号
- `MAJSOUL_TIMEOUT_MS`：页面打开超时
- `MAJSOUL_HALL_WAIT_MS`：固定等待进入大厅的时间，默认 `180000`
- `MAJSOUL_BARK_PUSH_URL`：可选，Bark 推送地址
- `MAJSOUL_BARK_SCREENSHOT_BASE_URL`：可选，截图公网访问基址；配置后 Bark 可直接带图
- `MAJSOUL_BARK_GROUP`：可选，Bark 分组名

### 推荐参数

如果青龙机器性能一般，建议先从下面这组值开始：

```dotenv
MAJSOUL_TIMEOUT_MS=120000
MAJSOUL_HALL_WAIT_MS=180000
```

如果你的机器更快，可以把 `MAJSOUL_HALL_WAIT_MS` 往下试到 `150000` 或 `120000`；如果页面进入大厅仍然慢，就继续上调。

### 多账号如何使用

当前脚本支持 **一个青龙任务顺序跑多个账号**。
推荐做法是：**每个账号采集一份独立登录态，然后放进 `MAJSOUL_MULTI_ACCOUNTS_JSON`**。

#### 1. 分别采集每个账号的登录态

以 PowerShell 为例：

```powershell
$env:MAJSOUL_ACCOUNT_ALIAS='main'; node scripts/majsoul/bootstrap-auth.js
```

```powershell
$env:MAJSOUL_ACCOUNT_ALIAS='alt'; node scripts/majsoul/bootstrap-auth.js
```

采集后默认会生成：

- `data/majsoul/maj-soul-storage-main.json`
- `data/majsoul/maj-soul-storage-alt.json`

#### 2. 在青龙里配置多账号变量

示例：

```json
[
  {
    "name": "main",
    "storageStatePath": "data/majsoul/maj-soul-storage-main.json"
  },
  {
    "name": "alt",
    "storageStatePath": "data/majsoul/maj-soul-storage-alt.json"
  }
]
```

把上面整段 JSON 压成一行后，填进环境变量 `MAJSOUL_MULTI_ACCOUNTS_JSON`。

如果你不想上传文件，也可以给每个账号直接放 Base64：

```json
[
  {
    "name": "main",
    "storageStateB64": "账号1的Base64"
  },
  {
    "name": "alt",
    "storageStateB64": "账号2的Base64"
  }
]
```

如果你想给某个账号单独配置 Bark，也可以在账号对象中额外写：

```json
{
  "name": "main",
  "storageStatePath": "data/majsoul/maj-soul-storage-main.json",
  "barkPushUrl": "https://api.day.app/<你的key>/push",
  "barkScreenshotBaseUrl": "https://example.com/majsoul-screenshots"
}
```

#### 3. 执行逻辑说明

- 配置了 `MAJSOUL_MULTI_ACCOUNTS_JSON` 后，脚本会按数组逐个处理账号
- 每个账号默认使用独立登录态文件，避免多个账号互相覆盖
- 每个账号只会在固定等待结束后生成一张最终截图
- 默认 `MAJSOUL_CONTINUE_ON_ERROR=true`，某个账号失败后，后续账号仍会继续跑；但脚本最终仍会返回失败状态，方便青龙告警

### Bark 推送说明

脚本支持在任务结束后向 Bark 发送一条通知。

需要注意：**Bark 本身不是图片上传服务**。如果你希望通知里直接显示截图，需要你自己给 `screenshots/majsoul/` 提供一个公网静态访问地址，然后把它填到 `MAJSOUL_BARK_SCREENSHOT_BASE_URL`。

如果没有这个公网地址，也可以只配置 `MAJSOUL_BARK_PUSH_URL`，此时 Bark 仍会收到一条文字通知，正文里会带上本地截图路径，方便你回到青龙或宿主机查看。

### 青龙中如何配置

#### 1. 把仓库拉到青龙

按你平时的拉库方式，把这个仓库同步到青龙脚本目录。

#### 2. 在青龙容器里安装依赖

进入仓库目录后执行：

```bash
npm install
npx playwright install chromium
```

#### 3. 配置环境变量

单账号模式下，至少配置下面这项之一：

- `MAJSOUL_STORAGE_STATE_B64`
- 或手动上传 `data/majsoul/maj-soul-storage.json`

多账号模式下，推荐配置：

- `MAJSOUL_MULTI_ACCOUNTS_JSON`
- 并为每个账号准备独立的 `storageStatePath` 或 `storageStateB64`

如需 Bark 通知，可额外配置：

- `MAJSOUL_BARK_PUSH_URL`
- 如需直接带图，再配置 `MAJSOUL_BARK_SCREENSHOT_BASE_URL`

#### 4. 新建青龙任务

直接使用当前唯一入口：

```bash
cd /ql/data/scripts/ql_scripts && node scripts/majsoul/claim-monthly-pass.js
```

### 推荐流程

1. **在本地电脑跑 `npm run majsoul:auth` 手动登录一次**
2. 把生成的登录态放到青龙
3. 青龙每天跑 `npm run majsoul:claim`
4. 收到 Bark 或查看最终截图，确认月卡是否已自动到账
5. 如果登录态过期，再重新采集一次

### 关于登录态安全

`storage state` 里通常会包含：

- Cookie
- LocalStorage
- 部分账号相关字段

所以请注意：

- **不要把 `MAJSOUL_STORAGE_STATE_B64` 发到公开群聊或公开仓库**
- **不要提交 `data/majsoul/maj-soul-storage.json` 或任何多账号登录态文件**
- 如果你怀疑已经泄露，建议重新登录并更新登录态
