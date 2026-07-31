const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
// 信任反向代理（Nginx），使 express-rate-limit 能正确获取客户端真实 IP
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSION_FILE = path.join(DATA_DIR, 'sessions.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SALT_ROUNDS = 12;
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7天
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15分钟锁定

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 会话存储
let sessions = readSessions();

// 登录失败计数
let loginAttempts = {};

// ============ 安全中间件 ============

// Helmet 安全头
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.sheetjs.com"],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// CORS - 仅允许同源或指定域名
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
    origin: function (origin, callback) {
        // 允许无 origin 的请求（如服务端请求、Postman）
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS not allowed'));
        }
    },
    credentials: true
}));

// 请求体大小限制
app.use(express.json({ limit: '1mb' }));

// 全局限速：每IP每15分钟最多200次请求
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: '请求过于频繁，请稍后再试' }
}));

// 登录接口严格限速：每IP每15分钟最多10次
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: '登录尝试过于频繁，请15分钟后再试' }
});

// 静态文件 - 仅服务 public 目录
app.use(express.static(PUBLIC_DIR));

// 禁止访问数据文件的兜底路由
app.use(['/data/*', '/sessions.json', '/data.json', '/users.json', '/.env', '/.env.*', '/node_modules/*'], (req, res) => {
    res.status(404).end();
});

// ============ 鉴权中间件 ============

function requireAuth(req, res, next) {
    const token = req.headers['x-session-token'];
    if (!token) {
        return res.status(401).json({ success: false, message: '未登录' });
    }

    sessions = readSessions();
    const session = sessions[token];
    if (!session) {
        return res.status(401).json({ success: false, message: '会话已过期或无效' });
    }
    if (Date.now() > session.expiresAt) {
        delete sessions[token];
        saveSessions();
        return res.status(401).json({ success: false, message: '会话已过期' });
    }

    req.session = session;
    req.sessionToken = token;
    next();
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (!req.session.isAdmin) {
            return res.status(403).json({ success: false, message: '需要管理员权限' });
        }
        next();
    });
}

// ============ 数据读写 ============

function readSessions() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            const data = fs.readFileSync(SESSION_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('读取会话数据失败:', error.message);
    }
    return {};
}

function saveSessions() {
    try {
        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2), 'utf8');
    } catch (error) {
        console.error('保存会话数据失败:', error.message);
    }
}

function readData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('读取数据失败:', error.message);
    }
    return { projects: [], allTodos: {} };
}

function writeData(data) {
    try {
        // 数据校验：确保基本结构合法
        if (!data || typeof data !== 'object' || !Array.isArray(data.projects) || typeof data.allTodos !== 'object') {
            console.error('数据格式校验失败');
            return false;
        }
        // 限制单条事项大小
        const todosCount = Object.values(data.allTodos).reduce((sum, arr) => sum + arr.length, 0);
        if (todosCount > 10000) {
            console.error('事项数量超出限制');
            return false;
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('写入数据失败:', error.message);
        return false;
    }
}

function readUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('读取用户数据失败:', error.message);
    }
    return null;
}

// 初始化默认用户（首次运行）
function initDefaultUsers() {
    if (fs.existsSync(USERS_FILE)) return;

    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const userPassword = process.env.USER_PASSWORD || 'user123';

    const users = {
        'admin': {
            passwordHash: bcrypt.hashSync(adminPassword, SALT_ROUNDS),
            isAdmin: true
        },
        'user': {
            passwordHash: bcrypt.hashSync(userPassword, SALT_ROUNDS),
            isAdmin: false
        }
    };

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    console.log('已创建默认用户配置: ' + USERS_FILE);
    console.log('管理员账号: admin / ' + (process.env.ADMIN_PASSWORD ? '(环境变量设置)' : 'admin123'));
    console.log('普通用户账号: user / ' + (process.env.USER_PASSWORD ? '(环境变量设置)' : 'user123'));
    console.log('请尽快修改默认密码！');
}

// 清理过期会话（每小时执行一次）
function cleanExpiredSessions() {
    const now = Date.now();
    let changed = false;
    for (const token in sessions) {
        if (now > sessions[token].expiresAt) {
            delete sessions[token];
            changed = true;
        }
    }
    if (changed) saveSessions();
}
setInterval(cleanExpiredSessions, 60 * 60 * 1000);

