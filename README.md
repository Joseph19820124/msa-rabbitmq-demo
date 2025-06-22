# MSA RabbitMQ Demo - 微服务架构示例

这是一个基于 RabbitMQ 的微服务架构演示项目，展示了用户注册后通过消息队列异步发送欢迎邮件的完整流程。

## 🏗️ 架构概览

```
📦 msa-rabbitmq-demo/
├── docker-compose.yml       # 编排所有服务
├── api-gateway/             # 网关服务 (端口: 3000)
├── user-service/            # 用户服务 (端口: 3001)
├── email-service/           # 邮件服务 (端口: 3002)
├── rabbitmq/                # RabbitMQ 配置
└── shared/                  # 公共模块
```

## 🔄 业务流程

1. **用户注册** → API Gateway → User Service
2. **保存用户** → PostgreSQL 数据库
3. **发布事件** → RabbitMQ (UserRegistered Event)
4. **监听事件** → Email Service 接收事件
5. **发送邮件** → SMTP 服务器发送欢迎邮件
6. **事件反馈** → Email Service 发布邮件状态事件

## 🚀 快速开始

### 前置要求

- Docker & Docker Compose
- Node.js 18+ (用于本地开发)

### 1. 克隆项目

```bash
git clone https://github.com/Joseph19820124/msa-rabbitmq-demo.git
cd msa-rabbitmq-demo
```

### 2. 配置环境变量

创建 `.env` 文件（可选，使用默认配置）：

```bash
# RabbitMQ
RABBITMQ_DEFAULT_USER=admin
RABBITMQ_DEFAULT_PASS=admin123

# 邮件配置 (需要配置真实的 SMTP 信息)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# 数据库
DB_USER=user
DB_PASSWORD=password
DB_NAME=userdb
```

### 3. 启动所有服务

```bash
docker-compose up -d
```

### 4. 验证服务状态

```bash
# 检查所有容器状态
docker-compose ps

# 检查网关健康状态
curl http://localhost:3000/health

# 检查服务状态
curl http://localhost:3000/services
```

## 📡 API 接口

### 网关服务 (http://localhost:3000)

- `GET /` - 网关首页信息
- `GET /health` - 健康检查
- `GET /services` - 服务状态
- `GET /docs` - API 文档

### 用户服务 (通过网关访问)

#### 注册用户
```bash
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "securepassword",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

#### 获取用户信息
```bash
# 获取单个用户
curl http://localhost:3000/api/users/1

# 获取所有用户
curl http://localhost:3000/api/users
```

### 邮件服务

- `GET /api/email/stats` - 邮件统计信息

## 🐰 RabbitMQ 管理

访问 RabbitMQ 管理界面：
- URL: http://localhost:15672
- 用户名: `admin`
- 密码: `admin123`

### 队列和交换机

- **Exchanges**:
  - `user.events.exchange` - 用户事件交换机
  - `email.events.exchange` - 邮件事件交换机

- **Queues**:
  - `user.events` - 用户事件队列
  - `email.requests` - 邮件请求队列
  - `email.responses` - 邮件响应队列

## 🔧 本地开发

### 单独启动服务

```bash
# 启动 RabbitMQ 和数据库
docker-compose up -d rabbitmq user-db

# 启动用户服务
cd user-service
npm install
npm run dev

# 启动邮件服务
cd email-service
npm install
npm run dev

# 启动网关
cd api-gateway
npm install
npm run dev
```

### 服务依赖关系

1. **RabbitMQ** - 所有服务的消息队列
2. **PostgreSQL** - 用户服务的数据库
3. **User Service** - 处理用户注册和管理
4. **Email Service** - 监听事件并发送邮件
5. **API Gateway** - 统一入口和路由转发

## 📊 监控和日志

### 查看服务日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f user-service
docker-compose logs -f email-service
docker-compose logs -f api-gateway
```

### 健康检查

每个服务都提供 `/health` 端点用于健康检查：

```bash
# 网关健康检查
curl http://localhost:3000/health

# 用户服务健康检查
curl http://localhost:3001/health

# 邮件服务健康检查
curl http://localhost:3002/health
```

## 🔒 安全特性

- **速率限制**: API Gateway 实现了请求速率限制
- **安全头**: 使用 Helmet 添加安全 HTTP 头
- **密码加密**: 使用 bcrypt 加密用户密码
- **输入验证**: 各服务都有输入验证机制
- **CORS 支持**: 配置了跨域资源共享

## 🐛 故障排除

### 常见问题

1. **RabbitMQ 连接失败**
   ```bash
   # 检查 RabbitMQ 容器状态
   docker-compose logs rabbitmq
   
   # 重启 RabbitMQ
   docker-compose restart rabbitmq
   ```

2. **数据库连接失败**
   ```bash
   # 检查数据库容器
   docker-compose logs user-db
   
   # 重启数据库
   docker-compose restart user-db
   ```

3. **邮件发送失败**
   - 检查 SMTP 配置是否正确
   - 确认邮箱账号的应用密码设置
   - 查看邮件服务日志

4. **服务无法访问**
   ```bash
   # 检查端口占用
   netstat -tulpn | grep :3000
   
   # 检查 Docker 网络
   docker network ls
   docker network inspect msa-rabbitmq-demo_msa-network
   ```

### 重置环境

```bash
# 停止并删除所有容器
docker-compose down

# 删除数据卷（注意：会清空所有数据）
docker-compose down -v

# 重新构建并启动
docker-compose up --build -d
```

## 📈 扩展功能

这个项目可以扩展以下功能：

1. **认证授权**: 添加 JWT 认证
2. **日志聚合**: 集成 ELK 堆栈
3. **服务监控**: 添加 Prometheus + Grafana
4. **配置管理**: 使用 Consul 或 etcd
5. **服务发现**: 实现动态服务发现
6. **断路器**: 添加熔断机制
7. **分布式追踪**: 集成 Jaeger 或 Zipkin

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目！

## 📄 许可证

MIT License - 详见 LICENSE 文件