/*
  Warnings:

  - You are about to drop the column `created_at` on the `GroupUser` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `GroupUser` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GroupUser" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "group_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    CONSTRAINT "GroupUser_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroupUser_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GroupUser" ("group_id", "id", "user_id") SELECT "group_id", "id", "user_id" FROM "GroupUser";
DROP TABLE "GroupUser";
ALTER TABLE "new_GroupUser" RENAME TO "GroupUser";
PRAGMA foreign_key_check("GroupUser");
PRAGMA foreign_keys=ON;
