import { createDatabase, runMigrations } from "@/db/client";
import { account, user } from "@/db/schema";

export function testDb() {
  const db = createDatabase(":memory:");
  runMigrations(db);
  return db;
}

export function addUser(db: ReturnType<typeof testDb>, id: string, name = id) {
  const now = new Date();
  db.insert(user)
    .values({
      id,
      name,
      email: `${id}@test`,
      username: id,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(account)
    .values({
      id: `acc-${id}`,
      accountId: id,
      providerId: "credential",
      userId: id,
      password: "alt",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}
