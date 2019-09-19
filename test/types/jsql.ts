import { jsql } from 'postgremote/jsql';

/**
 * Insert tests
 */

const TestTable0 = jsql.table('TestTable', [
  jsql.column('isNullable', Boolean, false, true),
  jsql.column('withDefault', Number, true, false),
  jsql.column('withDefaultAndNullable', String, true, true),
  jsql.column('required', String)
]);

// $ExpectError
jsql.insert(TestTable0, {});

// $ExpectError
jsql.insert(TestTable0, { isNullable: false });

jsql.insert(TestTable0, {
  required: 'this field is required'
});

jsql.insert(TestTable0, {
  isNullable: false,
  required: 'this field is required'
});

jsql.insert(TestTable0, {
  isNullable: false,
  withDefault: 20,
  required: 'this field is required'
});

jsql.insert(TestTable0, {
  isNullable: false,
  withDefault: 20,
  withDefaultAndNullable: 'should work',
  required: 'this field is required'
});

/**
 * Function calls
 */
const noArgs = jsql.function('noArgs', [], Boolean);
const oneArgRequiredTwoOptional = jsql.function(
  'oneArg',
  [
    jsql.column('arg', String),
    jsql.column('nullable', Number, false, true),
    jsql.column('defaultable', Boolean, true, false)
  ],
  String
);

// $ExpectError
noArgs();

noArgs({});

// $ExpectError
oneArgRequiredTwoOptional({});

oneArgRequiredTwoOptional({ arg: 'string' });

oneArgRequiredTwoOptional({
  // $ExpectError
  arg: 1
});
oneArgRequiredTwoOptional({
  arg: '',
  // $ExpectError
  defaultable: 'string instead of boolean'
});
oneArgRequiredTwoOptional({
  arg: '',
  // $ExpectError
  nullable: 'string instead of number'
});

/**
 * Select tests
 */

const TableForSelect1 = jsql.table('TableForSelect1', [
  jsql.column('column1', { type: String }),
  jsql.column('column2', { type: Number, nullable: true }),
  jsql.column('column3', { type: String, nullable: true })
]);

jsql.select([TableForSelect1['*']], { from: [TableForSelect1] });
