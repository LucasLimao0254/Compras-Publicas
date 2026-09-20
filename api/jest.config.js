// Testes de integração dos invariantes de domínio (MODELO.md, seção 2). Rodam
// contra um Postgres REAL (o embarcado: `node scripts/devdb.js start`), num
// banco descartável `compras_test` recriado a cada execução a partir do
// schema.ts — nunca tocam o banco de desenvolvimento.
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'test/.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  globalSetup: '<rootDir>/test/global-setup.ts',
  setupFiles: ['<rootDir>/test/env.ts'],
  testTimeout: 30000,
  // Um banco compartilhado, cada spec isola seus dados num tenant próprio;
  // rodar em série evita disputa de lock entre specs.
  maxWorkers: 1,
};
