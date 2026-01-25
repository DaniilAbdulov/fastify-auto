import {knex} from 'knex';
import {ServiceExtensions} from '../types/extensions';

export async function createExtensions(
  config: any,
): Promise<ServiceExtensions> {
  const extensions: Partial<ServiceExtensions> = {};

  if (config.extensions?.pg && config.dbConnection) {
    extensions.pg = knex(config.dbConnection);

    try {
      await extensions.pg.raw('SELECT 1');
      console.log('✅ PostgreSQL connected successfully');
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error);
      throw error;
    }
  }

  return extensions as ServiceExtensions;
}
