const amqp = require('amqplib');
const { EXCHANGES, QUEUES, ROUTING_KEYS } = require('../shared/events');

class RabbitMQManager {
  constructor(url) {
    this.url = url;
    this.connection = null;
    this.channel = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      console.log('Connecting to RabbitMQ...');
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();
      
      // 设置连接事件监听
      this.connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err);
        this.isConnected = false;
      });

      this.connection.on('close', () => {
        console.log('RabbitMQ connection closed');
        this.isConnected = false;
      });

      this.isConnected = true;
      console.log('Connected to RabbitMQ successfully');
      
      // 初始化交换机和队列
      await this.setupExchangesAndQueues();
      
      return this.channel;
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  async setupExchangesAndQueues() {
    try {
      // 创建交换机
      await this.channel.assertExchange(EXCHANGES.USER_EVENTS, 'topic', { durable: true });
      await this.channel.assertExchange(EXCHANGES.EMAIL_EVENTS, 'topic', { durable: true });

      // 创建队列
      await this.channel.assertQueue(QUEUES.USER_EVENTS, { durable: true });
      await this.channel.assertQueue(QUEUES.EMAIL_REQUESTS, { durable: true });
      await this.channel.assertQueue(QUEUES.EMAIL_RESPONSES, { durable: true });

      // 绑定队列到交换机
      await this.channel.bindQueue(
        QUEUES.EMAIL_REQUESTS,
        EXCHANGES.USER_EVENTS,
        ROUTING_KEYS.USER_REGISTERED
      );

      await this.channel.bindQueue(
        QUEUES.EMAIL_RESPONSES,
        EXCHANGES.EMAIL_EVENTS,
        'email.*'
      );

      console.log('RabbitMQ exchanges and queues setup completed');
    } catch (error) {
      console.error('Failed to setup exchanges and queues:', error);
      throw error;
    }
  }

  async publishMessage(exchange, routingKey, message, options = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Not connected to RabbitMQ');
      }

      const messageBuffer = Buffer.from(JSON.stringify(message));
      const publishOptions = {
        persistent: true,
        timestamp: Date.now(),
        ...options
      };

      const published = this.channel.publish(
        exchange,
        routingKey,
        messageBuffer,
        publishOptions
      );

      if (published) {
        console.log(`Message published to ${exchange} with routing key ${routingKey}`);
        return true;
      } else {
        throw new Error('Failed to publish message');
      }
    } catch (error) {
      console.error('Error publishing message:', error);
      throw error;
    }
  }

  async consumeMessages(queue, callback, options = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Not connected to RabbitMQ');
      }

      const consumeOptions = {
        noAck: false,
        ...options
      };

      await this.channel.consume(queue, async (msg) => {
        if (msg) {
          try {
            const content = JSON.parse(msg.content.toString());
            console.log(`Received message from ${queue}:`, content);
            
            await callback(content, msg);
            
            // 手动确认消息
            this.channel.ack(msg);
          } catch (error) {
            console.error('Error processing message:', error);
            
            // 拒绝消息并重新入队
            this.channel.nack(msg, false, true);
          }
        }
      }, consumeOptions);

      console.log(`Started consuming messages from ${queue}`);
    } catch (error) {
      console.error('Error setting up consumer:', error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.isConnected = false;
      console.log('RabbitMQ connection closed');
    } catch (error) {
      console.error('Error closing RabbitMQ connection:', error);
    }
  }

  // 健康检查
  isHealthy() {
    return this.isConnected && this.connection && !this.connection.closed;
  }

  // 重连机制
  async reconnect(maxRetries = 5, delay = 5000) {
    let retries = 0;
    
    while (retries < maxRetries && !this.isConnected) {
      try {
        console.log(`Attempting to reconnect (${retries + 1}/${maxRetries})...`);
        await this.connect();
        return true;
      } catch (error) {
        retries++;
        if (retries < maxRetries) {
          console.log(`Reconnection failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error('Failed to reconnect to RabbitMQ after maximum retries');
  }
}

module.exports = RabbitMQManager;