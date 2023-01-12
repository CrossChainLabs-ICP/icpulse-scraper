const config = require("./config");
const { INFO, ERROR } = require("./logs");
const { Migrations } = require("./migrations");
const { Scraper } = require("./scraper");

let migrations = new Migrations();
let scraper = new Scraper(
  config.scraper.github_api,
  config.scraper.github_token
);
let stop = false;

async function scrape() {
  await scraper.run();
}

const pause = (timeout) =>
  new Promise((res) => setTimeout(res, timeout * 1000));

const mainLoop = async (_) => {
  try {
    INFO("run migrations");
    await migrations.run();
    INFO("run migrations, done");

    while (!stop) {
      await scrape();

      INFO(`pause for 60 seconds`);
      await pause(60);
    }
  } catch (error) {
    ERROR(`[mainLoop] error :`);
    console.error(error);
    ERROR(`shutting down`);
    process.exit(1);
  }
};

mainLoop();

function shutdown(exitCode = 0) {
  stop = true;
  setTimeout(() => {
    INFO(`shutdown`);
    process.exit(exitCode);
  }, 3000);
}
//listen for TERM signal .e.g. kill
process.on("SIGTERM", shutdown);
// listen for INT signal e.g. Ctrl-C
process.on("SIGINT", shutdown);
