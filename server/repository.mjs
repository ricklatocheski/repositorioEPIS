import { createHash } from "node:crypto";
import {
  initialState,
  validateState,
  validateTransition,
  HttpError,
} from "./model.mjs";

// Works with a pg client in production and PGlite in local development/tests.
export function createRepository(database) {
  return {
    async read() {
      await database.query(
        "INSERT INTO epi_state(id,payload) VALUES(1,$1::jsonb) ON CONFLICT(id) DO NOTHING",
        [JSON.stringify(initialState())],
      );
      const { rows } = await database.query(
        "SELECT revision,payload,updated_at FROM epi_state WHERE id=1",
      );
      const r = rows[0];
      return {
        revision: r.revision,
        state: r.payload,
        updatedAt: r.updated_at,
      };
    },
    async write({ revision, state, requestId, operation = "update" }) {
      validateState(state);
      return database.transaction(async (client) => {
        const previous = await client.query(
          "SELECT revision,payload FROM epi_state WHERE id=1 FOR UPDATE",
        );
        const current = previous.rows[0];
        if (!current)
          throw new HttpError(409, "Atualize os dados antes de salvar.");
        const duplicate = await client.query(
          "SELECT revision,state_hash FROM epi_audit WHERE request_id=$1",
          [requestId],
        );
        const hash = createHash("sha256")
          .update(JSON.stringify(state))
          .digest("hex");
        if (duplicate.rows.length) {
          if (duplicate.rows[0].state_hash !== hash)
            throw new HttpError(
              409,
              "Identificador já utilizado em outra operação.",
            );
          return { revision: duplicate.rows[0].revision, replayed: true };
        }
        if (current.revision !== revision)
          throw new HttpError(
            409,
            "Outro computador atualizou os dados. Clique em Atualizar dados e tente novamente.",
          );
        validateTransition(current.payload, state, operation);
        const next = revision + 1;
        await client.query(
          "UPDATE epi_state SET payload=$1::jsonb,revision=$2,updated_at=now() WHERE id=1",
          [JSON.stringify(state), next],
        );
        await client.query(
          "INSERT INTO epi_audit(revision,request_id,operation,state_hash,summary) VALUES($1,$2,$3,$4,$5::jsonb)",
          [
            next,
            requestId,
            operation,
            hash,
            JSON.stringify({
              loans: state.loans.length,
              stock: state.stock.length,
              carriers: state.registries.transportadoras.length,
              drivers: state.registries.motoristas.length,
              vehicles: state.registries.veiculos.length,
            }),
          ],
        );
        return { revision: next };
      });
    },
  };
}
