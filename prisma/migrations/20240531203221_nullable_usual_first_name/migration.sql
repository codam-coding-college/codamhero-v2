-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "usual_first_name" TEXT,
    "usual_full_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "image" TEXT,
    "pool_month" TEXT NOT NULL,
    "pool_year" TEXT NOT NULL,
    "anonymize_date" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_User" ("anonymize_date", "created_at", "display_name", "email", "first_name", "id", "image", "kind", "last_name", "login", "pool_month", "pool_year", "updated_at", "usual_first_name", "usual_full_name") SELECT "anonymize_date", "created_at", "display_name", "email", "first_name", "id", "image", "kind", "last_name", "login", "pool_month", "pool_year", "updated_at", "usual_first_name", "usual_full_name" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_key_check("User");
PRAGMA foreign_keys=ON;
