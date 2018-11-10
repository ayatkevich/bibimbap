import SqlString from 'sqlstring';

enum JSQLType {
  COLUMN,
  TABLE,
  FUNCTION
}

type ColumnSettings<
  DataType extends (...args: any[]) => any,
  DataDefaultable extends boolean | undefined,
  DataNullable extends boolean | undefined
> = {
  type: DataType;
  defaultValue?: ReturnType<DataType>;
  nullable?: DataNullable;
  defaultable?: DataDefaultable;
};

enum ColumnKind {
  LINKED,
  FREE,
  ASTERISK
}
export type ColumnFree<
  ColumnName extends string,
  DataType extends (...args: any[]) => any,
  DataDefaultable extends boolean | undefined,
  DataNullable extends boolean | undefined
> = {
  $: JSQLType.COLUMN;
  kind: ColumnKind.FREE;
  columnName: ColumnName;
  columnSettings: ColumnSettings<DataType, DataDefaultable, DataNullable>;
};

export type ColumnLinked<
  TableName extends string,
  ColumnName extends string,
  DataType extends (...args: any[]) => any,
  DataDefaultable extends boolean | undefined,
  DataNullable extends boolean | undefined,
  AliasName extends string = ''
> = {
  $: JSQLType.COLUMN;
  kind: ColumnKind.LINKED;
  tableName: TableName;
  columnName: ColumnName;
  aliasName?: AliasName;
  columnSettings: ColumnSettings<DataType, DataDefaultable, DataNullable>;
};

export type ColumnAsterisk<TableName extends string> = {
  $: JSQLType.COLUMN;
  kind: ColumnKind.ASTERISK;
  tableName: TableName;
};

// prettier-ignore
export type Table<
  TableName extends string,
  Columns extends ColumnFree<any, any, any, any>
> =
  & {
    $: JSQLType.TABLE;
    // table name does not user 'tableName' property to minimize possibility
    // of name intersection
    $$: TableName;
    ['*']: ColumnAsterisk<TableName>;
  }
  & {
    [ColumnName in Columns['columnName']]: ColumnLinked<
      TableName,
      ColumnName,
      Columns['columnSettings']['type'],
      Columns['columnSettings']['defaultValue'],
      Columns['columnSettings']['nullable']
    >
    & {
      as<AliasName extends string>(
        aliasName: AliasName
      ): ColumnLinked<
        TableName,
        ColumnName,
        Columns['columnSettings']['type'],
        Columns['columnSettings']['defaultValue'],
        Columns['columnSettings']['nullable'],
        AliasName
      >;
    }
  };

type StoredFunction<
  FunctionName extends string,
  Args extends ColumnFree<any, any, any, any>,
  Returns extends (...args: any[]) => any
> = {
  (args: PropertiesFromColumns<Args>): QueryGenerator<Execute>;
  functionName: FunctionName;
  functionArgs: Args[];
  functionReturnType: Returns;
};

type UnpackedColumns<OfTable> = OfTable extends Table<any, infer Columns>
  ? Columns
  : never;

type NullableColumns<
  UnpackedColumnsOfTable
> = UnpackedColumnsOfTable extends ColumnFree<any, any, any, true>
  ? UnpackedColumnsOfTable
  : never;

type DefaultableColumns<
  UnpackedColumnsOfTable
> = UnpackedColumnsOfTable extends ColumnFree<any, any, true, any>
  ? UnpackedColumnsOfTable
  : never;

type RequiredColumns<
  AllColumnsOfTable,
  NonrequiredColumnsOfTable
> = AllColumnsOfTable extends NonrequiredColumnsOfTable
  ? never
  : AllColumnsOfTable;

type NamedColumn<
  ColumnName extends string,
  Columns
> = Columns extends ColumnFree<ColumnName, any, any, any> ? Columns : never;

type ColumnType<
  ColumnName extends string,
  Columns extends ColumnFree<any, any, any, any>
> = ReturnType<NamedColumn<ColumnName, Columns>['columnSettings']['type']>;

// prettier-ignore
type PropertiesFromColumns<Args extends ColumnFree<any, any, any, any>> =
  & {
    [ArgName in NullableColumns<Args>['columnName']]+?:
      ColumnType<ArgName, Args>
  }
  & {
    [ArgName in DefaultableColumns<Args>['columnName']]+?:
      ColumnType<ArgName, Args>
  }
  & {
    [ArgName in RequiredColumns<
      Args,
      NullableColumns<Args> | DefaultableColumns<Args>
    >['columnName']]: ColumnType<ArgName, Args>
  };

