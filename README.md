### 项目说明

`ql_scripts` 是一个面向 **青龙面板 / 定时任务场景** 的自动化脚本集合仓库。它不再只代表单一的雀魂项目，而是一个会持续扩展的脚本仓库：

- 当前已落地：**雀魂网页版自动登录与月卡自动领取辅助脚本**
- 后续可继续扩展：其他网站签到、任务领取、状态巡检、数据抓取等脚本
- 每个站点使用 **独立目录、独立说明、独立数据空间**，避免脚本之间互相影响

### 设计目标

- **适合青龙运行**：尽量保持命令简单，方便拉库后直接建任务
- **站点隔离**：每个站点有自己的脚本入口、文档、数据目录和截图目录
- **便于扩展**：以后新增站点时，不需要重写整个仓库结构
- **尽量兼容旧入口**：已有的雀魂脚本调用方式仍保留兼容层，减少迁移成本

### 当前目录结构

```text
ql_scripts/
├─ docs/
│  └─ majsoul.md              # 雀魂脚本详细说明
├─ scripts/
│  ├─ majsoul/
│  │  ├─ bootstrap-auth.js    # 雀魂登录态采集
│  │  └─ claim-monthly-pass.js# 雀魂自动登录/自动领取
│  ├─ bootstrap-auth.js       # 兼容旧入口，转发到 majsoul 子目录
│  └─ claim-monthly-pass.js   # 兼容旧入口，转发到 majsoul 子目录
├─ data/                      # 运行期数据（默认不入库）
├─ screenshots/               # 调试截图（默认不入库）
├─ .env.example               # 当前仓库的环境变量模板
├─ package.json
└─ README.md
```

### 当前已支持的脚本

- **`majsoul`**：雀魂网页版自动登录、登录态复用、多账号顺序执行、月卡自动领取辅助

详细使用说明见：`docs/majsoul.md`

### 快速开始

#### 1. 安装依赖

```bash
npm install
npx playwright install chromium
```

#### 2. 查看对应站点文档

当前请先看：`docs/majsoul.md`

#### 3. 执行站点脚本

雀魂登录态采集：

```bash
npm run majsoul:auth
```

雀魂领取脚本：

```bash
npm run majsoul:claim
```

### 新增站点时的建议结构

后续如果你要新增例如某论坛、某游戏、某积分网站的自动签到脚本，建议统一按下面方式扩展：

- 新脚本放到 `scripts/<site-name>/`
- 对应文档放到 `docs/<site-name>.md`
- 运行时数据默认放到 `data/<site-name>/`
- 调试截图默认放到 `screenshots/<site-name>/`
- 环境变量继续按站点前缀区分，例如 `FORUM_`、`GAME_`、`SHOP_`

### 约定说明

- `data/`、`screenshots/`、`.env` 默认不提交仓库
- 每个站点优先复用登录态，尽量降低账号密码直登风控
- 如果某脚本有特殊依赖或部署方式，写入对应的 `docs/<site-name>.md`

### 兼容性说明

为了不影响你已经在本地或青龙里使用过的旧命令，仓库暂时保留：

- `scripts/bootstrap-auth.js`
- `scripts/claim-monthly-pass.js`

这两个旧入口会自动转发到 `scripts/majsoul/` 下的新实现；后续等你完全迁移后，也可以再决定是否移除。
