# 待办事项管理系统

基于 Node.js + Express 的多项目待办事项管理系统，支持多部门协作、Excel 导入导出、完成率统计等功能。

## 功能特性

- **多项目管理** — 支持创建、切换、删除项目，Tab 式切换
- **待办事项 CRUD** — 添加、编辑、删除、标记完成（可选完成日期）
- **多部门归属** — 事项可归属多个部门（工程、成本、设计、前期、营销、运营）
- **状态自动判定** — 按时完成、提前完成、逾期完成、已逾期、即将到期、待处理
- **预警提醒** — 自动检测逾期和 7 天内即将到期事项
- **筛选搜索** — 按关键词、部门、月份、状态筛选
- **统计看板** — 各部门完成率进度条、跨项目汇总统计
- **Excel 导入/导出** — 支持下载导入模板、一键导出按月分组数据
- **批量操作** — 全选/多选后批量删除
- **权限控制** — 管理员可编辑，普通用户只读浏览
- **安全加固** — bcrypt 密码哈希、会话鉴权、XSS 防护、限速防暴力破解

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 前端 | 原生 HTML/CSS/JavaScript |
| 数据存储 | JSON 文件 |
| Excel处理 | SheetJS |
| 密码哈希 | bcryptjs |
| 安全中间件 | helmet + express-rate-limit |

## 快速开始

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/your-username/todo-app.git
cd todo-app

# 安装依赖
npm install

# 启动服务
npm start
```

访问 http://localhost:3000

### 默认账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | admin | admin123 |
| 普通用户 | user | user123 |

> 首次登录后请尽快修改默认密码

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务监听端口 | 3000 |
| `ADMIN_PASSWORD` | 管理员初始密码 | admin123 |
| `USER_PASSWORD` | 普通用户初始密码 | user123 |
| `ALLOWED_ORIGINS` | CORS 允许的来源（逗号分隔） | 空（同源） |
| `NODE_ENV` | 运行环境 | development |

## 一键部署到服务器

将项目上传到服务器后，执行：

```bash
sudo bash deploy.sh
```

脚本会交互式引导你完成：

1. 输入绑定的域名
2. 输入监听端口
3. 设置管理员和普通用户密码
4. 选择是否配置 HTTPS（Let's Encrypt）
5. 自动安装 Node.js / Nginx / PM2
6. 配置反向代理、防火墙、SSL 证书
7. 启动应用并验证

### 更新部署

再次执行 `sudo bash deploy.sh` 即可，脚本会检测已有部署并仅更新代码和重启。

### 常用运维命令

```bash
pm2 logs todo-app       # 查看日志
pm2 restart todo-app    # 重启应用
pm2 stop todo-app       # 停止应用
pm2 monit               # 监控面板
```

## 项目结构

```
todo-app/
├── server.js           # Express 后端服务
├── package.json        # 项目依赖配置
├── deploy.sh           # 一键部署脚本
├── public/
│   └── index.html      # 前端单页应用
├── data/               # 运行时数据（自动创建，不纳入版本控制）
│   ├── data.json       # 待办事项数据
│   ├── users.json      # 用户密码数据
│   └── sessions.json   # 会话数据
└── node_modules/       # 依赖包
```

## API 接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/login` | 公开 | 用户登录 |
| GET | `/api/session` | 登录 | 验证会话 |
| POST | `/api/logout` | 公开 | 退出登录 |
| GET | `/api/data` | 登录 | 获取所有数据 |
| POST | `/api/data` | 管理员 | 保存数据 |
| PUT | `/api/data` | 管理员 | 更新数据 |
| POST | `/api/change-password` | 登录 | 修改密码 |

所有需鉴权的接口通过 `X-Session-Token` 请求头传递 token。

## 安全设计

| 措施 | 说明 |
|------|------|
| bcrypt 密码哈希 | 12 轮 salt，替代不安全的 SHA-256 |
| 会话鉴权 | 随机 64 字节 token，7 天过期 |
| 登录限速 | 同一 IP 15 分钟内最多 10 次尝试，5 次失败锁定 15 分钟 |
| 全局限速 | 同一 IP 15 分钟内最多 200 次请求 |
| XSS 防护 | 所有用户数据渲染前 HTML 转义 |
| Helmet 安全头 | CSP / X-Frame-Options / X-Content-Type-Options 等 |
| CORS 白名单 | 仅允许配置的域名跨域访问 |
| 静态文件隔离 | 前端文件独立 public/ 目录，数据文件不可 HTTP 访问 |
| 请求体限制 | 1MB 上限 |
| 数据校验 | 写入前校验数据结构，限制事项总数 10000 |
| 监听地址 | 仅监听 127.0.0.1，通过 Nginx 反代暴露 |

## License

MIT
