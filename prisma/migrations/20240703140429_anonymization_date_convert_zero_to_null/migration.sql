-- Set the values of the new columns to their corresponding values in the old column
UPDATE "User" SET "anonymize_date" = NULL WHERE "anonymize_date" = 0;
