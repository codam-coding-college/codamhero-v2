-- Set the values of the new columns to their corresponding values in the old column
-- The year we can simply parse as an integer
UPDATE "User" SET "pool_year_num" = CAST("pool_year" AS INTEGER);
-- The month we have to parse the string and convert the month name to a number
UPDATE "User" SET "pool_month_num" = CASE
  WHEN LOWER("pool_month") = 'january' THEN 1
  WHEN LOWER("pool_month") = 'february' THEN 2
  WHEN LOWER("pool_month") = 'march' THEN 3
  WHEN LOWER("pool_month") = 'april' THEN 4
  WHEN LOWER("pool_month") = 'may' THEN 5
  WHEN LOWER("pool_month") = 'june' THEN 6
  WHEN LOWER("pool_month") = 'july' THEN 7
  WHEN LOWER("pool_month") = 'august' THEN 8
  WHEN LOWER("pool_month") = 'september' THEN 9
  WHEN LOWER("pool_month") = 'october' THEN 10
  WHEN LOWER("pool_month") = 'november' THEN 11
  WHEN LOWER("pool_month") = 'december' THEN 12
END;
