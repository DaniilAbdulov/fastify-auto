import {FastifyReply} from 'fastify';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
}

export class Responder {
  success<T>(reply: FastifyReply, data: T, statusCode = 200): FastifyReply {
    const response: ApiResponse<T> = {
      success: true,
      data,
    };

    // Для DELETE 204 не отправляем тело
    if (statusCode === 204) {
      return reply.status(statusCode).send();
    }

    return reply.status(statusCode).send(response);
  }

  error(reply: FastifyReply, error: any): FastifyReply {
    let statusCode = 500;
    let message = 'Internal server error';
    let details: any = undefined;

    // Обработка стандартных ошибок
    if (error.validation) {
      statusCode = 400;
      message = 'Validation failed';
      details = error.validation;
    } else if (error.statusCode) {
      statusCode = error.statusCode;
      message = error.message || message;
      details = error.details;
    } else if (error.code === '23505') {
      // PostgreSQL unique violation
      statusCode = 409;
      message = 'Resource already exists';
    }

    const response = {
      success: false,
      error: message,
      details: process.env.NODE_ENV === 'development' ? details : undefined,
    };

    return reply.status(statusCode).send(response);
  }
}
