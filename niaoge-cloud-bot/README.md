# 鸟哥之王云端挂机 (niaoge-cloud-bot)

浏览器关闭后 WebSocket 保持连接的自动化任务服务。基于 Node.js + Express 构建，支持多账号并发连接、定时任务调度、SQLite 数据持久化。

---

## 功能概览

- **多账号管理** — 导入 BIN 文件，自动获取游戏 Token，支持批量导入
- **WebSocket 长连接** — 连接池管理，浏览器关闭后游戏连接不中断
- **定时任务** — 支持 cron 表达式定时执行各类游戏任务
- **批量任务** — 地牢、塔、俱乐部、商店、道具、车辆、遗产、月度等
- **游戏查询** — 状态、俱乐部详情、排行榜、活动、盐场、PVP 等
- **Web 管理面板** — Vue 前端界面，账号管理、任务调度、日志查看
- **PM2 部署** — 支持进程守护和自动重启

---

## 环境要求

| 依赖 | 版本要求 |
|------|----------|
| Node.js | >= 18（推荐 v20+） |
| npm | >= 9 |
| 操作系统 | Windows / Linux / macOS |

> **Windows 用户注意**：如使用 PM2，建议在 WSL 或 Linux 环境运行以获得更好的稳定性。

---

## 快速开始

### 1. 安装依赖

```bash
cd niaoge-cloud-bot
npm install
```

### 2. 构建前端（可选）

如果 `dist-vue/` 目录已存在构建产物，可跳过此步。如需重新构建：

```bash
cd frontend
npm install
npm run build
```

构建产物输出到 `../dist-vue/`，后端会自动加载。

### 3. 启动服务

```bash
# 开发模式（带文件监听自动重启）
npm run dev

# 生产模式
npm start
```

服务启动后访问：**http://localhost:3456**

### 4. PM2 部署（生产环境推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动
npm run pm2:start

# 停止
npm run pm2:stop

# 重启
npm run pm2:restart

# 查看日志
npm run pm2:logs
```

---

## 使用指南

### 导入账号

1. 打开微信 PC 版 → 打开咸鱼之王小游戏 → 登录角色
2. 用抓包工具导出角色对应的 BIN 文件
3. 访问 `http://localhost:3456` → 进入「账号管理」→ 点击「添加」
4. 上传 BIN 文件，选择角色服务器，确认导入
5. 账号自动连接游戏服务器

### 执行任务

- **手动执行**：在「账号管理」中点击账号的功能按钮
- **定时执行**：在「任务调度」中创建 cron 任务，指定账号和任务列表

### 常用 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/accounts` | 获取所有账号列表 |
| POST | `/api/accounts/preview` | 预览 BIN 文件（获取角色列表） |
| POST | `/api/accounts/confirm` | 确认添加账号（上传 BIN + 角色） |
| POST | `/api/accounts/bin` | Base64 方式添加账号 |
| POST | `/api/accounts/batch` | 批量导入 BIN 文件 |
| POST | `/api/accounts/:id/refresh-token` | 刷新账号 Token |
| DELETE | `/api/accounts/:id` | 删除账号 |
| POST | `/api/control/connect/:id` | 连接指定账号 |
| POST | `/api/control/disconnect/:id` | 断开指定账号 |
| GET | `/api/control/status` | 查看所有账号连接状态 |
| POST | `/api/tasks/run` | 手动执行任务 |
| GET/POST | `/api/schedules` | 定时任务管理 |

---

## 项目结构

