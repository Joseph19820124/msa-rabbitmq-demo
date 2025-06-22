const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const cors = require('cors');
const RabbitMQManager = require('../rabbitmq/rabbitmq-setup');
const { UserRegisteredEvent, EXCHANGES, ROUTING_KEYS, EventUtils } = require('../shared/events');

const app = express();
const port = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// 数据库连接
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'user',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'userdb',
  port: 5432,
});

// RabbitMQ 连接
const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672';
const rabbitMQ = new RabbitMQManager(rabbitmqUrl);

// 数据库初始化
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
}

// 用户注册接口
app.post('/api/users/register', async (req, res) => {
  const correlationId = EventUtils.createCorrelationId();
  
  try {
    const { username, email, password, firstName, lastName } = req.body;

    // 输入验证
    if (!username || !email || !password) {
      return res.status(400).json({
        error: 'Username, email, and password are required',
        correlationId
      });
    }

    // 检查用户是否已存在
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'Username or email already exists',
        correlationId
      });
    }

    // 密码加密
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 保存用户到数据库
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, first_name, last_name, created_at`,
      [username, email, passwordHash, firstName || null, lastName || null]
    );

    const newUser = result.rows[0];

    // 创建用户注册事件
    const userRegisteredEvent = new UserRegisteredEvent({
      userId: newUser.id,
      username: newUser.username,
      email: newUser.email,
      firstName: newUser.first_name,
      lastName: newUser.last_name,
      registeredAt: newUser.created_at
    }, correlationId);

    // 发布事件到 RabbitMQ
    await rabbitMQ.publishMessage(
      EXCHANGES.USER_EVENTS,
      ROUTING_KEYS.USER_REGISTERED,
      userRegisteredEvent.toJSON()
    );

    EventUtils.logEvent(userRegisteredEvent, 'USER-SERVICE');

    // 返回成功响应（不包含密码）
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        createdAt: newUser.created_at
      },
      correlationId
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal server error during registration',
      correlationId
    });
  }
});

// 获取用户信息接口
app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT id, username, email, first_name, last_name, created_at FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取所有用户接口
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, first_name, last_name, created_at FROM users ORDER BY created_at DESC'
    );

    res.json({
      users: result.rows.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at
      }))
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 健康检查接口
app.get('/health', async (req, res) => {
  try {
    // 检查数据库连接
    await pool.query('SELECT 1');
    
    // 检查 RabbitMQ 连接
    const rabbitMQHealthy = rabbitMQ.isHealthy();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'user-service',
      database: 'connected',
      rabbitmq: rabbitMQHealthy ? 'connected' : 'disconnected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'user-service',
      error: error.message
    });
  }
});

// 启动服务
async function startServer() {
  try {
    // 初始化数据库
    await initDatabase();
    
    // 连接到 RabbitMQ
    await rabbitMQ.connect();
    
    // 启动 HTTP 服务器
    app.listen(port, () => {
      console.log(`User service is running on port ${port}`);
    });
    
  } catch (error) {
    console.error('Failed to start user service:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('Shutting down user service...');
  try {
    await rabbitMQ.close();
    await pool.end();
    console.log('User service shut down gracefully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

startServer();