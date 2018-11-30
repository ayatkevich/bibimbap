import { Pool } from 'pg';
import request from 'superagent';
import {
  ColumnAsterisk,
  ColumnFree,
  ColumnLinked,
  Query as JSQLQuery,
  QueryGenerator,
  Select,
  Table
} from './jsql';
import { PostgremoteError } from './server';

export let databaseConnectionPool: Pool | undefined;
export let serverEndpoint: string | undefined;

export function config(poolOrEndpoint: Pool | string) {
  databaseConnectionPool = undefined;
  serverEndpoint = undefined;
  if (typeof poolOrEndpoint === 'object') {
    databaseConnectionPool = poolOrEndpoint;
  } else if (typeof poolOrEndpoint === 'string') {
    serverEndpoint = poolOrEndpoint;
  }
}

// prettier-ignore
type ColumnName<Column extends unknown>
  = Column extends ColumnFree<infer Name, any, any, any> ? Name
  : Column extends ColumnLinked<any, infer Name, any, any, any> ? Name
  : Column extends ColumnLinked<any, any, any, any, any, infer Alias> ? Alias
  : never;

// prettier-ignore
type NamedColumn<
  Name extends string,
  Column extends unknown
> = Column extends ColumnFree<Name, any, any, any> ? Column
  : Column extends ColumnLinked<any, Name, any, any, any> ? Column
  : Column extends ColumnLinked<any, any, any, any, any, Name> ? Column
  : never;

type NamedTableColumns<
  Name extends string,
  From extends unknown
> = From extends Table<Name, infer Columns> ? Columns : never;

type AstersikColumns<
  Column extends unknown,
  From extends Table<any, any>
> = Column extends ColumnAsterisk<infer TableName>
  ? NamedTableColumns<TableName, From>
  : Column;

// prettier-ignore
type UnpackedColumns<Query extends JSQLQuery>
  = Query extends Select<infer Params, infer From, any>
    ? AstersikColumns<Params, From> : never;

type QueryResultType<Columns> = {
  [Key in ColumnName<Columns>]: InstanceType<
    NamedColumn<Key, Columns>['columnSettings']['type']
  >
};

export async function exec<Query extends JSQLQuery>(
  query: QueryGenerator<Query>
): Promise<QueryResultType<UnpackedColumns<Query>>[]> {
  if (databaseConnectionPool) {
    const client = await databaseConnectionPool.connect();
    try {
      const { rows } = await client.query(query.toQueryObject());
      return rows as QueryResultType<UnpackedColumns<Query>>[];
    } finally {
      client.release();
    }
  } else if (serverEndpoint) {
    const { body } = await request.post(serverEndpoint).send(query.toJSQL());
    return body as QueryResultType<UnpackedColumns<Query>>[];
  }
  throw new PostgremoteError(
    'Exec should be provided with either pool or endpoint'
  );
}
