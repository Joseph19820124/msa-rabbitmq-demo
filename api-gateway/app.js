const express = require('express');
const httpProxy = require('http-proxy-middleware');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const port = process.env.PORT || 3000;

// 服务配置
const services = {
  user: {
    url: process.env.USER_SERVICE_URL || 'http://localhost:3001',
    prefix: '/api/users'
  },
  email: {
    url: process.env.EMAIL_SERVICE_URL || 'http://localhost:3002',
    prefix: '/api/email'
  }
};

// 中间件配置
app.use(helmet()); // 安全头
app.use(cors()); // 跨域支持
app.use(morgan('combined')); // 访问日志
app.use(express.json()); // JSON 解析

// 速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100, // 每个 IP 最多 100 次请求
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

// 健康检查中间件
async function checkServiceHealth(serviceUrl) {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${serviceUrl}/health`, {
      timeout: 5000
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// 请求日志中间件
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});

// 错误处理中间件
function createErrorHandler(serviceName) {
  return (error, req, res, next) => {
    console.error(`Error in ${serviceName} proxy:`, error);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: `${serviceName} service is unavailable`,
        message: 'Service temporarily unavailable, please try again later',
        timestamp: new Date().toISOString()
      });
    }
    
    if (error.code === 'ETIMEDOUT') {
      return res.status(504).json({
        error: `${serviceName} service timeout`,
        message: 'Service request timeout, please try again later',
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(500).json({
      error: 'Internal gateway error',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString()
    });
  };
}

// 用户服务代理
const userServiceProxy = httpProxy.createProxyMiddleware({
  target: services.user.url,
  changeOrigin: true,
  pathRewrite: {
    [`^${services.user.prefix}`]: '/api/users'
  },
  timeout: 30000,
  proxyTimeout: 30000,
  onError: createErrorHandler('User'),
  onProxyReq: (proxyReq, req, res) => {
    // 添加请求头
    proxyReq.setHeader('X-Gateway-Timestamp', new Date().toISOString());
    proxyReq.setHeader('X-Request-ID', `gw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    // 添加响应头
    proxyRes.headers['X-Proxied-By'] = 'API-Gateway';
  }
});

// 邮件服务代理
const emailServiceProxy = httpProxy.createProxyMiddleware({
  target: services.email.url,
  changeOrigin: true,
  pathRewrite: {
    [`^${services.email.prefix}`]: '/api/email'
  },
  timeout: 30000,
  proxyTimeout: 30000,
  onError: createErrorHandler('Email'),
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('X-Gateway-Timestamp', new Date().toISOString());
    proxyReq.setHeader('X-Request-ID', `gw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    proxyRes.headers['X-Proxied-By'] = 'API-Gateway';
  }
});

// 路由配置
app.use(services.user.prefix, userServiceProxy);
app.use(services.email.prefix, emailServiceProxy);

// 根路径
app.get('/', (req, res) => {
  res.json({
    message: 'MSA Demo API Gateway',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      user: services.user.prefix,
      email: services.email.prefix
    },
    endpoints: {
      health: '/health',
      services: '/services',
      documentation: '/docs'
    }
  });
});

// 服务状态检查
app.get('/services', async (req, res) => {
  const serviceStatus = {};
  
  for (const [name, config] of Object.entries(services)) {
    const isHealthy = await checkServiceHealth(config.url);
    serviceStatus[name] = {
      url: config.url,
      prefix: config.prefix,
      status: isHealthy ? 'healthy' : 'unhealthy',
      lastChecked: new Date().toISOString()
    };
  }
  
  res.json({
    gateway: 'healthy',
    timestamp: new Date().toISOString(),
    services: serviceStatus
  });
});

// 网关健康检查
app.get('/health', async (req, res) => {
  try {
    const serviceChecks = await Promise.allSettled(
      Object.entries(services).map(async ([name, config]) => {
        const isHealthy = await checkServiceHealth(config.url);
        return { name, healthy: isHealthy };
      })
    );
    
    const services_status = {};
    let allHealthy = true;
    
    serviceChecks.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { name, healthy } = result.value;
        services_status[name] = healthy ? 'healthy' : 'unhealthy';
        if (!healthy) allHealthy = false;
      } else {
        const serviceName = Object.keys(services)[index];
        services_status[serviceName] = 'error';
        allHealthy = false;
      }
    });
    
    const status = allHealthy ? 'healthy' : 'degraded';
    
    res.status(allHealthy ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      service: 'api-gateway',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: services_status
    });
    
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'api-gateway',
      error: error.message
    });
  }
});

// API 文档
app.get('/docs', (req, res) => {
  res.json({
    title: 'MSA Demo API Documentation',
    version: '1.0.0',
    description: 'Microservices Architecture Demo with RabbitMQ',
    baseUrl: req.protocol + '://' + req.get('host'),
    endpoints: {
      users: {
        register: 'POST /api/users/register',
        getUser: 'GET /api/users/:id',
        getAllUsers: 'GET /api/users'
      },
      email: {
        stats: 'GET /api/email/stats'
      },
      gateway: {
        health: 'GET /health',
        services: 'GET /services',
        docs: 'GET /docs'
      }
    },
    examples: {
      userRegistration: {
        method: 'POST',
        url: '/api/users/register',
        body: {
          username: 'john_doe',
          email: 'john@example.com',
          password: 'securepassword',
          firstName: 'John',
          lastName: 'Doe'
        }
      }
    }
  });
});

// 404 处理
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The requested route ${req.originalUrl} was not found on this server`,
    timestamp: new Date().toISOString(),
    availableRoutes: [
      '/',
      '/health',
      '/services',
      '/docs',
      services.user.prefix,
      services.email.prefix
    ]
  });
});

// 全局错误处理
app.use((error, req, res, next) => {
  console.error('Gateway error:', error);
  res.status(500).json({
    error: 'Internal gateway error',
    message: 'An unexpected error occurred in the API gateway',
    timestamp: new Date().toISOString()
  });
});

// 启动服务器
app.listen(port, () => {
  console.log(`API Gateway is running on port ${port}`);
  console.log(`Gateway URL: http://localhost:${port}`);
  console.log('Configured services:');
  Object.entries(services).forEach(([name, config]) => {
    console.log(`  - ${name}: ${config.prefix} -> ${config.url}`);
  });
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('Shutting down API Gateway...');
  process.exit(0);
});