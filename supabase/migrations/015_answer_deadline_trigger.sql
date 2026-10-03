-- Enforce the round deadline atomically at insert time. Without this, a
-- check in the application layer (round.status !== 'closed') leaves a gap:
-- a slow or backgrounded client can submit after started_at + time_limit but
-- before the host's close request lands, and a check-then-insert race with
-- closeRound.ts could let an answer in right as the round closes. This
-- trigger makes "is this answer still on time" atomic with the insert.
--
-- The grace window matches CLOSE_EARLY_TOLERANCE_MS in
-- src/lib/game/closeRound.ts, which tolerates the same amount of client/
-- server clock skew when deciding whether a round can close early.
CREATE OR REPLACE FUNCTION check_answer_deadline()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status     text;
  v_started_at timestamptz;
  v_time_limit integer;
BEGIN
  SELECT r.status, r.started_at, q.time_limit
  INTO v_status, v_started_at, v_time_limit
  FROM rounds r
  JOIN questions q ON q.id = r.question_id
  WHERE r.id = NEW.round_id;

  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Round is not active' USING ERRCODE = 'QK001';
  END IF;

  IF now() > v_started_at + ((v_time_limit * 1000 + 2000) * interval '1 millisecond') THEN
    RAISE EXCEPTION 'Round deadline has passed' USING ERRCODE = 'QK002';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_answer_deadline
BEFORE INSERT ON answers
FOR EACH ROW
EXECUTE FUNCTION check_answer_deadline();
