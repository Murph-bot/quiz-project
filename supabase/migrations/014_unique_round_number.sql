-- Two concurrent advance calls (the reveal timer plus the host's Next button, or
-- two clients that both think they are host) could insert the same round
-- number. One of the two rounds then stays 'active' forever and every later
-- advance answers "Current round still active".
--
-- The API now turns the resulting 23505 into a 409. This migration makes the
-- race impossible in the first place.
--
-- Dedupe first so the constraint can be added to an existing database. It only
-- touches games already stuck by this bug, keeps the earliest of the duplicate
-- rounds, and lets the cascading foreign keys drop the stray round's answers.
DELETE FROM rounds a
USING rounds b
WHERE a.session_id = b.session_id
  AND a.round_number = b.round_number
  AND a.ctid > b.ctid;

ALTER TABLE rounds
  ADD CONSTRAINT rounds_session_id_round_number_key UNIQUE (session_id, round_number);
