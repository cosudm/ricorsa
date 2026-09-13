-- While no mail provider is configured, the one-time code is kept on the challenge so staff can read it to the person.
ALTER TABLE challenges ADD COLUMN code_plain TEXT;
