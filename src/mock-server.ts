import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UsersSchema } from "./api/schemas/user.js";
import { filterUsers, parseUsersQueryFromUrl } from "./api/usersSearch.js";

const PORT = Number(process.env.PORT ?? 3000);
const currentDir = dirname(fileURLToPath(import.meta.url));
const usersJson = readFileSync(join(currentDir, "data/users.json"), "utf-8");
const users = UsersSchema.parse(JSON.parse(usersJson));

const server = createServer((request, response) => {
  const pathname = request.url?.split("?")[0];

  if (request.method === "GET" && pathname === "/users" && request.url) {
    const query = parseUsersQueryFromUrl(request.url);
    const filteredUsers = filterUsers(users, query);

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(filteredUsers));
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`Mock API: http://localhost:${PORT}/users`);
});
