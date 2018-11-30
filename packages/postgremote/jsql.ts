import SqlString from 'sqlstring';

enum JSQLType {
  COLUMN,
  TABLE,
  FUNCTION
}

type TypeClass = { new (): {} };

type ColumnSettings<
  DataType extends TypeClass,
  DataDefaultable extends boolean | undefined,
  DataNullable extends boolean | undefined
> = {
  type: DataType;
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
  DataType extends TypeClass,
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
  DataType extends TypeClass,
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

type ColumnType<
  Column extends
    | ColumnFree<any, any, any, any>
    | ColumnLinked<any, any, any, any, any>
> = InstanceType<Column['columnSettings']['type']>;

type NullableColumnType<
  Column extends
    | ColumnFree<any, any, any, any>
    | ColumnLinked<any, any, any, any, any>
> = Column extends ColumnFree<any, any, any, true>
  ? null | ColumnType<Column>
  : Column extends ColumnLinked<any, any, any, any, true>
  ? null | ColumnType<Column>
  : ColumnType<Column>;

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
      NamedColumn<ColumnName, Columns>['columnSettings']['type'],
      NamedColumn<ColumnName, Columns>['columnSettings']['defaultable'],
      NamedColumn<ColumnName, Columns>['columnSettings']['nullable']
    >
    & {
      as<AliasName extends string>(
        aliasName: AliasName
      ): ColumnLinked<
        TableName,
        ColumnName,
        NamedColumn<ColumnName, Columns>['columnSettings']['type'],
        NamedColumn<ColumnName, Columns>['columnSettings']['defaultable'],
        NamedColumn<ColumnName, Columns>['columnSettings']['nullable'],
        AliasName
      >;
    }
  };

type StoredFunction<
  FunctionName extends string,
  Args extends ColumnFree<any, any, any, any>,
  Returns extends TypeClass
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

type NamedColumnType<
  ColumnName extends string,
  Columns extends ColumnFree<any, any, any, any>
> = ColumnType<NamedColumn<ColumnName, Columns>>;

// prettier-ignore
type PropertiesFromColumns<Args extends ColumnFree<any, any, any, any>> =
  & {
    [ArgName in NullableColumns<Args>['columnName']]+?:
      NamedColumnType<ArgName, Args>
  }
  & {
    [ArgName in DefaultableColumns<Args>['columnName']]+?:
      NamedColumnType<ArgName, Args>
  }
  & {
    [ArgName in RequiredColumns<
      Args,
      NullableColumns<Args> | DefaultableColumns<Args>
    >['columnName']]: NamedColumnType<ArgName, Args>
  };

type TableProperties<OfTable> = PropertiesFromColumns<UnpackedColumns<OfTable>>;

export enum QueryKind {
  SELECT,
  INSERT,
  EXECUTE
}

export type SelectKind =
  | ColumnAsterisk<any>
  | ColumnLinked<any, any, any, any, any>
  | ColumnLinked<any, any, any, any, any, any>;

export type FromKind = Table<any, any>;

export enum BinaryExpressionKind {
  EQUALITY = ' = '
}

export type BinaryExpressionEquality<Left, Right> = {
  kind: BinaryExpressionKind.EQUALITY;
  left: Left;
  right: Right;
};

export type WhereKind = BinaryExpressionEquality<any, any>;

export interface Select<
  Params extends SelectKind,
  From extends FromKind,
  Where extends WhereKind
