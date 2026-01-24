import {FastifyRequest} from 'fastify';

export class Validator {
  validateRequest(request: FastifyRequest, schema?: any) {
    // Fastify уже автоматически валидирует по схеме
    // Мы просто возвращаем данные в удобном формате
    return {
      body: schema?.body ? (request.body as any) : undefined,
      params: schema?.params ? (request.params as any) : undefined,
      query: schema?.query ? (request.query as any) : undefined,
      headers: schema?.headers ? (request.headers as any) : undefined,
    };
  }

  validateResponse(data: any, responseSchema?: any): any {
    // Fastify автоматически валидирует ответы по схеме response
    return data;
  }
}
