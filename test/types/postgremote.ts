import { exec } from 'postgremote/client';
import { jsql } from 'postgremote/jsql';

(async () => {
  const MyTable1 = jsql.table('MyTable1', [
    jsql.column('c1', { type: String }),
    jsql.column('c2', { type: Number })
  ]);
  const MyTable2 = jsql.table('MyTable2', [
    jsql.column('d1', { type: Boolean }),
    jsql.column('d2', { type: String })
  ]);

  for (const row of await exec(
    jsql.select([MyTable1.c1], { from: [MyTable1] })
  )) {
    // $ExpectType String
    row.c1;

    // $ExpectError
    row.c2;
    // $ExpectError
    row.thereIsNoSuchAColumnHere;
  }

  for (const row of await exec(
    jsql.select([MyTable1.c1, MyTable1.c2], { from: [MyTable1] })
  )) {
    // $ExpectType String
    row.c1;
    // $ExpectType Number
    row.c2;

    // $ExpectError
    row.thereIsNoSuchAColumnHere;
  }

  for (const row of await exec(
    jsql.select([MyTable1['*'], jsql.as(MyTable1.c1, 'c3')], {
      from: [MyTable1]
    })
  )) {
    // $ExpectType String
    row.c1;
    // $ExpectType Number
    row.c2;
    // $ExpectType String
    row.c3;

    // $ExpectError
    row.thereIsNoSuchAColumnHere;
  }

  for (const row of await exec(
    jsql.select([MyTable1['*'], MyTable2['*']], { from: [MyTable1, MyTable2] })
  )) {
    // $ExpectType String
    row.c1;
    // $ExpectType Number
    row.c2;
    // $ExpectType Boolean
    row.d1;
    // $ExpectType String
    row.d2;
  }
})();
