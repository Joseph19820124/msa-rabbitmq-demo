const express = require('express');
const nodemailer = require('nodemailer');
const RabbitMQManager = require('../rabbitmq/rabbitmq-setup');
const {
  EVENT_TYPES,
  QUEUES,
  EXCHANGES,
  ROUTING_KEYS,
  EmailSentEvent,
  EmailFailedEvent,
  EventUtils
} = require('../shared/events');

const app = express();
const port = process.env.PORT || 3002;

// 中间件
app.use(express.json());

// 邮件配置
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'your-email@gmail.com',
    pass: process.env.SMTP_PASS || 'your-app-password'
  }
};

// 创建邮件传输器
let transporter;
try {
  transporter = nodemailer.createTransporter(emailConfig);
  console.log('Email transporter created successfully');
} catch (error) {
  console.error('Failed to create email transporter:', error);
}

// RabbitMQ 连接
const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672';
const rabbitMQ = new RabbitMQManager(rabbitmqUrl);

// 邮件模板
const emailTemplates = {
  welcome: {
    subject: '欢迎加入我们的平台！',
    getHtml: (userData) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">欢迎，${userData.firstName || userData.username}！</h2>
        <p>感谢您注册我们的平台。我们很高兴您能加入我们！</p>
        <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3>您的账户信息：</h3>
          <p><strong>用户名:</strong> ${userData.username}</p>
          <p><strong>邮箱:</strong> ${userData.email}</p>
          <p><strong>注册时间:</strong> ${new Date(userData.registeredAt).toLocaleString()}</p>
        </div>
        <p>如果您有任何问题，请随时联系我们的支持团队。</p>
        <p style="color: #666; font-size: 12px;">
          此邮件由系统自动发送，请勿回复。
        </p>
      </div>
    `,
    getText: (userData) => `
      欢迎，${userData.firstName || userData.username}！
      
      感谢您注册我们的平台。我们很高兴您能加入我们！
      
      您的账户信息：
      用户名: ${userData.username}
      邮箱: ${userData.email}
      注册时间: ${new Date(userData.registeredAt).toLocaleString()}
      
      如果您有任何问题，请随时联系我们的支持团队。
      
      此邮件由系统自动发送，请勿回复。
    `
  }
};

// 发送邮件函数
async function sendEmail(to, subject, htmlContent, textContent) {
  try {
    // 验证邮件传输器
    if (!transporter) {
      throw new Error('Email transporter not configured');
    }

    const mailOptions = {
      from: `"MSA Demo Platform" <${emailConfig.auth.user}>`,
      to: to,
      subject: subject,
      text: textContent,
      html: htmlContent
    };

    console.log(`Sending email to: ${to}`);
    const info = await transporter.sendMail(mailOptions);
    
    console.log('Email sent successfully:', info.messageId);
    return {
      success: true,
      messageId: info.messageId,
      to: to,
      subject: subject
    };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

// 处理用户注册事件
async function handleUserRegisteredEvent(eventData, msg) {
  try {
    console.log('Processing user registered event:', eventData);
    
    if (eventData.type !== EVENT_TYPES.USER_REGISTERED) {
      console.log('Ignoring non-user-registered event');
      return;
    }

    const userData = eventData.data;
    const correlationId = eventData.correlationId;

    // 生成欢迎邮件内容
    const template = emailTemplates.welcome;
    const htmlContent = template.getHtml(userData);
    const textContent = template.getText(userData);

    try {
      // 发送欢迎邮件
      const result = await sendEmail(
        userData.email,
        template.subject,
        htmlContent,
        textContent
      );

      // 发布邮件发送成功事件
      const emailSentEvent = new EmailSentEvent({
        emailType: 'welcome',
        recipient: userData.email,
        messageId: result.messageId,
        sentAt: new Date().toISOString(),
        userId: userData.userId
      }, correlationId);

      await rabbitMQ.publishMessage(
        EXCHANGES.EMAIL_EVENTS,
        'email.sent',
        emailSentEvent.toJSON()
      );

      EventUtils.logEvent(emailSentEvent, 'EMAIL-SERVICE');

    } catch (emailError) {
      // 发布邮件发送失败事件
      const emailFailedEvent = new EmailFailedEvent({
        emailType: 'welcome',
        recipient: userData.email,
        error: emailError.message,
        failedAt: new Date().toISOString(),
        userId: userData.userId
      }, correlationId);

      await rabbitMQ.publishMessage(
        EXCHANGES.EMAIL_EVENTS,
        'email.failed',
        emailFailedEvent.toJSON()
      );

      EventUtils.logEvent(emailFailedEvent, 'EMAIL-SERVICE');
      throw emailError;
    }

  } catch (error) {
    console.error('Error handling user registered event:', error);
    throw error;
  }
}

// 健康检查接口
app.get('/health', async (req, res) => {
  try {
    // 检查 RabbitMQ 连接
    const rabbitMQHealthy = rabbitMQ.isHealthy();
    
    // 检查邮件服务配置
    const emailConfigured = !!transporter;
    
    // 如果可能，测试邮件连接
    let emailConnected = false;
    if (transporter) {
      try {
        await transporter.verify();
        emailConnected = true;
      } catch (error) {
        console.log('Email verification failed:', error.message);
      }
    }
    
    const isHealthy = rabbitMQHealthy && emailConfigured;
    
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'email-service',
      rabbitmq: rabbitMQHealthy ? 'connected' : 'disconnected',
      email: {
        configured: emailConfigured,
        connected: emailConnected
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'email-service',
      error: error.message
    });
  }
});

// 获取邮件统计信息接口
app.get('/api/email/stats', (req, res) => {
  // 这里可以实现邮件发送统计功能
  res.json({
    message: 'Email statistics endpoint',
    timestamp: new Date().toISOString()
  });
});

// 启动服务
async function startService() {
  try {
    // 连接到 RabbitMQ
    await rabbitMQ.connect();
    
    // 开始监听用户注册事件
    await rabbitMQ.consumeMessages(
      QUEUES.EMAIL_REQUESTS,
      handleUserRegisteredEvent
    );

    // 启动 HTTP 服务器
    app.listen(port, () => {
      console.log(`Email service is running on port ${port}`);
      console.log('Listening for user registration events...');
    });
    
  } catch (error) {
    console.error('Failed to start email service:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('Shutting down email service...');
  try {
    await rabbitMQ.close();
    if (transporter) {
      transporter.close();
    }
    console.log('Email service shut down gracefully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

startService();