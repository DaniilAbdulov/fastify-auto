"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExtensions = void 0;
const knex_1 = require("knex");
async function createExtensions(config) {
    const extensions = {};
    console.log(`create DB Extension`, config.dbConnection);
    if (config.dbConnection) {
        extensions.pg = (0, knex_1.knex)(config.dbConnection);
        // try {
        //   await extensions.pg.raw('SELECT 1');
        //   console.log('✅ PostgreSQL connected successfully');
        // } catch (error) {
        //   console.error('❌ PostgreSQL connection failed:', error);
        //   throw error;
        // }
    }
    return extensions;
}
exports.createExtensions = createExtensions;
//# sourceMappingURL=factory.js.map