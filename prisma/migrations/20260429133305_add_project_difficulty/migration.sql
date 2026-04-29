/*
  Warnings:

  - Added the required column `difficulty` to the `Project` table without a default value. This is not possible if the table is not empty. Thus the projects table gets emptied and a resync of all projects is required. This will be done automatically.

*/
-- Drop all projects
DELETE FROM "Project";

-- Force resync of all projects to update the new `difficulty` field
UPDATE "Synchronization" SET "last_synced_at" = NULL WHERE "kind" = 'projects';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "difficulty" INTEGER NOT NULL;
