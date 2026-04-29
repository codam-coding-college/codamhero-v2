/*
  Warnings:

  - Added the required column `difficulty` to the `Project` table.

*/

-- Force resync of all projects to update the new `difficulty` field by setting last_synced_at to 2010-01-01
UPDATE "Synchronization" SET "last_synced_at" = '2010-01-01' WHERE "kind" = 'projects';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "difficulty" INTEGER;

-- Set default difficulty for existing projects (if needed, otherwise it can be left as NULL)
UPDATE "Project" SET "difficulty" = 0 WHERE "difficulty" IS NULL;

-- Require difficulty
ALTER TABLE "Project" ALTER COLUMN "difficulty" SET NOT NULL;
