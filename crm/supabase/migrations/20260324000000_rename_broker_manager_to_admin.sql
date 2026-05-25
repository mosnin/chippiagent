-- Rename broker_manager → broker_admin across brokerage role system
-- This creates a clearer hierarchy: broker_owner > broker_admin > realtor_member

-- 1. Update existing membership rows
UPDATE "BrokerageMembership"
SET role = 'broker_admin'
WHERE role = 'broker_manager';

-- 2. Update existing invitation rows
UPDATE "Invitation"
SET "roleToAssign" = 'broker_admin'
WHERE "roleToAssign" = 'broker_manager';

-- 3. Drop existing CHECK constraints by querying pg_constraint catalog
--    (constraint names are auto-generated and may vary across Postgres versions)
DO $$
DECLARE
  _con_name text;
BEGIN
  -- Drop all CHECK constraints on BrokerageMembership.role
  FOR _con_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'BrokerageMembership'
      AND att.attname = 'role'
      AND con.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE "BrokerageMembership" DROP CONSTRAINT %I', _con_name);
  END LOOP;

  -- Drop all CHECK constraints on Invitation.roleToAssign
  FOR _con_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'Invitation'
      AND att.attname = 'roleToAssign'
      AND con.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE "Invitation" DROP CONSTRAINT %I', _con_name);
  END LOOP;
END $$;

-- 4. Add new CHECK constraints with known names
ALTER TABLE "BrokerageMembership"
  ADD CONSTRAINT "BrokerageMembership_role_check"
  CHECK (role IN ('broker_owner', 'broker_admin', 'realtor_member'));

ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_roleToAssign_check"
  CHECK ("roleToAssign" IN ('broker_admin', 'realtor_member'));
