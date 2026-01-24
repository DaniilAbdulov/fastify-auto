import { FastifyInstance, FastifyRequest, FastifyServerOptions, HTTPMethods } from 'fastify';
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
export declare class Service {
    private app;
    private options;
    constructor(options: ServiceOptions);
    initialize(): Promise<void>;
    private setupDocs;
    private registerRoutes;
    private getStatusCode;
    private handleError;
    private setErrorHandler;
    getApp(): FastifyInstance;
    close(): Promise<void>;
}
export declare function createService(options: ServiceOptions): Service;
//# sourceMappingURL=service.d.ts.map