```
niaoge-cloud-bot/
├── server.js              # 主入口，Express 服务 + 组件初始化
├── package.json           # 依赖与脚本配置
├── ecosystem.config.cjs   # PM2 配置
│
├── api/                   # Express 路由
│   ├── accounts.js        # 账号管理（导入/删除/刷新/连接）
│   ├── portal.js          # 门户 API
│   └── tasks.js           # 任务执行 API
│
├── lib/                   # 核心业务逻辑
│   ├── db.js              # SQLite 数据库操作
│   ├── tokenAuth.js       # BIN → Token 转换 + WebSocket URL 构建
│   ├── bonProtocol.js     # BON 编解码器（兼容游戏二进制协议）
│   ├── gameWsClient.js    # 游戏 WebSocket 客户端
│   ├── connectionPool.js  # 连接池管理（多账号并发）
│   ├── scheduler.js       # cron 定时任务调度
│   ├── taskRunner.js      # 任务执行引擎
│   ├── portalDb.js        # 门户数据库
│   ├── batch/             # 批量任务模块
│   │   ├── tasksCar.js        # 车任务
│   │   ├── tasksClub.js       # 俱乐部任务
│   │   ├── tasksDungeon.js    # 地牢任务
│   │   ├── tasksItem.js       # 道具任务
│   │   ├── tasksLegacy.js     # 遗产任务
│   │   ├── tasksMonthly.js    # 月度任务
│   │   ├── tasksStore.js      # 商店任务
│   │   └── tasksTower.js      # 塔任务
│   └── game/              # 游戏功能查询模块
│       ├── activity.js        # 活动
│       ├── clubInfo.js        # 俱乐部信息
│       ├── gameStatus.js      # 游戏状态
│       ├── pvp.js             # PVP
│       ├── rankings.js        # 排行榜
│       ├── saltField.js       # 盐场
│       └── tools.js           # 工具
│
├── frontend/              # Vue 3 前端源码（Vite 构建）
│   ├── src/
│   │   ├── views/         # 页面组件（12个）
│   │   ├── stores/        # 状态管理
│   │   ├── router/        # 路由
│   │   ├── api/           # API 调用层
│   │   └── components/    # 公共组件
│   └── vite.config.js     # Vite 配置
│
├── dist-vue/              # 前端构建产物（服务端直接托管）
├── public/                # 静态文件
│   └── index.html         # 管理后台入口（备用）
└── data/                  # 运行时数据
    └── cloud-bot.db       # SQLite 数据库（自动创建）
```

---

## 配置说明

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3456` | HTTP 服务端口 |

### 数据库

使用 **sql.js**（SQLite WebAssembly 实现），数据文件自动创建在 `data/cloud-bot.db`。无需安装任何数据库软件。

每次调用 `updateAccount()` 会立即持久化到磁盘。

### 连接限制

- 默认最大并发连接数：通过 `ConnectionPool` 类管理
- 每个账号对应一个 WebSocket 连接到 `wss://xxz-xyzw.hortorgames.com/agent`

---

## 技术架构

```
浏览器/Vue前端
      │
      ▼ HTTP (localhost:3456)
┌─────────────┐
│  Express     │
│  Server      │
├─────────────┤
│  API 路由    │  accounts / tasks / portal / control
├─────────────┤
│  Scheduler   │  cron 定时调度
├─────────────┤
│  TaskRunner  │  任务执行引擎
├─────────────┤
│  Connection  │
│  Pool        │  WebSocket 连接池
├─────────────┤
│  SQLite      │  数据持久化
│  (sql.js)    │
└─────────────┘
      │
      ▼ WSS
┌─────────────┐
│  游戏服务器   │  xxz-xyzw.hortorgames.com
└─────────────┘
```

**Token 认证流程**：BIN 文件 → `POST /login/authuser` → BON 解码 → 提取 `roleToken`/`roleId` → 添加 `sessId`/`connId` → 构建 WebSocket URL → 连接游戏服务器。

---

## 常见问题

### 账号连接 1006 错误

检查 `data/cloud-bot.db` 中 token 是否完整（需包含 `roleToken` 和 `roleId` 字段）。如缺少，重新导入 BIN 文件即可。

### 前端界面打不开

确认 `dist-vue/` 目录存在且包含 `index.html`。如不存在，进入 `frontend/` 目录执行：

```bash
npm install && npm run build
```

### 端口被占用

修改端口：
```bash
set PORT=3457 && npm start     # Windows CMD
$env:PORT=3457; npm start      # PowerShell
PORT=3457 npm start            # Linux/macOS
```

### PM2 启动失败

确保 PM2 已全局安装：
```bash
npm install -g pm2
```

---

## 开发

```bash
# 启动后端（文件监听自动重启）
npm run dev

# 启动前端开发服务器
cd frontend
npm run dev
```

前端开发服务器默认在 `http://localhost:5173`，已配置代理转发 API 请求到后端 `3456` 端口。

---

## License

MIT
