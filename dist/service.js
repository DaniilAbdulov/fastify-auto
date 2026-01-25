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
const factory_1 = require("./extensions/factory");
class Service {
    app;
    options;
    constructor(options) {
        const { name, routes, port = 3000, host = '0.0.0.0', prefix = '/api', fastifyOptions = {}, autoDocs = true, strictValidation = true, dbConnection, } = options;
        this.options = {
            name,
            routes,
            port,
            host,
            prefix,
            fastifyOptions,
            autoDocs,
            strictValidation,
            dbConnection,
        };
        this.app = (0, fastify_1.default)({
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
                plugins: [ajv_keywords_1.default, ajv_errors_1.default],
            },
            http2: false,
            ...fastifyOptions,
        });
    }
    async initialize() {
        if (this.options.autoDocs) {
            await this.setupDocs();
        }
        const extensions = await (0, factory_1.createExtensions)(this.options);
        this.registerRoutes(extensions);
        this.setErrorHandler();
        try {
            await this.app.listen({
                port: this.options.port,
                host: this.options.host,
            });
            console.log(`✅ ${this.options.name} started on http://${this.options.host}:${this.options.port}`);
            console.log(`📚 Documentation: http://${this.options.host}:${this.options.port}/docs`);
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
    registerRoutes(extensions) {
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
                        }, extensions);
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
                                    method: route.method,
                                    url: fullPath,
                                });
                                const validationResult = validator(result);
                                if (validationResult === true) {
                                    // Ответ валиден - отправляем
                                    return reply.status(statusCode).send(result);
                                }
                                else {
                                    // Ответ невалиден
                                    const validationError = new Error('Response validation failed');
                                    validationError.validation = validator.errors;
                                    throw validationError;
                                }
                            }
                            catch (validationError) {
                                return this.handleSerializationError(validationError, reply);
                            }
                        }
                        else {
                            return reply.status(statusCode).send(result);
                        }
                    }
                    catch (error) {
                        this.handleError(error, request, reply);
                    }
                },
            });
        }
    }
    handleSerializationError(error, reply) {
        let errorResponse;
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
        }
        else if (error.validation) {
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
        }
        else {
            errorResponse = {
                error: 'Serialization Error',
                reason: error.message || 'Failed to serialize response',
            };
        }
        return reply.status(422).send(errorResponse);
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
        let errorResponse;
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
        }
        else if (error.validation) {
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
        }
        else if (error.statusCode) {
            statusCode = error.statusCode;
            errorResponse = {
                error: error.name || 'Error',
                reason: error.message,
                ...(error.details && { details: error.details }),
            };
        }
        else {
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
    setErrorHandler() {
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