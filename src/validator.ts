import {FastifyRequest} from 'fastify';

export class Validator {
  validateRequest(request: FastifyRequest, schema?: any) {
    const result: any = {};

    // Fastify уже проверил данные, мы просто их извлекаем
    if (schema?.body && request.body) {
      result.body = request.body;
    }

    if (schema?.params && request.params) {
      result.params = request.params;
    }

    if (schema?.query && request.query) {
      result.query = request.query;
    }

    if (schema?.headers && request.headers) {
      result.headers = request.headers;
    }

    return result;
  }

  validateResponse(data: any, responseSchema?: any) {
    // Если не указана схема ответа, возвращаем как есть
    if (!responseSchema) {
      return data;
    }

    // Валидация происходит на уровне Fastify через schema.response
    // Мы просто возвращаем данные
    return data;
  }

  // Хелпер для создания схем
  static objectSchema(properties: Record<string, any>, required?: string[]) {
    return {
      type: 'object',
      properties,
      required: required || Object.keys(properties),
    };
  }

  static arraySchema(items: any) {
    return {
      type: 'array',
      items,
    };
  }
}
