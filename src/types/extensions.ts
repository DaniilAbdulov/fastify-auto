import {Knex} from 'knex';

export interface ServiceExtensions {
  pg: Knex;
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
