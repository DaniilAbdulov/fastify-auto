import fastify, {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
  FastifyServerOptions,
  HTTPMethods,
} from 'fastify';
import {Validator} from './validator';
import {Responder} from './responder';

export interface RouteSchema {
  body?: any;
  params?: any;
  query?: any;
  headers?: any;
  response?: {
    [statusCode: number]: any;
  };
}

export interface RouteConfig {
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
}

export interface RouteDefinition {
  method: HTTPMethods;
  path: string;
  schema?: RouteSchema;
  config?: RouteConfig;
  handler: (params: {
    body?: any;
    params?: any;
    query?: any;
    headers?: any;
    request: FastifyRequest;
  }) => Promise<any> | any;
}

export interface ServiceOptions {
  name: string;
  port?: number;
  host?: string;
  prefix?: string;
  routes: RouteDefinition[];
  fastifyOptions?: FastifyServerOptions;
  autoDocs?: boolean;
}

export class Service {
  private app: FastifyInstance;
  private validator: Validator;
  private responder: Responder;
  private options: ServiceOptions;

  constructor(options: ServiceOptions) {
    this.options = {
      port: 3000,
      host: '0.0.0.0',
      prefix: '/api',
      autoDocs: true,
      ...options,
    };

    this.app = fastify({
      logger: true,
      ajv: {
        customOptions: {
          allErrors: true,
          removeAdditional: 'all',
          coerceTypes: true,
        },
      },
      http2: false,
      ...this.options.fastifyOptions,
    } as FastifyServerOptions);

    this.validator = new Validator();
    this.responder = new Responder();
  }

  async initialize(): Promise<void> {
    if (this.options.autoDocs) {
      await this.setupDocs();
    }

    this.registerRoutes();

    try {
      await this.app.listen({
        port: this.options.port!,
        host: this.options.host!,
      });

      console.log(
        `✅ ${this.options.name} started on http://${this.options.host}:${this.options.port}`,
      );
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private async setupDocs() {
    try {
      // Динамический импорт для опциональной зависимости
      const swagger = await import('@fastify/swagger');
      const swaggerUi = await import('@fastify/swagger-ui');

      await this.app.register(swagger.default, {
        swagger: {
          info: {
            title: this.options.name,
            version: '1.0.0',
          },
          host: `${this.options.host}:${this.options.port}`,
          schemes: ['http'],
          consumes: ['application/json'],
          produces: ['application/json'],
        },
      });

      await this.app.register(swaggerUi.default, {
        routePrefix: '/docs',
        uiConfig: {
          docExpansion: 'full',
          deepLinking: false,
        },
      });
    } catch (error) {
      console.warn('Swagger dependencies not found. Docs disabled.');
    }
  }

  private registerRoutes() {
    for (const route of this.options.routes) {
      const fullPath = `${this.options.prefix}${route.path}`.replace(
        /\/\//g,
        '/',
      );

      // Создаем схему для маршрута
      const routeSchema: any = {
        ...(route.schema || {}),
        hide: false,
        tags: route.config?.tags || ['default'],
      };

      if (route.config?.summary) {
        routeSchema.summary = route.config.summary;
      }
      if (route.config?.description) {
        routeSchema.description = route.config.description;
      }
      if (route.config?.deprecated) {
        routeSchema.deprecated = route.config.deprecated;
      }

      // Добавляем стандартные схемы ошибок если их нет
      if (!routeSchema.response) {
        routeSchema.response = {};
      }

      if (!routeSchema.response[400]) {
        routeSchema.response[400] = {
          type: 'object',
          properties: {
            success: {type: 'boolean'},
            error: {type: 'string'},
            details: {type: 'array', nullable: true},
          },
        };
      }

      if (!routeSchema.response[500]) {
        routeSchema.response[500] = {
          type: 'object',
          properties: {
            success: {type: 'boolean'},
            error: {type: 'string'},
          },
        };
      }

      // Регистрируем маршрут
      this.app.route({
        method: route.method,
        url: fullPath,
        schema: routeSchema,
        handler: async (request: FastifyRequest, reply: FastifyReply) => {
          try {
            // 1. Валидация входящих данных
            const validated = this.validator.validateRequest(
              request,
              route.schema,
            );

            // 2. Вызов обработчика
            const handlerResult = await route.handler({
              body: validated.body,
              params: validated.params,
              query: validated.query,
              headers: validated.headers,
              request,
            });

            // 3. Валидация исходящих данных
            const responseData = this.validator.validateResponse(
              handlerResult,
              route.schema?.response,
            );

            // 4. Автоматический ответ
            return this.responder.success(
              reply,
              responseData,
              this.getStatusCode(route.method),
            );
          } catch (error: any) {
            // 5. Обработка ошибок
            return this.responder.error(reply, error);
          }
        },
      });
    }
  }

  private getStatusCode(method: string): number {
    const statusCodes: Record<string, number> = {
      POST: 201,
      DELETE: 204,
      PUT: 200,
      PATCH: 200,
      GET: 200,
    };
    return statusCodes[method] || 200;
  }

  getApp(): FastifyInstance {
    return this.app;
  }

  async close(): Promise<void> {
    await this.app.close();
  }
}

// Фабричная функция
export function createService(options: ServiceOptions): Service {
  return new Service(options);
}
