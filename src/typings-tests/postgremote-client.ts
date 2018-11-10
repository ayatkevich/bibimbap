import { exec } from 'postgremote/client';
import { jsql } from 'postgremote/jsql';

(async () => {
  const MyTable = jsql.table('MyTable', [
    jsql.column('c1', { type: String }),
    jsql.column('c2', { type: String })
  ]);

  for (const row of await exec(jsql.select([MyTable.c1], { from: MyTable }))) {
    row.c1;

    // here should be error
    row.c2;
    // here should be error
    row.thereIsNoSuchAColumnHere;
  }

  for (const row of await exec(
    jsql.select([MyTable.c1, MyTable.c2], { from: MyTable })
  )) {
    row.c1;
    row.c2;

    // here should be error
    row.thereIsNoSuchAColumnHere;
  }

  for (const row of await exec(
    jsql.select([MyTable['*'], MyTable.c1.as('c3')], { from: MyTable })
  )) {
    row.c1;
    row.c2;
    row.c3;

    // here should be error
    row.thereIsNoSuchAColumnHere;
  }
})();
