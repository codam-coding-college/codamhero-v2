-- CreateTable
CREATE TABLE "intra_v2"."projects_cursus" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "cursus_id" INTEGER NOT NULL,

    CONSTRAINT "projects_cursus_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "intra_v2"."projects_cursus"
    ADD CONSTRAINT "projects_cursus_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "intra_v2"."projects"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intra_v2"."projects_cursus"
    ADD CONSTRAINT "projects_cursus_cursus_id_fkey"
    FOREIGN KEY ("cursus_id") REFERENCES "intra_v2"."cursus"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill from projects.cursus_id
INSERT INTO "intra_v2"."projects_cursus" ("project_id", "cursus_id")
SELECT "id", "cursus_id"
FROM "intra_v2"."projects"
WHERE "cursus_id" IS NOT NULL;

-- Drop old cursus_id column from projects
ALTER TABLE "intra_v2"."projects" DROP COLUMN "cursus_id";
