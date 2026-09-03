const EmbeddedPostgres = require('embedded-postgres').default;
const path = require('path');

const pg = new EmbeddedPostgres({
  databaseDir: path.join(__dirname, '..', '..', '.pgdata'),
  user: 'postgres',
  password: 'postgres',
  port: 55432,
  persistent: true,
});

async function main() {
  const action = process.argv[2] || 'start';
  if (action === 'start') {
    try {
      await pg.initialise();
    } catch (e) {
      // já inicializado, ok
    }
    await pg.start();
    console.log('Postgres de desenvolvimento rodando em 127.0.0.1:55432');
  } else if (action === 'stop') {
    await pg.stop();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
