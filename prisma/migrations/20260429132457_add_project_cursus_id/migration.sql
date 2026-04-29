/*
  Warnings:

  - Added the required column `cursus_id` to the `Project` table without a default value. This is not possible if the table is not empty. Thus the projects table gets emptied and a resync of all projects is required. This will be done automatically.

*/
-- Drop all projects
DELETE FROM "Project";

-- Force resync of all projects to update the new `cursus_id` field
UPDATE "Synchronization" SET "last_synced_at" = NULL WHERE "kind" = 'projects';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "cursus_id" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_cursus_id_fkey" FOREIGN KEY ("cursus_id") REFERENCES "Cursus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
