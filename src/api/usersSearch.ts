import {
  UserSearchFieldSchema,
  UsersQuerySchema,
  type User,
  type UserSearchField,
  type UsersQuery,
} from "./schemas/user.js";

const DEFAULT_SEARCH_FIELDS: UserSearchField[] = [
  "name",
  "username",
  "email",
  "phone",
  "website",
];

function getFieldValue(user: User, field: UserSearchField): string {
  switch (field) {
    case "name":
      return user.name;
    case "username":
      return user.username;
    case "email":
      return user.email;
    case "phone":
      return user.phone;
    case "website":
      return user.website;
    case "city":
      return user.address.city;
    case "company":
      return user.company.name;
  }
}

function matchesSearch(
  user: User,
  search: string,
  fields: UserSearchField[],
): boolean {
  const term = search.toLowerCase();

  return fields.some((field) =>
    getFieldValue(user, field).toLowerCase().includes(term),
  );
}

export function filterUsers(users: User[], query: UsersQuery): User[] {
  if (!query.search) {
    return users;
  }

  const fields = query.fields ?? DEFAULT_SEARCH_FIELDS;
  return users.filter((user) => matchesSearch(user, query.search!, fields));
}

function parseFieldsParam(values: string[]): UserSearchField[] {
  const fields = values.flatMap((value) =>
    value.split(",").map((part) => part.trim()),
  );

  return fields.map((field) => UserSearchFieldSchema.parse(field));
}

export function parseUsersQueryFromUrl(url: string): UsersQuery {
  const { searchParams } = new URL(url, "http://localhost");
  const raw: Record<string, unknown> = {};

  const search = searchParams.get("search");
  if (search !== null) {
    raw.search = search;
  }

  const fields = searchParams.getAll("fields");
  if (fields.length > 0) {
    raw.fields = parseFieldsParam(fields);
  }

  return UsersQuerySchema.parse(raw);
}
