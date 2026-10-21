DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "User" WHERE "credits" <> 0) THEN
        RAISE EXCEPTION 'Cannot remove legacy User.credits while non-zero balances exist';
    END IF;
END
$$;

ALTER TABLE "User" DROP COLUMN "credits";
