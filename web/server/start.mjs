import { startWebServer } from "./app.mjs";

const { host, port } = await startWebServer();

console.log(`Web GUI fut: http://${host}:${port}`);
