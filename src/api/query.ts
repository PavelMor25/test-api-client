import type { ZodType } from "zod";

export function serializeQueryParams(
  query: Record<string, unknown>,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          params.append(key, String(item));
        }
      }
      continue;
    }

    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function validateAndSerializeQuery<T extends ZodType>(
  query: unknown,
  querySchema: T,
): string {
  const validated = querySchema.parse(query);
  return serializeQueryParams(validated as Record<string, unknown>);
}
