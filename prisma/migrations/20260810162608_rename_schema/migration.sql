--- Create intra_v2 schema
CREATE SCHEMA IF NOT EXISTS intra_v2;

--- Move all tables to intra_v2 schema
ALTER TABLE "User" SET SCHEMA intra_v2;
ALTER TABLE "Cursus" SET SCHEMA intra_v2;
ALTER TABLE "CursusUser" SET SCHEMA intra_v2;
ALTER TABLE "Group" SET SCHEMA intra_v2;
ALTER TABLE "GroupUser" SET SCHEMA intra_v2;
ALTER TABLE "Location" SET SCHEMA intra_v2;
ALTER TABLE "Project" SET SCHEMA intra_v2;
ALTER TABLE "ProjectUser" SET SCHEMA intra_v2;

--- Rename all tables to CodamDB form
ALTER TABLE intra_v2."User" RENAME TO "users";
ALTER TABLE intra_v2."Cursus" RENAME TO "cursus";
ALTER TABLE intra_v2."CursusUser" RENAME TO "cursus_users";
ALTER TABLE intra_v2."Group" RENAME TO "groups";
ALTER TABLE intra_v2."GroupUser" RENAME TO "group_users";
ALTER TABLE intra_v2."Location" RENAME TO "locations";
ALTER TABLE intra_v2."Project" RENAME TO "projects";
ALTER TABLE intra_v2."ProjectUser" RENAME TO "project_users";

--- Rename primary key constraints to match the renamed tables
ALTER TABLE intra_v2."users" RENAME CONSTRAINT "User_pkey" TO "users_pkey";
ALTER TABLE intra_v2."cursus" RENAME CONSTRAINT "Cursus_pkey" TO "cursus_pkey";
ALTER TABLE intra_v2."cursus_users" RENAME CONSTRAINT "CursusUser_pkey" TO "cursus_users_pkey";
ALTER TABLE intra_v2."groups" RENAME CONSTRAINT "Group_pkey" TO "groups_pkey";
ALTER TABLE intra_v2."group_users" RENAME CONSTRAINT "GroupUser_pkey" TO "group_users_pkey";
ALTER TABLE intra_v2."locations" RENAME CONSTRAINT "Location_pkey" TO "locations_pkey";
ALTER TABLE intra_v2."projects" RENAME CONSTRAINT "Project_pkey" TO "projects_pkey";
ALTER TABLE intra_v2."project_users" RENAME CONSTRAINT "ProjectUser_pkey" TO "project_users_pkey";

--- Rename foreign key constraints to match the renamed tables
ALTER TABLE intra_v2."cursus_users" RENAME CONSTRAINT "CursusUser_cursus_id_fkey" TO "cursus_users_cursus_id_fkey";
ALTER TABLE intra_v2."cursus_users" RENAME CONSTRAINT "CursusUser_user_id_fkey" TO "cursus_users_user_id_fkey";
ALTER TABLE intra_v2."group_users" RENAME CONSTRAINT "GroupUser_group_id_fkey" TO "group_users_group_id_fkey";
ALTER TABLE intra_v2."group_users" RENAME CONSTRAINT "GroupUser_user_id_fkey" TO "group_users_user_id_fkey";
ALTER TABLE intra_v2."locations" RENAME CONSTRAINT "Location_user_id_fkey" TO "locations_user_id_fkey";
ALTER TABLE intra_v2."project_users" RENAME CONSTRAINT "ProjectUser_project_id_fkey" TO "project_users_project_id_fkey";
ALTER TABLE intra_v2."project_users" RENAME CONSTRAINT "ProjectUser_user_id_fkey" TO "project_users_user_id_fkey";
ALTER TABLE intra_v2."projects" RENAME CONSTRAINT "Project_cursus_id_fkey" TO "projects_cursus_id_fkey";

--- Create internal schema
CREATE SCHEMA IF NOT EXISTS internal;

--- Move synchronization table to internal schema
ALTER TABLE "Synchronization" SET SCHEMA internal;

--- Rename synchronization table to CodamDB form
ALTER TABLE internal."Synchronization" RENAME TO "sync";

--- Update synchronization table to CodamDB form
ALTER TABLE internal."sync" RENAME CONSTRAINT "Synchronization_pkey" TO "sync_pkey";
ALTER TABLE internal."sync" RENAME COLUMN "kind" TO "type";
ALTER TABLE internal."sync" RENAME COLUMN "last_synced_at" TO "last_sync_date";
ALTER TABLE internal."sync" DROP COLUMN "first_synced_at";
ALTER INDEX internal."Synchronization_kind_key" RENAME TO "sync_type_key";
