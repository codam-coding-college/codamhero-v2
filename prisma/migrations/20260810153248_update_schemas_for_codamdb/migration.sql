-- User
ALTER TABLE "User" ALTER COLUMN "usual_full_name" DROP NOT NULL;
ALTER TABLE "User" RENAME COLUMN "display_name" TO "displayname";
ALTER TABLE "User" RENAME COLUMN "image" TO "image_url";
ALTER TABLE "User" DROP COLUMN "pool_month_num";
ALTER TABLE "User" DROP COLUMN "pool_year_num";
ALTER TABLE "User" ADD COLUMN "wallet" INTEGER NOT NULL DEFAULT 0;
UPDATE "Synchronization" SET "last_synced_at" = '1970-01-01 00:00:00.000' WHERE "kind" = 'user';

-- CursusUser
ALTER TABLE "CursusUser" ADD COLUMN "blackholed_at" TIMESTAMP(3);
UPDATE "Synchronization" SET "last_synced_at" = '1970-01-01 00:00:00.000' WHERE "kind" = 'cursus';

-- Project
ALTER TABLE "Project" DROP COLUMN "description"; -- does not exist in API endpoint

-- ProjectUser
ALTER TABLE "ProjectUser" ALTER COLUMN "validated" DROP NOT NULL;
