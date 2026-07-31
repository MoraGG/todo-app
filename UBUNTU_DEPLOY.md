# Ubuntu 部署指南

## 1. 安装 Node.js 环境

### 方法一：使用apt安装（推荐Node.js 18.x）
```bash
# 更新系统
sudo apt update

# 安装Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

### 方法二：使用nvm安装（更灵活）
```bash
# 安装nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重新加载shell配置
source ~/.bashrc

# 安装Node.js
nvm install 18
nvm use 18
```

## 2. 上传代码到Ubuntu

你可以使用以下方式之一：
- SCP命令：`scp -r todo-app user@your-server:/path/to/`
- SFTP工具（如FileZilla）
- Git克隆

## 3. 安装依赖

```bash
# 进入项目目录
cd /path/to/todo-app

# 安装依赖
npm install
```

## 4. 配置（可选修改）

### 修改端口
编辑 `server.js`：
```javascript
const PORT = process.env.PORT || 3000;  // 修改为80可省去端口号
```

### 配置防火墙
```bash
# 允许HTTP和HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 如果使用3000端口
sudo ufw allow 3000/tcp

# 启用防火墙
sudo ufw enable
```

## 5. 启动服务

### 开发模式（前台运行）
```bash
npm start
```

### 生产模式（后台运行）推荐使用PM2
```bash
# 安装PM2
sudo npm install -g pm2

# 使用PM2启动
pm2 start server.js --name todo-app

# 设置开机自启
pm2 startup
pm2 save

# PM2常用命令
pm2 list          # 查看进程
pm2 logs todo-app # 查看日志
pm2 restart       # 重启
pm2 stop          # 停止
```

## 6. 使用Nginx反向代理（可选）

安装Nginx：
```bash
sudo apt install nginx
```

配置反向代理：
```bash
sudo nano /etc/nginx/sites-available/todo-app
```

添加配置：
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用站点：
```bash
sudo ln -s /etc/nginx/sites-available/todo-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 7. 配置HTTPS（使用Let's Encrypt免费证书）

```bash
# 安装Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期证书
sudo certbot renew --dry-run
```

## 8. 数据文件权限

```bash
# 创建数据文件并设置权限
touch data.json
chmod 666 data.json
```

## 9. 完整部署脚本

创建一个部署脚本 `deploy.sh`：
```bash
#!/bin/bash

# 安装Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 进入项目目录
cd /path/to/todo-app

# 安装依赖
npm install

# 安装PM2
sudo npm install -g pm2

# 使用PM2启动
pm2 start server.js --name todo-app

# 设置开机自启
pm2 startup
pm2 save
```

## 10. 快速验证

本地测试：
```bash
curl http://localhost:3000
```

应该返回HTML页面内容。

---

## 总结

**最小部署只需3步**：
1. 安装Node.js：`curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs`
2. 上传代码并安装依赖：`npm install`
3. 启动服务：`npm start`

**推荐生产环境**：
- 使用PM2管理进程
- 使用Nginx反向代理
- 配置HTTPS