// 清理过期登录锁定
function cleanLoginAttempts() {
    const now = Date.now();
    for (const ip in loginAttempts) {
        if (loginAttempts[ip].lockedUntil && now > loginAttempts[ip].lockedUntil) {
            delete loginAttempts[ip];
        }
    }
}
setInterval(cleanLoginAttempts, 5 * 60 * 1000);

// ============ API 路由 ============

// 登录
app.post('/api/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: '请提供用户名和密码' });
    }

    // IP 锁定检查
    const clientIp = req.ip;
    const attempt = loginAttempts[clientIp];
    if (attempt && attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
        const remainMin = Math.ceil((attempt.lockedUntil - Date.now()) / 60000);
        return res.status(429).json({ success: false, message: `登录已锁定，请${remainMin}分钟后再试` });
    }

    const users = readUsers();
    if (!users) {
        return res.status(500).json({ success: false, message: '用户配置错误' });
    }

    const user = users[username];
    if (!user) {
        // 记录失败次数
        if (!loginAttempts[clientIp]) loginAttempts[clientIp] = { count: 0 };
        loginAttempts[clientIp].count++;
        if (loginAttempts[clientIp].count >= MAX_LOGIN_ATTEMPTS) {
            loginAttempts[clientIp].lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
        }
        return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    // bcrypt 验证
    const valid = bcrypt.compareSync(password, user.passwordHash);
    if (!valid) {
        if (!loginAttempts[clientIp]) loginAttempts[clientIp] = { count: 0 };
        loginAttempts[clientIp].count++;
        if (loginAttempts[clientIp].count >= MAX_LOGIN_ATTEMPTS) {
            loginAttempts[clientIp].lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
        }
        return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    // 登录成功，清除失败计数
    delete loginAttempts[clientIp];

    // 生成会话
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + SESSION_TTL;

    sessions[token] = {
        username: username,
        isAdmin: user.isAdmin,
        expiresAt: expiresAt,
        createdAt: Date.now(),
        ip: clientIp
    };
    saveSessions();

    res.json({
        success: true,
        username: username,
        isAdmin: user.isAdmin,
        token: token
    });
});

// 验证会话
app.get('/api/session', requireAuth, (req, res) => {
    res.json({
        success: true,
        username: req.session.username,
        isAdmin: req.session.isAdmin
    });
});

// 退出登录
app.post('/api/logout', (req, res) => {
    const token = req.headers['x-session-token'] || req.body.token;
    if (token && sessions[token]) {
        delete sessions[token];
        saveSessions();
    }
    res.json({ success: true });
});

// 获取数据 - 需要登录
app.get('/api/data', requireAuth, (req, res) => {
    const data = readData();
    res.json(data);
});

// 保存数据 - 需要管理员权限
app.post('/api/data', requireAdmin, (req, res) => {
    const success = writeData(req.body);
    if (success) {
        res.json({ success: true, message: '数据保存成功' });
    } else {
        res.status(500).json({ success: false, message: '保存失败' });
    }
});

// 更新数据 - 需要管理员权限
app.put('/api/data', requireAdmin, (req, res) => {
    const success = writeData(req.body);
    if (success) {
        res.json({ success: true, message: '数据更新成功' });
    } else {
        res.status(500).json({ success: false, message: '更新失败' });
    }
});

// 修改密码 - 需要登录
app.post('/api/change-password', requireAuth, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
        return res.status(400).json({ success: false, message: '请提供旧密码和新密码' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: '新密码至少6位' });
    }

    const users = readUsers();
    const user = users[req.session.username];
    if (!user) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }

    if (!bcrypt.compareSync(oldPassword, user.passwordHash)) {
        return res.status(401).json({ success: false, message: '旧密码错误' });
    }

    user.passwordHash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');

    res.json({ success: true, message: '密码修改成功' });
});

// SPA fallback - 所有未匹配路由返回 index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ============ 启动 ============

initDefaultUsers();
cleanExpiredSessions();

app.listen(PORT, '127.0.0.1', () => {
    console.log(`\n========================================`);
    console.log(`  待办事项管理系统已启动！`);
    console.log(`========================================`);
    console.log(`  本地访问: http://localhost:${PORT}`);
    console.log(`  数据目录: ${DATA_DIR}`);
    console.log(`\n  按 Ctrl+C 停止服务器`);
    console.log(`========================================\n`);
});
