import {createClient, RedisClientType} from 'redis';

const PROD_URL = 'redis://redis-service:6379';
const DEV_URL = 'redis://localhost:6379';

export interface EventsOptions {
  ttl?: number;
  prefix?: string;
  channel?: string;
}

export class Events {
  private client: RedisClientType;
  private subscriber: RedisClientType;
  private defaultTTL: number;
  private keyPrefix: string;
  private defaultChannel: string;
  private isConnected: boolean = false;
  private messageHandlers: Map<string, ((message: any) => void)[]> = new Map();

  constructor(options: EventsOptions = {}) {
    this.defaultTTL = options.ttl || 3600;
    this.keyPrefix = options.prefix || 'events:';
    this.defaultChannel = options.channel || 'default_channel';

    const redisUrl =
      process.env.NODE_ENV === 'development' ? DEV_URL : PROD_URL;

    console.log(`Redis URL:`, redisUrl);

    // Основной клиент для публикации
    this.client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries: number) => {
          if (retries > 3) {
            console.error('Too many retries on Redis connection');
            return new Error('Too many retries');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    // Отдельный клиент для подписки (рекомендуется Redis)
    this.subscriber = this.client.duplicate();

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Обработчики для основного клиента
    this.client.on('error', (err: string) => {
      console.error('Redis Client Error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('Redis connected successfully');
      this.isConnected = true;
    });

    this.client.on('end', () => {
      console.log('Redis connection ended');
      this.isConnected = false;
    });

    // Обработчики для клиента подписки
    this.subscriber.on('error', (err: string) => {
      console.error('Redis Subscriber Error:', err);
    });

    this.subscriber.on('connect', () => {
      console.log('Redis subscriber connected successfully');
    });

    // Обработка входящих сообщений
    this.subscriber.on('message', (channel: string, message: any) => {
      this.handleIncomingMessage(channel, message);
    });
  }

  private handleIncomingMessage(channel: string, message: string): void {
    try {
      const parsedMessage = JSON.parse(message);
      console.log(`Received message on channel ${channel}:`, parsedMessage);

      // Вызываем все обработчики для этого канала
      const handlers = this.messageHandlers.get(channel) || [];
      handlers.forEach((handler) => {
        try {
          handler(parsedMessage);
        } catch (error) {
          console.error(
            `Error in message handler for channel ${channel}:`,
            error,
          );
        }
      });
    } catch (error) {
      console.error(`Failed to parse message on channel ${channel}:`, error);
    }
  }

  /**
   * Подключение к Redis
   */
  async connect(): Promise<void> {
    if (!this.isConnected) {
      try {
        await this.client.connect();
        await this.subscriber.connect();
        console.log('Both Redis clients connected successfully');
      } catch (error) {
        console.error('Failed to connect to Redis:', error);
        throw error;
      }
    }
  }

  /**
   * Отключение от Redis
   */
  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.subscriber.quit();
      await this.client.quit();
      this.isConnected = false;
      console.log('Redis clients disconnected');
    }
  }

  /**
   * Публикация события в канал
   */
  async publish(
    channel: string = this.defaultChannel,
    data: any,
  ): Promise<number> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis client is not connected');
      }

      const message = typeof data === 'string' ? data : JSON.stringify(data);
      const result = await this.client.publish(channel, message);

      console.log(`Published to channel ${channel}:`, data);
      return result; // возвращает количество подписчиков, получивших сообщение
    } catch (error) {
      console.error(`Failed to publish to channel ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Подписка на канал
   */
  async subscribe(
    channel: string = this.defaultChannel,
    handler?: (message: any) => void,
  ): Promise<void> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis client is not connected');
      }

      await this.subscriber.subscribe(channel, (message: any) => {
        this.handleIncomingMessage(channel, message);
      });

      // Если передан обработчик, добавляем его в Map
      if (handler) {
        if (!this.messageHandlers.has(channel)) {
          this.messageHandlers.set(channel, []);
        }
        this.messageHandlers.get(channel)!.push(handler);
      }

      console.log(`Subscribed to channel: ${channel}`);
    } catch (error) {
      console.error(`Failed to subscribe to channel ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Отписка от канала
   */
  async unsubscribe(
    channel: string = this.defaultChannel,
    handler?: (message: any) => void,
  ): Promise<void> {
    try {
      if (handler && this.messageHandlers.has(channel)) {
        // Удаляем конкретный обработчик
        const handlers = this.messageHandlers.get(channel)!;
        const index = handlers.indexOf(handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }

        // Если обработчиков не осталось, отписываемся от канала
        if (handlers.length === 0) {
          await this.subscriber.unsubscribe(channel);
          this.messageHandlers.delete(channel);
        }
      } else {
        // Отписываемся от канала полностью
        await this.subscriber.unsubscribe(channel);
        this.messageHandlers.delete(channel);
      }

      console.log(`Unsubscribed from channel: ${channel}`);
    } catch (error) {
      console.error(`Failed to unsubscribe from channel ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Проверка соединения с Redis
   */
  async ping(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch (error) {
      console.error('Ping failed:', error);
      return false;
    }
  }

  /**
   * Получить статус соединения
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Получить список активных подписок
   */
  getActiveSubscriptions(): string[] {
    return Array.from(this.messageHandlers.keys());
  }
}

// Пример использования:
/*
const events = new Events({ channel: 'my_app' });

async function example() {
  await events.connect();

  // Подписка на события
  await events.subscribe('user_actions', (message) => {
    console.log('User action:', message);
  });

  // Публикация события
  await events.publish('user_actions', {
    type: 'login',
    userId: 123,
    timestamp: new Date()
  });

  // Отписка
  await events.unsubscribe('user_actions');

  await events.disconnect();
}
*/
