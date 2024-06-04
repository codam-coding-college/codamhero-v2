/*
  Warnings:

  - Added the required column `created_at` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Project` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "exam" BOOLEAN NOT NULL,
    "cursus_id" INTEGER NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL,
    CONSTRAINT "Project_cursus_id_fkey" FOREIGN KEY ("cursus_id") REFERENCES "Cursus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("cursus_id", "description", "exam", "id", "name", "slug") SELECT "cursus_id", "description", "exam", "id", "name", "slug" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_key_check("Project");
PRAGMA foreign_keys=ON;
