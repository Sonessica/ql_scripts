### Poi6 论坛脚本说明

这个文档描述的是 `ql_scripts` 仓库里当前新增的 **Poi6 论坛自动登录 / 在线签到脚本**。
Poi6 的每日积分机制相对直接：**每日登录并保持在线约 5 分钟即可自动签到获取积分**。

因此当前脚本采用的是一条非常直接的流程：**进入站点 -> 复用登录态或账号密码自动登录 -> 固定在线 5 分钟 -> 保存最终截图 -> 可选 Bark 通知**。

### 相关文件

- `scripts/poi6/bootstrap-auth.js`：本地一次性采集 Poi6 登录态
- `scripts/poi6/daily-login.js`：青龙里日常运行的 Poi6 在线签到脚本
- `.env.example`：仓库级环境变量模板

### 当前支持的登录方式

脚本支持两种方式：

- **方式 A：登录态复用**
  - 先在本地通过 `bootstrap-auth.js` 手动登录一次
  - 把生成的 `storage state` 文件或 Base64 带到青龙
- **方式 B：账号密码自动登录**
  - 在环境变量中提供 `POI6_EMAIL` 和 `POI6_PASSWORD`
  - 脚本检测到仍在登录页时会自动提交表单

对于 Poi6 这种标准登录页，账号密码直登是可行的；如果你更在意稳定性，也可以优先使用登录态。

### 运行前准备

#### 1. 安装依赖

在仓库目录执行：

```bash
npm install
npx playwright install chromium
```

#### 2. 本地手动采集登录态（可选）

推荐先在自己的电脑上执行：

```bash
npm run poi6:auth
```

或者直接运行：

```bash
node scripts/poi6/bootstrap-auth.js
```

执行后会：

- 打开 `https://poi6.net/`
- 让你在浏览器中手动完成登录
- 你回到终端按回车后，保存登录态到 `data/poi6/poi6-storage.json`
- 同时输出一段 Base64，可直接粘到青龙环境变量 `POI6_STORAGE_STATE_B64`

### 环境变量

可参考根目录的 `.env.example`：

- `POI6_BASE_URL`：默认 `https://poi6.net/`
- `POI6_HEADLESS`：青龙里建议 `true`
- `POI6_EMAIL`：Poi6 登录邮箱
- `POI6_PASSWORD`：Poi6 登录密码
- `POI6_REMEMBER_LOGIN`：是否勾选“保持登入”，默认 `true`
- `POI6_STORAGE_STATE_B64`：单账号模式下可选，用于把本地登录态带到青龙
- `POI6_STORAGE_STATE_PATH`：单账号模式下可选，默认 `data/poi6/poi6-storage.json`
- `POI6_ACCOUNT_ALIAS`：本地采集多账号登录态时可选，用来生成独立登录态文件
- `POI6_MULTI_ACCOUNTS_JSON`：多账号模式配置，填写后会按顺序逐个处理账号
- `POI6_CONTINUE_ON_ERROR`：多账号模式下，某个账号失败后是否继续处理后续账号
- `POI6_TIMEOUT_MS`：页面打开超时
- `POI6_ONLINE_WAIT_MS`：固定在线时长，默认 `300000`，即 5 分钟
- `POI6_BARK_PUSH_URL`：可选，Bark 推送地址
- `POI6_BARK_SCREENSHOT_BASE_URL`：可选，截图公网访问基址；配置后 Bark 可直接带图
- `POI6_BARK_GROUP`：可选，Bark 分组名

### 推荐参数

Poi6 当前建议直接使用下面这组：

```dotenv
POI6_TIMEOUT_MS=120000
POI6_ONLINE_WAIT_MS=300000
POI6_REMEMBER_LOGIN=true
```

如果你的网络或机器速度比较慢，通常也只需要稍微提高 `POI6_TIMEOUT_MS`；在线时长建议仍保持 5 分钟起步。

### 多账号如何使用

当前脚本支持 **一个青龙任务顺序跑多个 Poi6 账号**。
你可以混合使用登录态和账号密码模式。

#### 1. 用多账号 JSON 配置

示例：

```json
[
  {
    "name": "main",
    "email": "main@example.com",
    "password": "你的密码"
  },
  {
    "name": "alt",
    "storageStatePath": "data/poi6/poi6-storage-alt.json"
  }
]
```

把上面整段 JSON 压成一行后，填进环境变量 `POI6_MULTI_ACCOUNTS_JSON`。

你也可以给某个账号加 Bark：

```json
{
  "name": "main",
  "email": "main@example.com",
  "password": "你的密码",
  "barkPushUrl": "https://api.day.app/<你的key>/push",
  "barkScreenshotBaseUrl": "https://example.com/poi6-screenshots"
}
```

#### 2. 执行逻辑说明

- 配置了 `POI6_MULTI_ACCOUNTS_JSON` 后，脚本会按数组逐个处理账号
- 若提供了登录态，脚本会优先尝试复用登录态
- 如果页面仍停留在 `/auth/login`，且已提供邮箱和密码，脚本会自动完成登录
- 登录完成后会固定保持在线 5 分钟
- 结束时会保存最新登录态，并生成一张最终截图
- 默认 `POI6_CONTINUE_ON_ERROR=true`，某个账号失败后，后续账号仍会继续跑；但脚本最终仍会返回失败状态，方便青龙告警

### Bark 推送说明

脚本支持在任务结束后向 Bark 发送一条通知。

需要注意：**Bark 本身不是图片上传服务**。如果你希望通知里直接显示截图，需要你自己给 `screenshots/poi6/` 提供一个公网静态访问地址，然后把它填到 `POI6_BARK_SCREENSHOT_BASE_URL`。

如果没有这个公网地址，也可以只配置 `POI6_BARK_PUSH_URL`，此时 Bark 仍会收到一条文字通知，正文里会带上本地截图路径，方便你回到青龙或宿主机查看。

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

至少准备下面两类方式之一：

- **登录态模式**：`POI6_STORAGE_STATE_B64` 或上传 `data/poi6/poi6-storage.json`
- **账号密码模式**：`POI6_EMAIL` + `POI6_PASSWORD`

如需 Bark 通知，可额外配置：

- `POI6_BARK_PUSH_URL`
- 如需直接带图，再配置 `POI6_BARK_SCREENSHOT_BASE_URL`

#### 4. 新建青龙任务

直接使用当前入口：

```bash
cd /ql/data/scripts/ql_scripts && node scripts/poi6/daily-login.js
```

### 推荐流程

1. 先决定使用登录态模式还是账号密码模式
2. 如果要更稳定，先在本地执行 `npm run poi6:auth` 采集一份登录态
3. 在青龙里每天运行 `npm run poi6:checkin`
4. 任务结束后查看最终截图或 Bark 通知，确认在线签到是否完成

### 关于账号与登录态安全

Poi6 的登录态和账号凭据都属于敏感信息，所以请注意：

- **不要把 `POI6_STORAGE_STATE_B64`、`POI6_EMAIL`、`POI6_PASSWORD` 发到公开群聊或公开仓库**
- **不要提交 `data/poi6/poi6-storage.json` 或任何多账号登录态文件**
- 如果你怀疑已经泄露，建议及时修改密码并重新生成登录态
