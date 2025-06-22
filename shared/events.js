// 共享事件定义和工具函数

// 事件类型常量
const EVENT_TYPES = {
  USER_REGISTERED: 'user.registered',
  EMAIL_SEND_REQUEST: 'email.send.request',
  EMAIL_SENT: 'email.sent',
  EMAIL_FAILED: 'email.failed'
};

// 队列名称常量
const QUEUES = {
  USER_EVENTS: 'user.events',
  EMAIL_REQUESTS: 'email.requests',
  EMAIL_RESPONSES: 'email.responses'
};

// 交换机名称常量
const EXCHANGES = {
  USER_EVENTS: 'user.events.exchange',
  EMAIL_EVENTS: 'email.events.exchange'
};

// 路由键常量
const ROUTING_KEYS = {
  USER_REGISTERED: 'user.registered',
  EMAIL_WELCOME: 'email.welcome',
  EMAIL_NOTIFICATION: 'email.notification'
};

// 事件基类
class BaseEvent {
  constructor(type, data, correlationId = null) {
    this.type = type;
    this.data = data;
    this.timestamp = new Date().toISOString();
    this.correlationId = correlationId || this.generateId();
    this.version = '1.0';
  }

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  toJSON() {
    return {
      type: this.type,
      data: this.data,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
      version: this.version
    };
  }

  static fromJSON(json) {
    const event = new BaseEvent(json.type, json.data, json.correlationId);
    event.timestamp = json.timestamp;
    event.version = json.version;
    return event;
  }
}

// 用户注册事件
class UserRegisteredEvent extends BaseEvent {
  constructor(userData, correlationId = null) {
    super(EVENT_TYPES.USER_REGISTERED, userData, correlationId);
  }
}

// 邮件发送请求事件
class EmailSendRequestEvent extends BaseEvent {
  constructor(emailData, correlationId = null) {
    super(EVENT_TYPES.EMAIL_SEND_REQUEST, emailData, correlationId);
  }
}

// 邮件发送成功事件
class EmailSentEvent extends BaseEvent {
  constructor(result, correlationId = null) {
    super(EVENT_TYPES.EMAIL_SENT, result, correlationId);
  }
}

// 邮件发送失败事件
class EmailFailedEvent extends BaseEvent {
  constructor(error, correlationId = null) {
    super(EVENT_TYPES.EMAIL_FAILED, error, correlationId);
  }
}

// 工具函数
class EventUtils {
  static validateEvent(event) {
    if (!event.type || !event.data || !event.timestamp) {
      throw new Error('Invalid event format');
    }
    return true;
  }

  static createCorrelationId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static logEvent(event, context = '') {
    console.log(`[${context}] Event: ${event.type} | ID: ${event.correlationId} | Time: ${event.timestamp}`);
  }
}

module.exports = {
  EVENT_TYPES,
  QUEUES,
  EXCHANGES,
  ROUTING_KEYS,
  BaseEvent,
  UserRegisteredEvent,
  EmailSendRequestEvent,
  EmailSentEvent,
  EmailFailedEvent,
  EventUtils
};