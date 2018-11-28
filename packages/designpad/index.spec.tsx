import React from 'react';
import { frame } from '.';

describe('.design.ts', () => {
  afterEach(frame.clear);

  it('defines frames using frame function', () => {
    frame('Button 1', () => <button>Button 1</button>, [
      { width: 100, height: 100 }
    ]);

    expect(frame.all()).toMatchInlineSnapshot(`
Array [
  Object {
    "label": "Button 1",
    "renderer": [Function],
    "sizes": Array [
      Object {
        "height": 100,
        "width": 100,
      },
    ],
  },
]
`);

    frame('Button 2', () => <button>Button 2</button>);
    expect(frame.all()).toMatchInlineSnapshot(`
Array [
  Object {
    "label": "Button 1",
    "renderer": [Function],
    "sizes": Array [
      Object {
        "height": 100,
        "width": 100,
      },
    ],
  },
  Object {
    "label": "Button 2",
    "renderer": [Function],
    "sizes": Array [],
  },
]
`);
  });
});