type TableProperties<OfTable> = PropertiesFromColumns<UnpackedColumns<OfTable>>;

export type SelectKind =
  | ColumnAsterisk<any>
  | ColumnLinked<any, any, any, any, any>
  | ColumnLinked<any, any, any, any, any, any>;

export type FromKind = Table<any, any>;

export enum QueryKind {
  SELECT,
  INSERT,
  EXECUTE
}

export interface Select<Params extends SelectKind, From extends FromKind> {
  kind: QueryKind.SELECT;
  select: Params[];
  from: From[];
}

enum InsertKind {
  VALUES
}

interface InsertValues<Into> {
  kind: QueryKind.INSERT;
  insertType: InsertKind.VALUES;
  into: Into;
  values: TableProperties<Into>;
}

type Insert<Into> = InsertValues<Into>;

enum ExecuteKind {
  FUNCTION
}

interface ExecuteFunction {
  kind: QueryKind.EXECUTE;
  executeKind: ExecuteKind.FUNCTION;
  functionName: string;
  functionArgs: ColumnFree<any, any, any, any>[];
  args: { [key: string]: any };
}

type Execute = ExecuteFunction;

type QueryObject = {
  text: string;
  values: any[];
};

export type Query = Select<any, any> | Insert<any> | Execute;

export abstract class QueryGenerator<T extends Query> {
  abstract toJSQL(): T;

  toQueryObject() {
    return jsql(this.toJSQL());
  }
}

export class JSQLError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, JSQLError.prototype);
  }
}

