const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const SESSION_FILE = path.join(__dirname, 'sessions.json');

// 会话存储 - 从文件加载
let sessions = readSessions();

// 用户数据（生产环境建议使用数据库）
const DEFAULT_USERS = {
    'admin': { 
        passwordHash: crypto.createHash('sha256').update('admin123').digest('hex'),
        isAdmin: true 
    },
    'user': { 
        passwordHash: crypto.createHash('sha256').update('user123').digest('hex'),
        isAdmin: false 
    }
};

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.static(__dirname));

// 读取会话数据
function readSessions() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            const data = fs.readFileSync(SESSION_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error reading sessions:', error);
    }
    return {};
}

// 保存会话数据
function saveSessions() {
    try {
        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving sessions:', error);
    }
}

// 生成会话token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Helper functions
function readData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error reading data:', error);
    }
    return { projects: [], allTodos: {} };
}

function writeData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error writing data:', error);
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
        console.error('Error reading users:', error);
    }
    return DEFAULT_USERS;
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// API Routes
// GET - 获取所有数据
app.get('/api/data', (req, res) => {
    const data = readData();
    res.json(data);
});

// POST - 保存所有数据
app.post('/api/data', (req, res) => {
    const success = writeData(req.body);
    if (success) {
        res.json({ success: true, message: '数据保存成功' });
    } else {
        res.status(500).json({ success: false, message: '保存失败' });
    }
});

// PUT - 更新数据（与POST相同）
app.put('/api/data', (req, res) => {
    const success = writeData(req.body);
    if (success) {
        res.json({ success: true, message: '数据更新成功' });
    } else {
        res.status(500).json({ success: false, message: '更新失败' });
    }
});

// POST - 用户登录验证
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ 
            success: false, 
            message: '请提供用户名和密码' 
        });
    }
    
    const users = readUsers();
    const user = users[username];
    
    if (!user) {
        return res.status(401).json({ 
            success: false, 
            message: '用户名或密码错误' 
        });
    }
    
    const passwordHash = hashPassword(password);
    
    if (user.passwordHash === passwordHash) {
        // 生成会话token
        const token = generateToken();
        const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7天过期
        
        // 保存会话
        sessions[token] = {
            username: username,
            isAdmin: user.isAdmin,
            expiresAt: expiresAt
        };
        saveSessions();
        
        res.json({ 
            success: true, 
            username: username,
            isAdmin: user.isAdmin,
            token: token
        });
    } else {
        res.status(401).json({ 
            success: false, 
            message: '用户名或密码错误' 
        });
    }
});

// GET - 验证会话
app.get('/api/session', (req, res) => {
    const token = req.headers['x-session-token'] || req.query.token;
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: '未提供会话令牌' 
        });
    }
    
    // 读取最新的会话数据
    sessions = readSessions();
    
    const session = sessions[token];
    
    if (!session) {
        return res.status(401).json({ 
            success: false, 
            message: '会话已过期或无效' 
        });
    }
    
    if (Date.now() > session.expiresAt) {
        // 删除过期会话
        delete sessions[token];
        saveSessions();
        return res.status(401).json({ 
            success: false, 
            message: '会话已过期' 
        });
    }
    
    res.json({ 
        success: true,
        username: session.username,
        isAdmin: session.isAdmin 
    });
});

// POST - 退出登录
app.post('/api/logout', (req, res) => {
    const token = req.headers['x-session-token'] || req.body.token;
    
    if (token && sessions[token]) {
        delete sessions[token];
        saveSessions();
    }
    
    res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`待办事项管理系统已启动！`);
    console.log(`========================================`);
    console.log(`本地访问: http://localhost:${PORT}`);
    console.log(`局域网访问: http://<您的IP地址>:${PORT}`);
    console.log(`\n按 Ctrl+C 停止服务器`);
    console.log(`========================================\n`);
});
