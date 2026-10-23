/**
 * Durable outbox drain: at-least-once event publication, never exactly-once.
 * Inject the trusted publisher; this is NOT itself a deployed realtime transport.
 */
export function createOutboxDispatcher(pool, publish, onError = () => {}) {
  if (!pool?.query || typeof publish !== "function") throw new TypeError("Database and publisher required");
  return {
    async drainOnce(batchSize = 25) {
      if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
        throw new RangeError("Invalid batch size");
      }
      const q = await pool.query(
        "WITH claim AS (SELECT id FROM bridge_event_outbox " +
        "WHERE published_at IS NULL AND available_at <= now() " +
        "AND (leased_until IS NULL OR leased_until < now()) " +
        "ORDER BY available_at, id LIMIT $1 FOR UPDATE SKIP LOCKED) " +
        "UPDATE bridge_event_outbox AS o SET leased_until=now()+interval '30 seconds', " +
        "attempts=o.attempts+1 FROM claim WHERE o.id=claim.id " +
        "RETURNING o.id,o.event_key,o.event_type,o.conversation_id,o.payload,o.attempts",
        [batchSize]
      );
      let published = 0, failed = 0;
      for (const event of q.rows) {
        try {
          await publish({
            id: event.id,
            type: event.event_type,
            conversationId: event.conversation_id,
            payload: event.payload
          });
          const ack = await pool.query(
            "UPDATE bridge_event_outbox SET published_at=now(),leased_until=NULL " +
            "WHERE id=$1 AND attempts=$2 AND published_at IS NULL RETURNING id",
            [event.id,event.attempts]
          );
          if (ack.rows.length) published++;
          else failed++; // Lease overtaken by another worker; do not claim success.
        } catch (error) {
          failed++;
          // Fail-open for RETRY only; preserve the event for human inspection.
          try {
            await pool.query(
              "UPDATE bridge_event_outbox SET leased_until=NULL, " +
              "available_at=now()+(LEAST(300,power(2,LEAST(attempts,8))) * interval '1 second') " +
              "WHERE id=$1 AND attempts=$2 AND published_at IS NULL",
              [event.id,event.attempts]
            );
          } catch (dbError) { onError(dbError); }
          onError(error);
        }
      }
      return { claimed: q.rows.length, published, failed };
    }
  };
}
