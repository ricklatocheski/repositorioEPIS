import { getDatabase } from "@netlify/database";
import { createRepository } from "../../server/repository.mjs";
import { createHandler } from "../../server/api.mjs";

let repository;
function getRepository() {
  if (repository) return repository;
  const database = getDatabase(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : undefined,
  );
  const adapter = {
    query: (sql, params) => database.pool.query(sql, params),
    transaction: async (action) => {
      const client = await database.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await action(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
  repository = createRepository(adapter);
  return repository;
}
export default createHandler(getRepository);
