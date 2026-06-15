import { ApiClient } from "./api/ApiClient.js";
import { UsersQuerySchema, UsersSchema } from "./api/schemas/user.js";

async function main(): Promise<void> {
  const api = new ApiClient({
    baseURL: process.env.API_BASE_URL ?? "http://localhost:3000",
    headers: {
      Authorization: "Bearer token",
    },
    retry: {
      maxAttempts: 3,
      baseDelay: 300,
    },
  });

  const users = await api.get({
    path: "/users",
    responseSchema: UsersSchema,
    query: {
      search: "Leanne",
      fields: ["name", "email"],
    },
    querySchema: UsersQuerySchema,
    cache: {
      ttl: 60_000,
    },
  });

  console.log(`Fetched ${users.length} users`);
  console.log(users[0]);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
