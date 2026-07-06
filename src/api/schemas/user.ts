import { z } from "zod";

export const GeoSchema = z.object({
  lat: z.string(),
  lng: z.string(),
});

export const AddressSchema = z.object({
  street: z.string(),
  suite: z.string(),
  city: z.string(),
  zipcode: z.string(),
  geo: GeoSchema,
});

export const CompanySchema = z.object({
  name: z.string(),
  catchPhrase: z.string(),
  bs: z.string(),
});

export const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  username: z.string(),
  email: z.string().email(),
  address: AddressSchema,
  phone: z.string(),
  website: z.string(),
  company: CompanySchema,
});

export const UsersSchema = z.array(UserSchema);

export type Geo = z.infer<typeof GeoSchema>;
export type Address = z.infer<typeof AddressSchema>;
export type Company = z.infer<typeof CompanySchema>;
export type User = z.infer<typeof UserSchema>;
export type Users = z.infer<typeof UsersSchema>;

export const UserSearchFieldSchema = z.enum([
  "name",
  "username",
  "email",
  "phone",
  "website",
  "city",
  "company",
]);

export type UserSearchField = z.infer<typeof UserSearchFieldSchema>;

export const UsersQuerySchema = z
  .object({
    search: z.string().min(1).optional(),
    fields: z.array(UserSearchFieldSchema).optional(),
  })
  .refine((query) => !query.fields || query.search, {
    message: "fields requires search",
    path: ["fields"],
  });

export type UsersQuery = z.infer<typeof UsersQuerySchema>;
