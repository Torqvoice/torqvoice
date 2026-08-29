-- Records what roleless members can already do, before "no role" starts
-- meaning "no permissions".
--
-- withAuth used to skip its permission check entirely for a member with no
-- custom role, so such an account was unrestricted while the settings screen
-- said the opposite: "No custom role means read-only access." Anyone added as
-- a Member and never given a role has had full access ever since.
--
-- Removing that bypass on its own would lock those people out mid-shift with
-- no warning. This runs first, in the same deploy, before the app boots: it
-- writes down the access they already have so that nobody's access changes on
-- the day the code changes, an admin can finally see on the team page that
-- these accounts hold everything, and each one can then be narrowed
-- deliberately by somebody who knows which is a technician and which is the
-- bookkeeper.
--
-- It grants nothing new and takes nothing away. Owners and admins bypass
-- permission checks regardless of role, so they are untouched.
--
-- Idempotent, and safe to re-run: every statement is guarded, and the last one
-- only ever moves a member from no role to a role.

-- Explicitly transactional. Prisma does not wrap a migration file in a
-- transaction of its own: a failure partway through this one would otherwise
-- leave some workshops with a role and others without, which is the one state
-- nobody could reason about afterwards. Either all of it lands or none of it
-- does, and a failure stops the container before the new code serves anybody.
BEGIN;

-- 1. One role per workshop that actually has an affected member.
--
-- Deliberately not isAdmin: that would be a second bypass and would hide,
-- rather than record, what these accounts can reach. The name is meant to look
-- like something nobody chose, because an admin who sees it against a
-- technician should want to change it.
INSERT INTO "roles" ("id", "name", "isAdmin", "createdAt", "updatedAt", "organizationId")
SELECT gen_random_uuid()::text, 'Full access (pre-existing)', false, NOW(), NOW(), m."organizationId"
FROM "organization_members" m
WHERE m."roleId" IS NULL
  AND m."role" NOT IN ('owner', 'admin')
GROUP BY m."organizationId"
ON CONFLICT ("organizationId", "name") DO NOTHING;

-- 2. Every action on every subject, which is exactly what these members have
-- today. Kept in step with src/lib/permissions.ts.
INSERT INTO "permissions" ("id", "action", "subject", "roleId")
SELECT gen_random_uuid()::text, p."action", p."subject", r."id"
FROM "roles" r
CROSS JOIN (
  VALUES
    ('read', 'dashboard'),
    ('create', 'vehicles'), ('read', 'vehicles'), ('update', 'vehicles'), ('delete', 'vehicles'),
    ('create', 'customers'), ('read', 'customers'), ('update', 'customers'), ('delete', 'customers'),
    ('create', 'work_orders'), ('read', 'work_orders'), ('update', 'work_orders'), ('delete', 'work_orders'),
    ('create', 'quotes'), ('read', 'quotes'), ('update', 'quotes'), ('delete', 'quotes'),
    ('create', 'services'), ('read', 'services'), ('update', 'services'), ('delete', 'services'),
    ('create', 'billing'), ('read', 'billing'), ('update', 'billing'), ('delete', 'billing'),
    ('create', 'inventory'), ('read', 'inventory'), ('update', 'inventory'), ('delete', 'inventory'),
    ('create', 'labor_presets'), ('read', 'labor_presets'), ('update', 'labor_presets'), ('delete', 'labor_presets'),
    ('create', 'inspections'), ('read', 'inspections'), ('update', 'inspections'), ('delete', 'inspections'),
    ('create', 'tire_hotel'), ('read', 'tire_hotel'), ('update', 'tire_hotel'), ('delete', 'tire_hotel'), ('manage', 'tire_hotel'),
    ('read', 'reports'),
    ('create', 'work_board'), ('read', 'work_board'), ('update', 'work_board'), ('delete', 'work_board'),
    ('read', 'ai_assistant'),
    ('read', 'settings'), ('update', 'settings')
) AS p("action", "subject")
WHERE r."name" = 'Full access (pre-existing)'
ON CONFLICT ("roleId", "action", "subject") DO NOTHING;

-- 3. Point the affected members at their own workshop's role.
--
-- The roleId IS NULL guard is what makes this safe to re-run and impossible to
-- apply to somebody who has since been given a narrower role by hand.
UPDATE "organization_members" m
SET "roleId" = r."id"
FROM "roles" r
WHERE r."organizationId" = m."organizationId"
  AND r."name" = 'Full access (pre-existing)'
  AND m."roleId" IS NULL
  AND m."role" NOT IN ('owner', 'admin');

COMMIT;
