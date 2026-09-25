module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  // babel-preset-expo reescribe helpers a `require('@babel/runtime/...')` en TODO archivo que transforma,
  // incluido @oficio/shared (vive fuera de mobile/, resuelto por symlink). La resolución de módulos de Node
  // busca @babel/runtime subiendo desde shared/src/, no en mobile/node_modules: sin esto, "npx jest" falla
  // con "Cannot find module '@babel/runtime/...'" antes de llegar a compilar ningún test.
  modulePaths: ['<rootDir>/node_modules'],
};
