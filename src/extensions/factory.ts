import {knex} from 'knex';
import {ServiceExtensions} from '../types/extensions';
import {Events} from '../Events/Events';

export async function createExtensions(
  config: any,
): Promise<ServiceExtensions> {
  const extensions: Partial<ServiceExtensions> = {};

  console.log(`Create DB Extension`, config.dbConnection);

  if (config.dbConnection) {
    extensions.pg = knex(config.dbConnection);
  }

  // Добавляем инициализацию Events
  if (config.events) {
    extensions.events = new Events(config.events);
    await extensions.events.connect(); // подключаемся к Redis

    console.log('✅ Events extension initialized');
  }

  return extensions as ServiceExtensions;
}
