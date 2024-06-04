/*
  Warnings:

  - You are about to drop the column `cursus_id` on the `Project` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "exam" BOOLEAN NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL
);
INSERT INTO "new_Project" ("created_at", "description", "exam", "id", "name", "slug", "updated_at") SELECT "created_at", "description", "exam", "id", "name", "slug", "updated_at" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_key_check("Project");
PRAGMA foreign_keys=ON;
