import { jsql } from 'postgremote/jsql';

/**
 * Table and column tests
 */

// default values types
jsql.table('TestTable', [
  // type of string but default value is boolean
  jsql.column('testColumn1', { type: String, defaultValue: true }),
  // type of number but default value is string
  jsql.column('testColumn2', { type: Number, defaultValue: '2' }),
  // type of boolean but default value is number
  jsql.column('testColumn3', { type: Boolean, defaultValue: 0 })
]);

/**
 * Insert tests
 */

const TestTable0 = jsql.table('TestTable', [
  jsql.column('isNullable', { type: Boolean, nullable: true }),
  jsql.column('withDefault', {
    type: Number,
    defaultValue: 2,
    defaultable: true
  }),
  jsql.column('withDefaultAndNullable', {
    type: String,
    defaultValue: 'string',
    defaultable: true,
    nullable: true
  }),
  jsql.column('required', { type: String })
]);

jsql.insert(TestTable0, {
  // here should be a required column, because it neither have default value
  // nor can have a null as a value
});

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
 * Grant/Revoke tests
 */
const TableName1 = jsql.table('TableName', [
  jsql.column('columnName', { type: String })
]);
const RoleName1 = jsql.role('RoleName');

// these are wrong grant/revoke queries
jsql.grant(jsql.select, { on: TableName1, from: RoleName1 });
jsql.revoke(jsql.select, { on: TableName1, to: RoleName1 });

// here should be an error, because we pass an anonymous function instead of
// one of the privelege kinds
jsql.grant(() => {}, { on: TableName1, to: RoleName1 });

jsql.grant(jsql.select, { on: TableName1, to: RoleName1 });
jsql.grant(jsql.insert, { on: TableName1, to: RoleName1 });

// here should be an error, because we pass an anonymous function instead of
// one of the privelege kinds
jsql.revoke(() => {}, { on: TableName1, from: RoleName1 });

jsql.revoke(jsql.select, { on: TableName1, from: RoleName1 });
jsql.revoke(jsql.insert, { on: TableName1, from: RoleName1 });