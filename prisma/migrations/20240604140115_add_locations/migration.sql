-- CreateTable
CREATE TABLE "Location" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "primary" BOOLEAN NOT NULL,
    "host" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "begin_at" DATETIME NOT NULL,
    "end_at" DATETIME,
    CONSTRAINT "Location_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
