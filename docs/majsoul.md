### 雀魂脚本说明

这个文档描述的是 `ql_scripts` 仓库里目前已落地的 **雀魂网页版自动化脚本**。当前能力包括：

- 复用浏览器登录态，降低风控概率
- 自动打开雀魂网页版并等待登录完成后的自动到账流程
- 支持单账号和多账号顺序执行
- 在每次执行后刷新登录态并输出调试截图
- 把运行数据隔离在 `data/majsoul/`，截图隔离在 `screenshots/majsoul/`

> 这套方案是按“**网页版自动化**”来做的，没有去逆向私有接口，所以兼容性会更好一些；但如果雀魂页面结构大改，仍然需要按截图继续微调。

### 相关文件

- `scripts/majsoul/bootstrap-auth.js`：本地一次性采集登录态
- `scripts/majsoul/claim-monthly-pass.js`：青龙里日常运行的领取脚本
- `.env.example`：仓库级环境变量模板，当前内含雀魂示例

### 运行前准备

#### 1. 安装依赖

在仓库目录执行：

```bash
npm install
npx playwright install chromium
```

#### 2. 本地手动采集登录态（推荐）

推荐先在你自己的电脑上执行：

```bash
npm run majsoul:auth
```

或者直接运行：

```bash
node scripts/majsoul/bootstrap-auth.js
```

执行后会：

- 自动打开雀魂网页版
- 先额外等待首页资源和登录页加载
- 让你手动登录账号
- 你回到终端按回车后，保存登录态到 `data/majsoul/maj-soul-storage.json`
- 同时输出一段 Base64，可直接粘到青龙环境变量 `MAJSOUL_STORAGE_STATE_B64`

你有两种用法：

- **方式 A**：直接把 `data/majsoul/maj-soul-storage.json` 复制到青龙仓库同一路径
- **方式 B**：把终端输出的 Base64 填到青龙环境变量 `MAJSOUL_STORAGE_STATE_B64`

### 环境变量

可参考根目录的 `.env.example`：

- `MAJSOUL_BASE_URL`：默认 `https://game.maj-soul.com/1/`
- `MAJSOUL_HEADLESS`：青龙里建议 `true`
- `MAJSOUL_ACCOUNT`：账号密码登录模式下使用，可选
- `MAJSOUL_PASSWORD`：账号密码登录模式下使用，可选
- `MAJSOUL_STORAGE_STATE_B64`：单账号模式下推荐，用于把本地登录态带到青龙
- `MAJSOUL_STORAGE_STATE_PATH`：单账号模式下可选，默认 `data/majsoul/maj-soul-storage.json`
- `MAJSOUL_ACCOUNT_ALIAS`：本地采集多账号登录态时可选，用来生成独立登录态文件
- `MAJSOUL_MULTI_ACCOUNTS_JSON`：多账号模式配置，填写后会按顺序逐个处理账号
- `MAJSOUL_CONTINUE_ON_ERROR`：多账号模式下，某个账号失败后是否继续处理后续账号
- `MAJSOUL_TIMEOUT_MS`：页面总超时
- `MAJSOUL_INITIAL_LOAD_WAIT_MS`：首页打开后额外等待时间
- `MAJSOUL_AFTER_START_WAIT_MS`：点击“开始游戏”或进入登录流程后额外等待时间
- `MAJSOUL_POST_LOGIN_WAIT_MS`：登录提交后，或恢复登录态后，等待进入大厅和自动到账的时间
- `MAJSOUL_FINAL_STABILIZE_WAIT_MS`：关闭弹窗后，再额外等待页面稳定的时间

### 推荐的慢速环境参数

如果你发现：

- 登录页出来很慢
- 验证成功后进入大厅很慢
- NAS 上无头浏览器性能比较弱

可以直接使用下面这组值：

```dotenv
MAJSOUL_TIMEOUT_MS=120000
MAJSOUL_INITIAL_LOAD_WAIT_MS=20000
MAJSOUL_AFTER_START_WAIT_MS=15000
MAJSOUL_POST_LOGIN_WAIT_MS=35000
MAJSOUL_FINAL_STABILIZE_WAIT_MS=5000
```

