-- Optional per-question metadata for the free-input mechanic.
-- unit: what the number measures (e.g. "islands", "km²", "USD")
-- hint: short clarification shown under the question (e.g. "roughly, in the thousands")
ALTER TABLE questions ADD COLUMN unit text;
ALTER TABLE questions ADD COLUMN hint text;
