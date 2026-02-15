import {knex} from 'knex';
import {ServiceExtensions} from '../types/extensions';

export async function createExtensions(
  config: any,
): Promise<ServiceExtensions> {
  const extensions: Partial<ServiceExtensions> = {};

  console.log(`create DB Extension`, config.dbConnection);

  if (config.dbConnection) {
    extensions.pg = knex(config.dbConnection);
  }

  return extensions as ServiceExtensions;
}
