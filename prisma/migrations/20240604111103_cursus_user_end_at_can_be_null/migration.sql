-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CursusUser" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cursus_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "begin_at" DATETIME NOT NULL,
    "end_at" DATETIME,
    "level" REAL NOT NULL,
    "grade" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "CursusUser_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CursusUser_cursus_id_fkey" FOREIGN KEY ("cursus_id") REFERENCES "Cursus" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CursusUser" ("begin_at", "created_at", "cursus_id", "end_at", "grade", "id", "level", "updated_at", "user_id") SELECT "begin_at", "created_at", "cursus_id", "end_at", "grade", "id", "level", "updated_at", "user_id" FROM "CursusUser";
DROP TABLE "CursusUser";
ALTER TABLE "new_CursusUser" RENAME TO "CursusUser";
PRAGMA foreign_key_check("CursusUser");
PRAGMA foreign_keys=ON;
