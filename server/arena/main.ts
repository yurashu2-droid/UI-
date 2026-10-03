import { resolve } from "node:path";
import { createArenaServer } from "./http.js";
const port = Number(process.env.ARENA_PORT || 5180);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid ARENA_PORT");
const server = createArenaServer({
  filePath: resolve(process.env.ARENA_STORE || ".local/arena/store.json"),
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `UI RAID arena: http://127.0.0.1:${port}/api/arena/health (local only)`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
