### 项目说明

`ql_scripts` 是一个面向 **青龙面板 / 定时任务场景** 的自动化脚本仓库。
当前仓库保留的是已经真实落地并持续维护的站点脚本，每个站点独立目录、独立文档、独立数据空间，不再保留历史兼容入口。

### 当前能力

- **`majsoul`**：雀魂网页版登录态采集
- **`majsoul`**：继承登录态后固定等待进入大厅，并生成最终截图供人工确认月卡是否自动到账
- **`majsoul`**：支持单账号和多账号顺序执行，支持可选 Bark 通知
- **`poi6`**：Poi6 论坛登录态采集
- **`poi6`**：支持登录态复用或账号密码自动登录，并固定在线 5 分钟完成每日在线签到
- **`poi6`**：支持单账号和多账号顺序执行，支持可选 Bark 通知

详细说明见：

- `docs/majsoul.md`
- `docs/poi6.md`

### 目录结构

```text
ql_scripts/
├─ scripts/
│  ├─ shared/                    # 共享模块
│  │  ├─ utils.js                # 通用工具函数（日志、配置解析、截图、Bark 推送等）
│  │  └─ bootstrap-auth.js       # 登录态采集工厂函数（各站点 bootstrap-auth 调用此模块）
│  ├─ majsoul/
│  │  ├─ bootstrap-auth.js       # 雀魂登录态采集（调用 shared/bootstrap-auth）
│  │  └─ claim-monthly-pass.js   # 雀魂月卡巡检（调用 shared/utils）
│  └─ poi6/
│     ├─ bootstrap-auth.js       # Poi6 登录态采集（调用 shared/bootstrap-auth）
│     └─ daily-login.js          # Poi6 每日签到（调用 shared/utils）
├─ data/                         # 运行时登录态文件（gitignored，仅保留 .gitkeep 骨架）
│  ├─ majsoul/
│  └─ poi6/
├─ screenshots/                  # 运行时截图输出（gitignored）
├─ docs/                         # 各站点详细文档
├─ .env.example                  # 环境变量模板
├─ package.json
└─ README.md
```

### 代码架构

#### 共享模块 `scripts/shared/`

**`utils.js`** — 通用工具函数，被所有自动化脚本复用：

| 函数 | 说明 |
|------|------|
| `trimText(value)` | 安全字符串去空格 |
| `toBoolean(value, fallback)` | 将字符串解析为布尔值（支持 `0/false/no/off`） |
| `toInt(value, fallback)` | 将字符串解析为整数 |
| `ensureDir(dirPath)` | 递归创建目录 |
| `pickValue(source, keys, fallback)` | 从对象中按多个候选 key 取值 |
| `sanitizeProfileName(value, fallback)` | 将账号别名转为安全文件名 |
| `formatMinutes(waitMs)` | 毫秒转分钟显示 |
| `saveStorageState(context, path, log, config)` | 保存 Playwright 登录态 |
| `takeScreenshot(page, dir, prefix, suffix, log, config)` | 截图并保存 |
| `pushBarkNotification(config, title, body, screenshotPath, log)` | Bark 推送（含 15 秒超时和 URL 格式校验） |

**`bootstrap-auth.js`** — 登录态采集工厂，通过 `createBootstrapAuth(siteConfig)` 生成各站点的采集函数。内部处理了 stdin 关闭检测，避免进程挂起。

#### 站点脚本

每个站点目录下的脚本只包含该站点特有的逻辑：

- **配置解析**：环境变量读取、多账号 JSON 解析、账号配置标准化
- **业务流程**：页面导航、登录检测、固定等待、结果判断
- **错误处理**：失败截图、Bark 告警、多账号容错

### 快速开始

#### 1. 安装依赖

```bash
npm install
npx playwright install chromium
```

#### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入站点配置和登录态
```

#### 3. 采集登录态（首次使用）

雀魂：

```bash
npm run majsoul:auth
```

Poi6：

```bash
npm run poi6:auth
```

采集脚本会打开浏览器，手动完成登录后回到终端按回车，登录态会保存到 `data/<site>/` 并输出 Base64 编码（可粘贴到青龙环境变量）。

#### 4. 执行日常任务

雀魂月卡巡检：

```bash
npm run majsoul:claim
```

Poi6 在线签到：

```bash
npm run poi6:checkin
```

### 设计取向

当前仓库采用的是**按站点分别实现最小可靠流程**：

- 优先复用登录态
- 仅在站点确实需要时再补账号密码自动登录
- 通过固定等待完成站点的"在线 / 进入大厅 / 自动到账"流程
- 保存最终截图
- 如有需要，通过 Bark 推送结果通知

### 站点说明

- **雀魂**：进入大厅时自动到账，因此脚本只负责恢复登录态、固定等待和最终截图
- **Poi6**：每日登录并保持在线约 5 分钟即可自动签到获取积分，因此脚本只负责登录、固定在线和最终截图

### 扩展新站点

新增站点时遵守以下结构：

```
scripts/<site-name>/
├─ bootstrap-auth.js    # 登录态采集（调用 shared/bootstrap-auth，约 20 行）
└─ daily-task.js        # 自动化任务（调用 shared/utils，站点特有逻辑）
docs/<site-name>.md     # 站点文档
data/<site-name>/.gitkeep
```

**新增站点步骤**：

1. 创建 `scripts/<site-name>/` 目录
2. 创建 `bootstrap-auth.js`，调用 `createBootstrapAuth(config)` 传入站点配置
3. 创建自动化脚本，引入 `scripts/shared/utils.js` 中的工具函数
4. 在 `.env.example` 中添加该站点的环境变量（使用 `<SITE>_` 前缀）
5. 在 `package.json` 中添加 npm script
6. 创建 `docs/<site-name>.md` 文档

### 约定说明

- `data/`、`screenshots/`、`.env` 默认不提交仓库，`data/` 通过 `.gitkeep` 保留目录骨架
- 优先复用登录态，只有在站点确实适合时再支持账号密码直登
- 环境变量按站点前缀区分（如 `MAJSOUL_`、`POI6_`）
- 多账号通过 `*_MULTI_ACCOUNTS_JSON` 环境变量传入 JSON 数组
