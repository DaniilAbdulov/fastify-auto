import fastify, {FastifyInstance, FastifyRequest} from 'fastify';
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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  schema?: RouteSchema;
  config?: RouteConfig;
  handler: (params: {
    body?: any;
    params?: any;
    query?: any;
    headers?: any;
    request: FastifyRequest;
  }) => Promise<any> | any; // Обработчик возвращает ТОЛЬКО данные
}

export interface ServiceOptions {
  name: string;
  port?: number;
  host?: string;
  prefix?: string;
  routes: RouteDefinition[];
  fastifyOptions?: any;
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
      ...this.options.fastifyOptions,
    });

    this.validator = new Validator();
    this.responder = new Responder();
  }

  async initialize(): Promise<void> {
    if (this.options.autoDocs) {
      await this.setupDocs();
    }

    this.registerRoutes();

    await this.app.listen({
      port: this.options.port!,
      host: this.options.host!,
    });

    console.log(
      `✅ ${this.options.name} started on http://${this.options.host}:${this.options.port}`,
    );
  }

  private async setupDocs() {
    try {
      await this.app.register(import('@fastify/swagger'), {
        swagger: {
          info: {
            title: this.options.name,
            version: '1.0.0',
          },
          host: `${this.options.host}:${this.options.port}`,
        },
      });

      await this.app.register(import('@fastify/swagger-ui'), {
        routePrefix: '/docs',
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

      this.app.route({
        method: route.method,
        url: fullPath,
        schema: {
          ...route.schema,
          ...route.config,
          response: route.schema?.response || {
            200: {type: 'object'},
            500: {
              type: 'object',
              properties: {
                success: {type: 'boolean'},
                error: {type: 'string'},
              },
            },
          },
        },
        handler: async (request, reply) => {
          try {
            // 1. Валидация входящих данных
            const validated = this.validator.validateRequest(
              request,
              route.schema,
            );

            // 2. Вызов обработчика с чистыми данными
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

            // 4. Автоматический успешный ответ
            return this.responder.success(
              reply,
              responseData,
              this.getStatusCode(route.method),
            );
          } catch (error: any) {
            // 5. Автоматическая обработка ошибок
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
}

// Фабричная функция
export function createService(options: ServiceOptions): Service {
  return new Service(options);
}
