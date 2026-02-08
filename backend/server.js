import app from "./app.js";
import { db } from "./config/db.js";
import { env } from "./config/env.js";

let server;
let shuttingDown = false;

async function start() {
  await db.query("SELECT 1");

  server = app.listen(env.PORT, () => {
    console.log(`Backend running on port ${env.PORT}`);
  });
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully`);

  const timeout = setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
    await db.end();
    clearTimeout(timeout);
    process.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    console.error("Shutdown failed", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

start().catch((error) => {
  console.error("Startup failed", error);
  process.exit(1);
});
