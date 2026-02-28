import {Knex} from 'knex';
import {Events} from '../Events/Events';

export interface ServiceExtensions {
  pg: Knex;
  events: Events;
}

export interface ServiceConfig {
  name: string;
  port: number;
  prefix: string;
  routes: any[];
  autoDocs: boolean;
  extensions?: {
    pg?: boolean;
    redis?: boolean;
  };
  dbConnection?: any;
  redisConnection?: any;
}
