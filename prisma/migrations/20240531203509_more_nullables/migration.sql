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
    "pool_month" TEXT,
    "pool_year" TEXT,
    "anonymize_date" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_User" ("anonymize_date", "created_at", "display_name", "email", "first_name", "id", "image", "kind", "last_name", "login", "pool_month", "pool_year", "updated_at", "usual_first_name", "usual_full_name") SELECT "anonymize_date", "created_at", "display_name", "email", "first_name", "id", "image", "kind", "last_name", "login", "pool_month", "pool_year", "updated_at", "usual_first_name", "usual_full_name" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE TABLE "new_ProjectUser" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "project_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "final_mark" INTEGER,
    "status" TEXT NOT NULL,
    "validated" BOOLEAN NOT NULL,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ProjectUser_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectUser_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProjectUser" ("created_at", "final_mark", "id", "project_id", "status", "updated_at", "user_id", "validated") SELECT "created_at", "final_mark", "id", "project_id", "status", "updated_at", "user_id", "validated" FROM "ProjectUser";
DROP TABLE "ProjectUser";
ALTER TABLE "new_ProjectUser" RENAME TO "ProjectUser";
PRAGMA foreign_key_check("User");
PRAGMA foreign_key_check("ProjectUser");
PRAGMA foreign_keys=ON;
