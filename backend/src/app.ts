import { env } from './config/env.js';
import { buildApp } from './server.js';

const app = buildApp(env.dataFile, env.staticDir);

app.listen(env.port, env.host, () => {
  console.log(`Backend listening at http://${env.host}:${env.port}`);
});
