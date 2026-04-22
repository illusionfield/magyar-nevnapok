import { startWebServer } from "./app.mjs";

const { host, port } = await startWebServer({
  dev: true,
});

console.log(`Fejlesztői webes felület fut: http://${host}:${port}`);