如果青龙里仍然偏慢，可以继续把 `MAJSOUL_POST_LOGIN_WAIT_MS` 提高到 `45000` 或 `60000`。

### 多账号如何使用

当前脚本已经支持 **一个青龙任务顺序跑多个账号**。推荐做法是：**每个账号采集一份独立登录态，然后放进 `MAJSOUL_MULTI_ACCOUNTS_JSON`**。

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

你也可以不用 `MAJSOUL_ACCOUNT_ALIAS`，而是手动传 `MAJSOUL_STORAGE_STATE_PATH` 或 `--alias=xxx`。

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

#### 3. 执行逻辑说明

- 配置了 `MAJSOUL_MULTI_ACCOUNTS_JSON` 后，脚本会按数组逐个处理账号
- 每个账号默认使用独立登录态文件，避免多个账号互相覆盖
- 截图文件名会自动带上账号标识，便于区分
- 默认 `MAJSOUL_CONTINUE_ON_ERROR=true`，某个账号失败后，后续账号仍会继续跑；但脚本最终仍会返回失败状态，方便青龙告警

### 青龙中如何配置

#### 1. 把仓库拉到青龙

可以用你平时的拉库方式，把这个仓库同步到青龙脚本目录。

如果你是用青龙的“订阅”或“拉库”功能，常见的落地目录一般类似下面两种：

- `/ql/data/repo/<仓库目录名>/`
- `/ql/data/scripts/<仓库目录名>/`

你可以先在青龙容器里执行一次下面的命令确认真实路径：

```bash
find /ql -path "*/scripts/majsoul/claim-monthly-pass.js" 2>/dev/null
```

#### 2. 在青龙容器里安装一次依赖

进入仓库目录后执行：

```bash
npm install
npx playwright install chromium
```

如果你已经确认项目目录就是 `/ql/data/scripts/ql_scripts`，也可以直接执行：

```bash
cd /ql/data/scripts/ql_scripts && npm install && npx playwright install chromium
```

#### 3. 配置环境变量

单账号模式下，至少配置下面这项之一：

- `MAJSOUL_STORAGE_STATE_B64`
- 或手动上传 `data/majsoul/maj-soul-storage.json`

多账号模式下，推荐配置：

- `MAJSOUL_MULTI_ACCOUNTS_JSON`
- 并为每个账号准备独立的 `storageStatePath` 或 `storageStateB64`

#### 4. 新建青龙任务

推荐直接用新的子目录入口：

```bash
cd /ql/data/scripts/ql_scripts && node scripts/majsoul/claim-monthly-pass.js
```

如果你已经使用过旧入口，暂时也可以继续用兼容命令：

```bash
cd /ql/data/scripts/ql_scripts && node scripts/claim-monthly-pass.js
```

### 推荐流程

1. **在本地电脑跑 `npm run majsoul:auth` 手动登录一次**
2. 把生成的登录态放到青龙
3. 青龙每天跑 `npm run majsoul:claim` 或对应 Node 命令
4. 如果登录态过期，再重新采集一次

### 关于账号密码直登

脚本支持通过 `MAJSOUL_ACCOUNT` 和 `MAJSOUL_PASSWORD` 直接登录，或在 `MAJSOUL_MULTI_ACCOUNTS_JSON` 里为单个账号提供 `account` / `password`，但这不是首选，因为：

- 有时会碰到验证码、滑块或额外风控
- 网页前端如果改版，登录表单选择器可能变化
- 频繁直登不如复用登录态稳定

所以更推荐你使用 `storage state`。

### 关于登录态安全

`storage state` 里通常会包含：

- Cookie
- LocalStorage
- 部分账号相关字段

所以请注意：

- **不要把 `MAJSOUL_STORAGE_STATE_B64` 发到公开群聊或公开仓库**
- **不要提交 `data/majsoul/maj-soul-storage.json` 或任何多账号登录态文件**
- 如果你怀疑已经泄露，建议重新登录并更新登录态
