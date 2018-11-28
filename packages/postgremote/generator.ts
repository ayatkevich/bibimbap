import ts from 'typescript';
import prettier from 'prettier';
import { Client } from 'pg';

export async function generator(schemas: string[]) {
  const client = new Client({
    user: process.env.POSTGRES_USER,
    host: 'localhost',
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD
  });

  await client.connect();

  try {
    let resultFile = ts.createSourceFile(
      'someFileName.ts',
      '',
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS
    );

    const printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed
    });

    const { rows: tables } = await client.query(
      `select
          "Table"."tableName",
          "Table"."schemaName",
          json_agg("Columns".*) as "columns"
        from
          (select
            "Class".oid as "tableId",
            "Namespace".oid as "schemaId",
            "Class".relname as "tableName",
            "Namespace".nspname as "schemaName"
          from pg_namespace as "Namespace"
            left join pg_class as "Class"
              on "Class".relnamespace = "Namespace".oid
          where "Namespace".nspname = any($1::name[])
            and "Class".relkind in ('r', 'v', 'm', 'p', 'f')) as "Table"
          left join lateral (
            select
              attname as "columnName",
              atthasdef as "hasDefaultValue",
              attnotnull as "notNull"
            from pg_attribute
            where attrelid = "Table"."tableId"
              and attnum > 0
          ) as "Columns" on true
        group by
          "Table"."tableName",
          "Table"."schemaName"`,
      [schemas]
    );

    const { rows: functions } = await client.query(
      `select
          "Function".proname as "functionName",
          "Function".prokind as "functionKind",
          "Namespace".nspname as "schemaName"
        from pg_namespace as "Namespace"
          left join pg_proc as "Function"
            on "Function".pronamespace = "Namespace".oid
        where "Namespace".nspname = any($1::name[])
          and "Function".prokind in ('f', 'p')`,
      [schemas]
    );

    resultFile = ts.updateSourceFileNode(
      resultFile,
      ts.setTextRange(
        ts.createNodeArray([
          ts.createImportDeclaration(
            undefined,
            undefined,
            ts.createImportClause(
              undefined,
              ts.createNamedImports([
                ts.createImportSpecifier(undefined, ts.createIdentifier('jsql'))
              ])
            ),
            ts.createLiteral('postgremote/jsql')
          ),
          ...tables.map(table =>
            prepareTable(table, table.columns.map(prepareColumn))
          ),
          ...functions.map(prepareFunction)
        ]),
        resultFile.statements
      )
    );

    return prettier.format(printer.printFile(resultFile), {
      singleQuote: true,
      parser: 'typescript'
    });
  } catch (error) {
    await client.end();
    throw error;
  }
}

function prepareFunction(func: { functionName: string; schemaName: string }) {
  return ts.createVariableStatement(
    [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.createVariableDeclarationList(
      [
        ts.createVariableDeclaration(
          func.functionName,
          undefined,
          ts.createCall(
            ts.createPropertyAccess(ts.createIdentifier('jsql'), 'function'),
            undefined,
            [
              ts.createLiteral(`${func.schemaName}.${func.functionName}`),
              ts.createArrayLiteral(),
              ts.createIdentifier('Boolean')
            ]
          )
        )
      ],
      ts.NodeFlags.Const
    )
  );
}

function prepareTable(
  table: {
    tableName: string;
    schemaName: string;
  },
  preparedColumns: ts.Expression[]
) {
  return ts.createVariableStatement(
    [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.createVariableDeclarationList(
      [
        ts.createVariableDeclaration(
          table.tableName,
          undefined,
          ts.createCall(
            ts.createPropertyAccess(ts.createIdentifier('jsql'), 'table'),
            undefined,
            [
              ts.createLiteral(`${table.schemaName}.${table.tableName}`),
              ts.createArrayLiteral(preparedColumns)
            ]
          )
        )
      ],
      ts.NodeFlags.Const
    )
  );
}

function prepareColumn(column: {
  columnName: string;
  notNull: boolean;
  hasDefaultValue: boolean;
}) {
  return ts.createCall(
    ts.createPropertyAccess(ts.createIdentifier('jsql'), 'column'),
    undefined,
    [
      ts.createLiteral(column.columnName),
      ts.createObjectLiteral([
        ts.createPropertyAssignment(
          ts.createIdentifier('type'),
          ts.createIdentifier('String')
        ),
        ts.createPropertyAssignment(
          ts.createIdentifier('nullable'),
          ts.createIdentifier(String(!column.notNull))
        ),
        ts.createPropertyAssignment(
          ts.createIdentifier('defaultable'),
          ts.createIdentifier(String(column.hasDefaultValue))
        )
      ])
    ]
  );
}
