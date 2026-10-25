// Local development database: a real PostgreSQL server run from node_modules,
// so nothing has to be installed on the machine. Data lives in ./.pgdata.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const dataDir = "./.pgdata";
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "altheo",
  password: "altheo",
  port: 5433,
  persistent: true,
});

if (!existsSync(dataDir)) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("altheo");
} catch {
  // already exists
}
console.log("PostgreSQL running on localhost:5433 (database: altheo). Ctrl+C to stop.");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
