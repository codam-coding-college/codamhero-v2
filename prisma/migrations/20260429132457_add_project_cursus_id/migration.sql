/*
  Warnings:

  - Added the required column `cursus_id` to the `Project` table.

*/
-- Force resync of all projects to update the new `cursus_id` field
UPDATE "Synchronization" SET "last_synced_at" = NULL WHERE "kind" = 'projects';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "cursus_id" INTEGER;

-- Set default cursus_id for existing projects (if needed, otherwise it can be left as NULL)
-- Using cursus_id 1 because the cursus has to exist in the database for the foreign key constraint later on
UPDATE "Project" SET "cursus_id" = 1 WHERE "cursus_id" IS NULL;

-- Require cursus_id
ALTER TABLE "Project" ALTER COLUMN "cursus_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_cursus_id_fkey" FOREIGN KEY ("cursus_id") REFERENCES "Cursus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
