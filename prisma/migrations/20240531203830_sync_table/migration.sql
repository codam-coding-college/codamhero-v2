-- CreateTable
CREATE TABLE "Synchronization" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "first_synced_at" DATETIME NOT NULL,
    "last_synced_at" DATETIME NOT NULL
);
