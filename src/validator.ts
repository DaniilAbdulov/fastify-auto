export class Validator {
  // Fastify сам валидирует по схеме, нам ничего не нужно делать
  static create() {
    return new Validator();
  }
}
