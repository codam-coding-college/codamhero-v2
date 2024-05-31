/*
  Warnings:

  - A unique constraint covering the columns `[kind]` on the table `Synchronization` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Synchronization_kind_key" ON "Synchronization"("kind");
