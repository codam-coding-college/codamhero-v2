/*
  Warnings:

  - Added the required column `difficulty` to the `Project` table.

*/

-- Force resync of all projects to update the new `difficulty` field
UPDATE "Synchronization" SET "last_synced_at" = NULL WHERE "kind" = 'projects';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "difficulty" INTEGER;

-- Set default difficulty for existing projects (if needed, otherwise it can be left as NULL)
UPDATE "Project" SET "difficulty" = 0 WHERE "difficulty" IS NULL;

-- Require difficulty
ALTER TABLE "Project" ALTER COLUMN "difficulty" SET NOT NULL;