> {
  kind: QueryKind.SELECT;
  select: Params[];
  from: From[];
  where?: Where;
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

export type Query = Select<any, any, any> | Insert<any> | Execute;

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

const isColumnLinked = (
  value: any
): value is ColumnLinked<any, any, any, any, any> =>
  value && value.$ === JSQLType.COLUMN && value.kind === ColumnKind.LINKED;

const traverseExpressionTree = (tree: WhereKind, variableIndex = 1) => {
  const values: any[] = [];
  return {
    clause: [tree.left, tree.right]
      .map(branch => {
        if (isColumnLinked(branch)) {
          return escapeId(
            `${branch.tableName}.${branch.aliasName || branch.columnName}`
          );
        }
        values.push(branch);
        return `$${variableIndex++}`;
      })
      .join(tree.kind),
    values
  };
};

const jsqlCompileSelect = (query: Select<SelectKind, FromKind, WhereKind>) => {
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

  let values: any[] = [];
  let whereExpression = '';
  if (query.where) {
    const result = traverseExpressionTree(query.where);
    values = result.values;
    whereExpression = ` where ${result.clause}`;
  }

  return {
    text: `select ${selectExpression} from ${fromExpression}${whereExpression}`,
    values
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

      for (const [key, value] of Object.entries(query.values)) {
        if (!columnNames.includes(key)) {
          throw new JSQLError(
            `Table ${query.into.$$} does not have column with name ${key}`
          );
        }
        columns.push(escapeId(key));
        placeholders.push(`$${++placeholderNumber}`);
        values.push(value);
      }

      return {
        text: `insert into ${escapeId(query.into.$$)} (${columns.join(
          ', '
        )}) values (${placeholders.join(', ')})`,
        values
      };
  }
};

const jsqlCompileExecute = (query: Execute) => {
  switch (query.executeKind) {
    case ExecuteKind.FUNCTION:
      return {
        text: `select ${escapeId(query.functionName)}(${query.functionArgs
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
  Columns extends ColumnFree<any, any, any, any>
>(
  tableName: TableName,
  columns: Columns[]
): Table<TableName, Columns> => {
  const result = { $: JSQLType.TABLE } as Table<TableName, Columns>;

  result['$$'] = tableName;

  result['*'] = {
    $: JSQLType.COLUMN,
    kind: ColumnKind.ASTERISK,
    tableName: tableName
  };

  for (const column of columns) {
    const columnLinked: ColumnLinked<
      TableName,
      Columns['columnName'],
      Columns['columnSettings']['type'],
      Columns['columnSettings']['defaultable'],
      Columns['columnSettings']['nullable']
    > = {
      $: JSQLType.COLUMN,
      kind: ColumnKind.LINKED,
      tableName: tableName,
      columnName: column.columnName,
      columnSettings: column.columnSettings
    };
    Object.defineProperty(result, column.columnName, {
      value: columnLinked,
      writable: false,
      enumerable: true,
      configurable: false
    });
  }

  return result;
};

jsql.as = <
  Column extends ColumnLinked<any, any, any, any, any, any>,
  Alias extends string
>(
  columnLinked: Column,
  aliasName: Alias
): ColumnLinked<
  Column['tableName'],
  Column['columnName'],
  Column['columnSettings']['type'],
  Column['columnSettings']['defaultable'],
  Column['columnSettings']['nullable'],
  Alias
> => ({
  ...columnLinked,
  aliasName
});

jsql.column = <
  ColumnName extends string,
  DataType extends TypeClass,
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
  Returns extends TypeClass
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

jsql.equalTo = <Column extends ColumnLinked<any, any, any, any, any>>(
  column: Column,
  value: NullableColumnType<Column>
): BinaryExpressionEquality<Column, NullableColumnType<Column>> => ({
  kind: BinaryExpressionKind.EQUALITY,
  left: column,
  right: value
});

jsql.select = <
  Params extends SelectKind,
  From extends FromKind,
  Where extends WhereKind
>(
  params: Params[],
  clause: {
    from: From[];
    where?: Where;
  }
) =>
  new class SelectGenerator extends QueryGenerator<
    Select<Params, From, Where>
  > {
    toJSQL(): Select<Params, From, Where> {
      if (!clause || !clause.from) {
        throw new JSQLError(
          `You should setup from where you want to do select`
        );
      }

      return {
        kind: QueryKind.SELECT,
        select: params,
        from: clause.from,
        where: clause.where
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
