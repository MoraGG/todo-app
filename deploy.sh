#!/bin/bash
#=============================================================
#  待办事项管理系统 - 一键部署脚本
#  支持：首次部署 / 更新部署
#  系统：Ubuntu 20.04+ / Debian 11+
#=============================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 项目默认配置
APP_NAME="todo-app"
APP_DIR="/opt/$APP_NAME"
APP_USER="www-todo"
NODE_VERSION="18"
PM2_NAME="todo-app"

# 打印函数
info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# 检查是否 root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "请使用 root 用户或 sudo 执行此脚本"
    fi
}

# 分隔线
separator() {
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
}

# 交互式读取配置
read_config() {
    separator
    echo -e "${CYAN}  待办事项管理系统 - 部署配置${NC}"
    separator
    echo ""

    # 域名
    read -p "$(echo -e ${YELLOW}'请输入绑定的域名（不含http://，如 todo.example.com）: '${NC})" DOMAIN
    if [[ -z "$DOMAIN" ]]; then
        error "域名不能为空"
    fi
    echo ""

    # 端口
    read -p "$(echo -e ${YELLOW}'请输入应用监听端口（默认 3000）: '${NC})" APP_PORT
    APP_PORT=${APP_PORT:-3000}
    echo ""

    # 管理员密码
    read -sp "$(echo -e ${YELLOW}'请输入管理员密码（至少6位，留空使用 admin123）: '${NC})" ADMIN_PASS
    echo ""
    if [[ -n "$ADMIN_PASS" && ${#ADMIN_PASS} -lt 6 ]]; then
        error "管理员密码至少6位"
    fi
    ADMIN_PASS=${ADMIN_PASS:-admin123}

    # 普通用户密码
    read -sp "$(echo -e ${YELLOW}'请输入普通用户密码（至少6位，留空使用 user123）: '${NC})" USER_PASS
    echo ""
    if [[ -n "$USER_PASS" && ${#USER_PASS} -lt 6 ]]; then
        error "普通用户密码至少6位"
    fi
    USER_PASS=${USER_PASS:-user123}
    echo ""

    # HTTPS
    read -p "$(echo -e ${YELLOW}'是否配置 HTTPS（Let'\''s Encrypt）？[y/N]: '${NC})" SETUP_HTTPS
    SETUP_HTTPS=${SETUP_HTTPS:-n}
    echo ""

    if [[ "$SETUP_HTTPS" =~ ^[Yy]$ ]]; then
        read -p "$(echo -e ${YELLOW}'请输入接收证书通知的邮箱: '${NC})" CERT_EMAIL
        if [[ -z "$CERT_EMAIL" ]]; then
            warn "邮箱为空，跳过 HTTPS 配置"
            SETUP_HTTPS="n"
        fi
    fi

    # 确认
    separator
    echo -e "  域名:     ${GREEN}$DOMAIN${NC}"
    echo -e "  端口:     ${GREEN}$APP_PORT${NC}"
    echo -e "  HTTPS:    ${GREEN}$([ "$SETUP_HTTPS" = "y" ] && echo "是" || echo "否")${NC}"
    echo -e "  安装目录: ${GREEN}$APP_DIR${NC}"
    separator
    read -p "$(echo -e ${YELLOW}'确认以上配置？[Y/n]: '${NC})" CONFIRM
    CONFIRM=${CONFIRM:-y}
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        error "已取消"
    fi
}

# 安装系统依赖
install_system_deps() {
    info "更新系统包管理器..."
    apt-get update -qq

    if ! command -v node &> /dev/null; then
        info "安装 Node.js $NODE_VERSION..."
        curl -fsSL "https://deb.nodesource.com/setup_$NODE_VERSION.x" | bash -
        apt-get install -y nodejs
    fi
    ok "Node.js $(node -v) / npm $(npm -v)"

    if ! command -v nginx &> /dev/null; then
        info "安装 Nginx..."
        apt-get install -y nginx
    fi
    ok "Nginx 已安装"

    if ! command -v pm2 &> /dev/null; then
        info "安装 PM2..."
        npm install -g pm2
    fi
    ok "PM2 已安装"
}

# 创建专用用户
create_app_user() {
    if ! id "$APP_USER" &> /dev/null; then
        info "创建应用用户: $APP_USER"
        useradd -r -m -d /home/"$APP_USER" -s /usr/sbin/nologin "$APP_USER"
    fi
    # 确保 home 目录存在且可写（pm2 需要）
    mkdir -p /home/"$APP_USER"/.pm2
    chown -R "$APP_USER:$APP_USER" /home/"$APP_USER"
    ok "应用用户已就绪"
}

# 部署应用代码
deploy_app() {
    info "部署应用代码到 $APP_DIR ..."

    # 获取脚本所在目录（即项目源码目录）
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

    # 创建必要目录
    mkdir -p "$APP_DIR/data"

    if [[ "$SCRIPT_DIR" == "$APP_DIR" ]]; then
        warn "已在目标目录，跳过复制"
    else
        # 创建目标目录
        mkdir -p "$APP_DIR"

        # 复制必要文件
        info "复制项目文件..."
        cp -r "$SCRIPT_DIR/public" "$APP_DIR/"
        cp "$SCRIPT_DIR/server.js" "$APP_DIR/"
        cp "$SCRIPT_DIR/package.json" "$APP_DIR/"
        cp "$SCRIPT_DIR/package-lock.json" "$APP_DIR/" 2>/dev/null || true
    fi

    # 安装依赖
    info "安装 npm 依赖..."
    cd "$APP_DIR"
    npm install --production

    # 设置目录权限
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
    chmod 700 "$APP_DIR/data"
    chmod 600 "$APP_DIR/data/"*.json 2>/dev/null || true

    ok "应用代码部署完成"
}

# 配置环境变量
configure_env() {
    info "配置环境变量..."
    cat > "$APP_DIR/.env" << EOF
PORT=$APP_PORT
ADMIN_PASSWORD=$ADMIN_PASS
USER_PASSWORD=$USER_PASS
ALLOWED_ORIGINS=https://$DOMAIN,http://$DOMAIN
NODE_ENV=production
EOF
    chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
    ok ".env 配置完成"
}

# 配置 PM2
configure_pm2() {
    info "配置 PM2 进程管理..."

    # 确保应用用户的 PM2 目录存在且可写
    mkdir -p /home/"$APP_USER"/.pm2
    chown -R "$APP_USER:$APP_USER" /home/"$APP_USER"/.pm2

    # 删除旧的 PM2 进程（如果存在）
    sudo -u "$APP_USER" HOME=/home/"$APP_USER" pm2 delete "$PM2_NAME" 2>/dev/null || true

    # 删除旧的用户数据文件以触发重新创建（使用新的 bcrypt 密码）
    rm -f "$APP_DIR/data/users.json"

    # 使用专用用户启动（通过 HOME 环境变量指定 home）
    cd "$APP_DIR"
    sudo -u "$APP_USER" \
        HOME=/home/"$APP_USER" \
        NODE_ENV=production \
        PORT=$APP_PORT \
        ADMIN_PASSWORD=$ADMIN_PASS \
        USER_PASSWORD=$USER_PASS \
        ALLOWED_ORIGINS="https://$DOMAIN,http://$DOMAIN" \
        pm2 start server.js --name "$PM2_NAME" --node-args="--max-old-space-size=256"

    sudo -u "$APP_USER" HOME=/home/"$APP_USER" pm2 save
    pm2 startup systemd -u "$APP_USER" --hp /home/"$APP_USER" 2>/dev/null || true

    ok "PM2 配置完成，应用已启动"
}

# 配置 Nginx
configure_nginx() {
    info "配置 Nginx 反向代理..."

    cat > /etc/nginx/sites-available/"$APP_NAME" << EOF
server {
    listen 80;
    server_name $DOMAIN;

    # 安全头
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";

    # 请求体大小限制
    client_max_body_size 2m;

    # 代理到 Node.js 应用
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 禁止访问敏感路径
    location ~* ^/(\.env|data/|node_modules/) {
        deny all;
        return 404;
    }

    # 静态资源缓存
    location ~* \.(html|css|js|ico|png|jpg|svg)$ {
        proxy_pass http://127.0.0.1:$APP_PORT;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }
}
EOF

    # 启用站点
    ln -sf /etc/nginx/sites-available/"$APP_NAME" /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default

    # 测试并重载
    nginx -t
    systemctl reload nginx

    ok "Nginx 反向代理配置完成"
}

# 配置 HTTPS
configure_https() {
    if [[ "$SETUP_HTTPS" =~ ^[Yy]$ ]]; then
        info "配置 HTTPS 证书..."
        apt-get install -y certbot python3-certbot-nginx
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$CERT_EMAIL" --redirect
        ok "HTTPS 配置完成"

        # 更新 .env 中的 ALLOWED_ORIGINS
        sed -i "s|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://$DOMAIN|" "$APP_DIR/.env"
    fi
}

# 配置防火墙
configure_firewall() {
    if command -v ufw &> /dev/null; then
        info "配置防火墙..."
        ufw --force enable
        ufw allow 22/tcp
        ufw allow 80/tcp
        ufw allow 443/tcp
        ufw --force reload
        ok "防火墙配置完成（仅开放 22/80/443）"
    else
        warn "未检测到 ufw，跳过防火墙配置"
    fi
}

# 验证部署
verify_deployment() {
    info "验证部署..."
    sleep 2

    # 检查 PM2 进程
    if sudo -u "$APP_USER" HOME=/home/"$APP_USER" pm2 describe "$PM2_NAME" &> /dev/null; then
        ok "PM2 进程运行中"
    else
        error "PM2 进程未运行，请检查日志: sudo -u $APP_USER HOME=/home/$APP_USER pm2 logs $PM2_NAME"
    fi

    # 检查本地响应
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$APP_PORT/")
    if [[ "$HTTP_CODE" == "200" ]]; then
        ok "应用本地响应正常 (HTTP $HTTP_CODE)"
    else
        warn "应用本地响应异常 (HTTP $HTTP_CODE)"
    fi

    # 检查 Nginx
    if systemctl is-active --quiet nginx; then
        ok "Nginx 运行中"
    else
        warn "Nginx 未运行"
    fi
}

# 打印部署结果
print_result() {
    separator
    echo -e "${GREEN}  部署完成！${NC}"
    separator
    echo ""
    echo -e "  访问地址:  ${CYAN}http://$DOMAIN${NC}"
    if [[ "$SETUP_HTTPS" =~ ^[Yy]$ ]]; then
        echo -e "  HTTPS:     ${CYAN}https://$DOMAIN${NC}"
    fi
    echo ""
    echo -e "  管理员:    ${GREEN}admin${NC} / (您设置的密码)"
    echo -e "  普通用户:  ${GREEN}user${NC} / (您设置的密码)"
    echo ""
    echo -e "  数据目录:  $APP_DIR/data/"
    echo -e "  环境变量:  $APP_DIR/.env"
    echo -e "  Nginx配置: /etc/nginx/sites-available/$APP_NAME"
    echo ""
    echo -e "  常用命令:"
    echo -e "    查看日志:  ${CYAN}sudo -u $APP_USER HOME=/home/$APP_USER pm2 logs $PM2_NAME${NC}"
    echo -e "    重启应用:  ${CYAN}sudo -u $APP_USER HOME=/home/$APP_USER pm2 restart $PM2_NAME${NC}"
    echo -e "    停止应用:  ${CYAN}sudo -u $APP_USER HOME=/home/$APP_USER pm2 stop $PM2_NAME${NC}"
    echo -e "    更新部署:  ${CYAN}sudo bash $APP_DIR/deploy.sh${NC}"
    echo ""
    warn "请尽快登录系统修改默认密码！"
    separator
}

# ============ 主流程 ============

main() {
    check_root

    # 检查是首次部署还是更新
    if [[ -f "$APP_DIR/server.js" ]] && (sudo -u "$APP_USER" HOME=/home/"$APP_USER" pm2 describe "$PM2_NAME" &> /dev/null); then
        echo -e "${YELLOW}检测到已有部署，将执行更新...${NC}"
        echo ""
        read -p "$(echo -e ${YELLOW}'确认更新部署？[Y/n]: '${NC})" CONFIRM_UPDATE
        CONFIRM_UPDATE=${CONFIRM_UPDATE:-y}
        if [[ ! "$CONFIRM_UPDATE" =~ ^[Yy]$ ]]; then
            echo "已取消"
            exit 0
        fi

        # 更新部署：保留配置，只更新代码
        info "停止应用..."
        sudo -u "$APP_USER" HOME=/home/"$APP_USER" pm2 stop "$PM2_NAME" 2>/dev/null || true

        # 重新读取配置
        read_config

        # 只更新代码和重启
        deploy_app
        configure_env
        configure_pm2
        verify_deployment
        print_result
        exit 0
    fi

    # 首次部署
    read_config
    install_system_deps
    create_app_user
    deploy_app
    configure_env
    configure_pm2
    configure_nginx
    configure_https
    configure_firewall
    verify_deployment
    print_result
}

main "$@"