export function escapeId(string: string): string {
  if (typeof string !== 'string') {
    throw new TypeError(
      'Function escapeId takes only values type of string as an argument'
    );
  }
  const forbiddenCharacters = Array.from(`'"&$%;`);
  if (
    forbiddenCharacters.some(forbidednCharacter =>
      string.includes(forbidednCharacter)
    )
  ) {
    throw new TypeError(
      `Characters ${forbiddenCharacters} are denied to use in query identifiers`
    );
  }
  return SqlString.escapeId(string).replace(/`/g, '"');
}

export function escape(string: string): string {
  if (typeof string !== 'string') {
    throw new TypeError(
      'Function escape takes only values type of string as an argument'
    );
  }
  return `E${SqlString.escape(string).replace(/(\$|\`)/g, '\\$1')}`;
}

function* extractTableColumns(
  table: Table<any, any>
): IterableIterator<ColumnLinked<any, any, any, any, any>> {
  for (const columnName of Object.getOwnPropertyNames(table)) {
    if (columnName === '*' || columnName === '$' || columnName === '$$') {
      continue;
    }
    yield table[columnName];
  }
}

const jsqlCompileSelect = (query: Select<SelectKind, FromKind>) => {
  if (!query.from) {
    throw new JSQLError(`FROM statement is required`);
  }

  const selectExpression = query.select
    .map(expression => {
      switch (expression.kind) {
        case ColumnKind.ASTERISK:
          return `${escapeId(expression.tableName)}.*`;

        case ColumnKind.LINKED:
          const partsOfExpressionToRender = [
            escapeId(`${expression.tableName}.${expression.columnName}`)
          ];
          if (expression.aliasName) {
            partsOfExpressionToRender.push(escapeId(expression.aliasName));
          }
          return partsOfExpressionToRender.join(' as ');
      }
    })
    .join(', ');

  const fromExpression = query.from
    .map(expression => {
      switch (expression.$) {
        case JSQLType.TABLE:
          return escapeId(expression.$$);
      }
    })
    .join(', ');

  return {
    text: `SELECT ${selectExpression} FROM ${fromExpression}`,
    values: []
  };
};

const jsqlCompileInsert = <Into extends Table<any, any>>(
  query: Insert<Into>
) => {
  switch (query.insertType) {
    case InsertKind.VALUES:
      const columns = [];
      const values = [];
      const placeholders = [];
      let placeholderNumber = 0;

      const columnNames = Array.from(extractTableColumns(query.into)).map(
        column => column.columnName
      );

      for (const key of Object.getOwnPropertyNames(query.values)) {
        if (!columnNames.includes(key)) {
          throw new JSQLError(
            `Table ${query.into.$$} does not have column with name ${key}`
          );
        }
        columns.push(escapeId(key));
        placeholders.push(`$${++placeholderNumber}`);
        values.push(query.values[key]);
      }

      return {
        text: `INSERT INTO ${escapeId(query.into.$$)} (${columns.join(
          ', '
        )}) VALUES (${placeholders.join(', ')})`,
        values
      };
  }
};

const jsqlCompileExecute = (query: Execute) => {
  switch (query.executeKind) {
    case ExecuteKind.FUNCTION:
      return {
        text: `SELECT ${escapeId(query.functionName)}(${query.functionArgs
          .map((_, i) => `$${i + 1}`)
          .join(', ')})`,
        values: query.functionArgs.map(functionArg =>
          query.args[functionArg.columnName]
            ? query.args[functionArg.columnName]
            : null
        )
      };
  }
};

export function jsql(query: Query): QueryObject {
  if (query) {
    switch (query.kind) {
      case QueryKind.SELECT:
        return jsqlCompileSelect(query);
      case QueryKind.INSERT:
        return jsqlCompileInsert(query);
      case QueryKind.EXECUTE:
        return jsqlCompileExecute(query);
    }
  }
  throw new JSQLError('JSQL cannot build query out of the provided object');
}

jsql.table = <
  TableName extends string,
  Column extends ColumnFree<any, any, any, any>
>(
  tableName: TableName,
  columns: Column[]
): Table<TableName, Column> => {
  const result = { $: JSQLType.TABLE } as Table<TableName, Column>;

  result['$$'] = tableName;

  result['*'] = {
    $: JSQLType.COLUMN,
    kind: ColumnKind.ASTERISK,
    tableName: tableName
  };

  for (const column of columns) {
    const columnLinked: ColumnLinked<
      TableName,
      Column['columnName'],
      Column['columnSettings']['type'],
      Column['columnSettings']['defaultValue'],
      Column['columnSettings']['nullable']
    > = {
      $: JSQLType.COLUMN,
      kind: ColumnKind.LINKED,
      tableName: tableName,
      columnName: column.columnName,
      columnSettings: column.columnSettings
    };
    result[column.columnName] = {
      ...columnLinked,

      as(aliasName) {
        return {
          ...columnLinked,
          aliasName
        };
      }
    };
  }

  return result;
};

jsql.column = <
  ColumnName extends string,
  DataType extends (...args: any[]) => any,
  DataDefaultable extends boolean | undefined,
  DataNullable extends boolean | undefined
>(
  columnName: ColumnName,
  columnSettings: ColumnSettings<DataType, DataDefaultable, DataNullable>
): ColumnFree<ColumnName, DataType, DataDefaultable, DataNullable> => ({
  $: JSQLType.COLUMN,
  kind: ColumnKind.FREE,
  columnName: columnName,
  columnSettings: columnSettings
});

jsql.function = <
  FunctionName extends string,
  Args extends ColumnFree<any, any, any, any>,
  Returns extends (...args: any[]) => any
>(
  functionName: FunctionName,
  functionArgs: Args[],
  returnType: Returns
): StoredFunction<FunctionName, Args, Returns> => {
  const executor = ((args: PropertiesFromColumns<Args>) =>
    new class ExecuteGenerator extends QueryGenerator<Execute> {
      toJSQL(): Execute {
        return {
          kind: QueryKind.EXECUTE,
          executeKind: ExecuteKind.FUNCTION,
          functionName,
          functionArgs,
          args
        };
      }
    }()) as StoredFunction<FunctionName, Args, Returns>;
  executor.functionName = functionName;
  executor.functionArgs = functionArgs;
  executor.functionReturnType = returnType;
  return executor;
};

jsql.select = <Params extends SelectKind, From extends FromKind>(
  params: Params[],
  clause: {
    from: From[];
  }
) =>
  new class SelectGenerator extends QueryGenerator<Select<Params, From>> {
    toJSQL(): Select<Params, From> {
      if (!clause || !clause.from) {
        throw new JSQLError(
          `You should setup from where you want to do select`
        );
      }

      return {
        kind: QueryKind.SELECT,
        select: params,
        from: clause.from
      };
    }
  }();

jsql.insert = <Into extends Table<any, any>>(
  table: Into,
  values: TableProperties<Into>
) =>
  new class InsertGenerator extends QueryGenerator<Insert<Into>> {
    toJSQL(): Insert<Into> {
      if (Object.getOwnPropertyNames(values).length === 0) {
        throw new JSQLError('You should pass at least one column');
      }

      return {
        kind: QueryKind.INSERT,
        insertType: InsertKind.VALUES,
        into: table,
        values
      };
    }
  }();
