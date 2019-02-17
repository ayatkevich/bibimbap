import { jsql } from 'postgremote/jsql';

/**
 * Insert tests
 */

const TestTable0 = jsql.table('TestTable', [
  jsql.column('isNullable', { type: Boolean, nullable: true }),
  jsql.column('withDefault', {
    type: Number,
    defaultable: true
  }),
  jsql.column('withDefaultAndNullable', {
    type: String,
    defaultable: true,
    nullable: true
  }),
  jsql.column('required', { type: String })
]);

// $ExpectError
jsql.insert(TestTable0, {
  // here should be a required column, because it neither have default value
  // nor can have a null as a value
});

// $ExpectError
jsql.insert(TestTable0, {
  // the same, should be required column
  isNullable: false
});

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
    jsql.column('arg', { type: String }),
    jsql.column('nullable', { type: Number, nullable: true }),
    jsql.column('defaultable', { type: Boolean, defaultable: true })
  ],
  String
);

// $ExpectError
noArgs();

noArgs({});

// $ExpectError
oneArgRequiredTwoOptional({});

oneArgRequiredTwoOptional({ arg: 'string' });

// $ExpectError
oneArgRequiredTwoOptional({ arg: 1 });
oneArgRequiredTwoOptional({
  arg: '',
  // $ExpectError
  defaultable: 'string instead of boolean'
});
// $ExpectError
oneArgRequiredTwoOptional({ arg: '', nullable: 'string instead of number' });

/**
 * Select tests
 */

const TableForSelect1 = jsql.table('TableForSelect1', [
  jsql.column('column1', { type: String }),
  jsql.column('column2', { type: Number, nullable: true }),
  jsql.column('column3', { type: String, nullable: true })
]);

jsql.select([TableForSelect1['*']], { from: [TableForSelect1] });