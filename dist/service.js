"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createService = exports.Service = void 0;
const fastify_1 = __importDefault(require("fastify"));
const ajv_keywords_1 = __importDefault(require("ajv-keywords"));
const ajv_errors_1 = __importDefault(require("ajv-errors"));
class Service {
    app;
    options;
    constructor(options) {
        this.options = {
            port: 3000,
            host: '0.0.0.0',
            prefix: '/api',
            autoDocs: true,
            ...options,
        };
        this.app = (0, fastify_1.default)({
            logger: true,
            ajv: {
                customOptions: {
                    allErrors: true, // Показывать все ошибки
                    removeAdditional: false, // НЕ удалять дополнительные поля ← ИЗМЕНИЛИ
                    coerceTypes: true,
                    useDefaults: false, // Не использовать значения по умолчанию
                    strict: true, // Строгая валидация
                    strictSchema: true, // Строгая валидация схемы
                    strictNumbers: true, // Строгая валидация чисел
                    strictTypes: true, // Строгая проверка типов
                    strictTuples: true, // Строгая проверка кортежей
                    strictRequired: true, // Строгая проверка обязательных полей
                },
                plugins: [ajv_keywords_1.default, ajv_errors_1.default],
            },
            http2: false,
            ...this.options.fastifyOptions,
        });
    }
    async initialize() {
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
            console.log(`✅ ${this.options.name} started on http://${this.options.host}:${this.options.port}`);
        }
        catch (error) {
            console.error('Failed to start server:', error);
            process.exit(1);
        }
    }
    async setupDocs() {
        try {
            const swagger = await Promise.resolve().then(() => __importStar(require('@fastify/swagger')));
            const swaggerUi = await Promise.resolve().then(() => __importStar(require('@fastify/swagger-ui')));
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
        }
        catch (error) {
            console.warn('Swagger dependencies not found. Docs disabled.');
        }
    }
    registerRoutes() {
        for (const route of this.options.routes) {
            const fullPath = `${this.options.prefix}${route.path}`.replace(/\/\//g, '/');
            const routeSchema = {
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
                handler: async (request, reply) => {
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
                    }
                    catch (error) {
                        this.handleError(error, request, reply);
                    }
                },
            });
        }
    }
    getStatusCode(method, result) {
        if (method === 'POST' && result !== undefined)
            return 201;
        if (method === 'DELETE')
            return 204;
        return 200;
    }
    handleError(error, request, reply) {
        let statusCode = 500;
        let message = 'Internal server error';
        let details = undefined;
        if (error.statusCode) {
            statusCode = error.statusCode;
            message = error.message || message;
            details = error.details;
        }
        else if (error.code === '23505') {
            // PostgreSQL unique violation
            statusCode = 409;
            message = 'Resource already exists';
        }
        const errorResponse = {
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
    setErrorHandler() {
        this.app.setErrorHandler((error, request, reply) => {
            request.log.error(error);
            if (error.validation) {
                const errorResponse = {
                    error: 'Validation failed',
                    details: {
                        type: 'validation',
                        errors: error.validation,
                        message: error.message,
                    },
                };
                return reply.status(400).send(errorResponse);
            }
            this.handleError(error, request, reply);
        });
    }
    getApp() {
        return this.app;
    }
    async close() {
        await this.app.close();
    }
}
exports.Service = Service;
function createService(options) {
    return new Service(options);
}
exports.createService = createService;
//# sourceMappingURL=service.js.map