const { Pool } = require("pg");
const { migrate } = require("postgres-migrations");
const config = require("./config");

class Migrations {
  constructor() {
    this.pool = new Pool(config.database);
  }

  async run() {
    const client = await this.pool.connect();
    try {
      await migrate({ client }, "migrations");
    } finally {
      await client.end();
    }
  }
}

module.exports = {
  Migrations,
};
