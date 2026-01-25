import fastify, {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
  FastifyServerOptions,
  HTTPMethods,
} from 'fastify';
import ajvKeywords from 'ajv-keywords';
import ajvErrors from 'ajv-errors';

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
  strictValidation?: boolean;
}

export class Service {
  private app: FastifyInstance;
  private options: Required<ServiceOptions>;

  constructor(options: ServiceOptions) {
    const {
      name,
      routes,
      port = 3000,
      host = '0.0.0.0',
      prefix = '/api',
      fastifyOptions = {},
      autoDocs = true,
      strictValidation = true,
    } = options;

    this.options = {
      name,
      routes,
      port,
      host,
      prefix,
      fastifyOptions,
      autoDocs,
      strictValidation,
    };

    this.app = fastify({
      logger: {
        level: 'info',
      },
      ajv: {
        customOptions: {
          allErrors: true,
          removeAdditional: strictValidation ? false : 'all',
          coerceTypes: true,
          useDefaults: true,
          strict: strictValidation,
          strictSchema: strictValidation,
          strictNumbers: strictValidation,
          strictTypes: strictValidation,
          strictTuples: strictValidation,
          strictRequired: strictValidation,
        },
        plugins: [ajvKeywords, ajvErrors],
      },
      http2: false,
      ...fastifyOptions,
    } as FastifyServerOptions);

    this.setupHooks();
  }

  async initialize(): Promise<void> {
    if (this.options.autoDocs) {
      await this.setupDocs();
    }

    this.registerRoutes();
    this.setErrorHandler();

    try {
      await this.app.listen({
        port: this.options.port,
        host: this.options.host,
      });

      console.log(
        `✅ ${this.options.name} started on http://${this.options.host}:${this.options.port}`,
      );
      console.log(
        `📚 Documentation: http://${this.options.host}:${this.options.port}/docs`,
      );
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private async setupDocs() {
    try {
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

  private setupHooks() {
    this.app.addHook('onRequest', async (request) => {
      request.log.info(`Request: ${request.method} ${request.url}`);
    });

    this.app.addHook('onError', async (request, reply, error) => {
      if (this.isSerializationError(error)) {
        const errorResponse = {
          error: 'Response validation failed',
          details: {
            type: 'response_validation',
            message: error.message,
            error,
          },
        };

        reply.status(500).send(errorResponse);
        return;
      }
    });
  }

  private isSerializationError(error: any): boolean {
    return (
      error.serialization ||
      (error.message && error.message.includes('is required!')) ||
      error.message?.includes('serialization')
    );
  }

  private registerRoutes() {
    for (const route of this.options.routes) {
      const fullPath = `${this.options.prefix}${route.path}`.replace(
        /\/\//g,
        '/',
      );

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

      this.app.route({
        method: route.method,
        url: fullPath,
        schema: routeSchema,
        handler: async (request: FastifyRequest, reply: FastifyReply) => {
          try {
            const result = await route.handler({
              body: request.body,
              params: request.params,
              query: request.query,
              headers: request.headers,
              request,
            });

            const statusCode = this.getStatusCode(route.method, result);
            return reply.status(statusCode).send(result);
          } catch (error: any) {
            this.handleError(error, request, reply);
          }
        },
      });
    }
  }

  private getStatusCode(method: string, result?: any): number {
    if (method === 'POST' && result !== undefined) return 201;
    if (method === 'DELETE') return 204;
    return 200;
  }

  private handleError(
    error: any,
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    request.log.error('Handler error:', error);

    let statusCode = 500;
    let message = 'Internal server error';
    let details: any = undefined;

    if (error.statusCode) {
      statusCode = error.statusCode;
      message = error.message || message;
      details = error.details;
    } else if (error.code === '23505') {
      // PostgreSQL unique violation
      statusCode = 409;
      message = 'Resource already exists';
    }

    const errorResponse: any = {
      error: message,
    };

    if (details) {
      errorResponse.details = details;
    }

    if (process.env.NODE_ENV === 'development' && error.stack) {
      errorResponse.stack = error.stack;
    }

    return reply.status(statusCode).send(errorResponse);
  }

  private setErrorHandler() {
    this.app.setErrorHandler((error, request, reply) => {
      request.log.error('Global error handler:', error);

      if (error.validation) {
        const errorResponse = {
          error: 'Validation failed',
          details: {
            type: 'request_validation',
            errors: error.validation,
            message: error.message || 'Invalid request data',
          },
        };
        return reply.status(400).send(errorResponse);
      }

      this.handleError(error, request, reply);
    });
  }

  getApp(): FastifyInstance {
    return this.app;
  }

  async close(): Promise<void> {
    await this.app.close();
  }
}

export function createService(options: ServiceOptions): Service {
  return new Service(options);
}
