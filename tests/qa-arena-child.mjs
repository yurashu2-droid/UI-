// Independent audit fixture: a real child-process HTTP server with an isolated
// test-only store and an OS-assigned loopback port. Never a public listener.
import { createArenaServer } from "../server/arena/http.js";
const server = createArenaServer({ filePath: process.env.QA_ARENA_STORE });
server.listen(0, "127.0.0.1", () => console.log("QA_READY:" + server.address().port));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
