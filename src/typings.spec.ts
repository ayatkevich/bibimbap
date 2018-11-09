import path from 'path';
import fs from 'fs';
import ts from 'typescript';

test('check typings', () => {
  const program = ts.createProgram(
    fs
      .readdirSync('./src/typings-tests')
      .filter(file => file.endsWith('.ts'))
      .map(file => path.join('./src/typings-tests', file)),
    {
      baseUrl: './src',
      declaration: false,
      noEmit: true,
      downlevelIteration: true,
      esModuleInterop: true,
      experimentalDecorators: true,
      importHelpers: false,
      inlineSourceMap: true,
      lib: ['lib.es2015.d.ts', 'lib.es2016.array.include.d.ts'],
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      noEmitOnError: true,
      noFallthroughCasesInSwitch: true,
      noImplicitAny: true,
      noImplicitReturns: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      removeComments: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      sourceMap: false,
      strict: true,
      target: ts.ScriptTarget.ESNext,
      types: ['jest', 'node']
    }
  );
  const emitResult = program.emit();

  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);

  for (const diagnostic of allDiagnostics) {
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n'
    );
    if (diagnostic.file) {
      expect(message).toMatchSnapshot(
        `${diagnostic.file.fileName}`
      );
    } else {
      expect(message).toMatchSnapshot();
    }
  }
});
