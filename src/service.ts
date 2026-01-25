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
      logger: true,
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
            const responseSchema = route.schema?.response?.[statusCode];

            // Проверяем валидность ответа если есть схема
            if (responseSchema) {
              try {
                // Валидируем ответ
                if (!this.app.validatorCompiler) {
                  throw new Error('Validator compiler not initialized');
                }

                const validator = this.app.validatorCompiler({
                  schema: responseSchema,
                  method: '',
                  url: '',
                });

                const validationResult = validator(result);

                if (validationResult === true) {
                  // Ответ валиден - отправляем
                  return reply.status(statusCode).send(result);
                } else {
                  // Ответ невалиден
                  const validationError = new Error(
                    'Response validation failed',
                  );
                  (validationError as any).validation = validator.errors;
                  throw validationError;
                }
              } catch (validationError: any) {
                return this.handleSerializationError(validationError, reply);
              }
            } else {
              return reply.status(statusCode).send(result);
            }
          } catch (error: any) {
            this.handleError(error, request, reply);
          }
        },
      });
    }
  }

  private handleSerializationError(error: any, reply: FastifyReply) {
    let errorResponse: any;

    if (error.message && error.message.includes('is required!')) {
      const match = error.message.match(/"([^"]+)" is required!/);
      const fieldName = match ? match[1] : 'field';

      errorResponse = {
        error: 'Response Validation Error',
        reason: `Field "${fieldName}" is required in response`,
        details: {
          type: 'missing_field',
          field: fieldName,
          message: error.message,
        },
      };
    } else if (error.validation) {
      const firstError = error.validation[0];
      const field = firstError.instancePath?.replace('/', '') || 'field';

      errorResponse = {
        error: 'Response Validation Error',
        reason: `${field}: ${firstError.message}`,
        details: {
          type: 'response_validation',
          errors: error.validation,
        },
      };
    } else {
      errorResponse = {
        error: 'Serialization Error',
        reason: error.message || 'Failed to serialize response',
      };
    }

    return reply.status(422).send(errorResponse);
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
    let statusCode = 500;
    let errorResponse: any;

    if (error.message && error.message.includes('is required!')) {
      statusCode = 422;
      const match = error.message.match(/"([^"]+)" is required!/);
      const fieldName = match ? match[1] : 'field';

      errorResponse = {
        error: 'Validation Error',
        reason: `Field "${fieldName}" is required`,
        details: {
          type: 'missing_field',
          field: fieldName,
        },
      };
    } else if (error.validation) {
      statusCode = 400;
      const firstError = error.validation[0];
      const field = firstError.instancePath?.replace('/', '') || 'field';

      errorResponse = {
        error: 'Validation Error',
        reason: `${field}: ${firstError.message}`,
        details: {
          type: 'validation',
          errors: error.validation,
        },
      };
    } else if (error.statusCode) {
      statusCode = error.statusCode;
      errorResponse = {
        error: error.name || 'Error',
        reason: error.message,
        ...(error.details && {details: error.details}),
      };
    } else {
      errorResponse = {
        error: 'Internal Server Error',
        reason: error.message || 'Something went wrong',
      };
    }

    if (process.env.NODE_ENV === 'development' && error.stack) {
      errorResponse.stack = error.stack;
    }

    return reply.status(statusCode).send(errorResponse);
  }

  private setErrorHandler() {
    this.app.setErrorHandler((error, request, reply) => {
      if (error.validation) {
        const firstError = error.validation[0];
        const field = firstError.instancePath?.replace('/', '') || 'field';

        const errorResponse = {
          error: 'Validation Error',
          reason: `${field}: ${firstError.message}`,
          details: {
            type: 'request_validation',
            errors: error.validation,
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
