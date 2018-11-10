import { Pool } from 'pg';
import {
  Query as JSQLQuery,
  QueryGenerator,
  Select,
  ColumnLinked,
  ColumnAsterisk,
  Table,
  ColumnFree
} from './jsql';

export let databaseConnectionPool: Pool;

export function config(pool: Pool) {
  databaseConnectionPool = pool;
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
  = Query extends Select<infer Params, infer From>
    ? AstersikColumns<Params, From> : never;

type QueryResultType<Columns> = {
  [Key in ColumnName<Columns>]: ReturnType<
    NamedColumn<Key, Columns>['columnSettings']['type']
  >
};

export async function exec<Query extends JSQLQuery>(
  query: QueryGenerator<Query>
): Promise<QueryResultType<UnpackedColumns<Query>>[]> {
  const client = await databaseConnectionPool.connect();
  try {
    const { rows } = await client.query(query.toQueryObject());
    return rows as QueryResultType<UnpackedColumns<Query>>[];
  } finally {
    client.release();
  }
}
