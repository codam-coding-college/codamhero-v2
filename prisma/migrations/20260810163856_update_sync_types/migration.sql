--- Update synchronization types
UPDATE internal."sync" SET "type" = 'users' WHERE "type" = 'user';
UPDATE internal."sync" SET "type" = 'cursuses' WHERE "type" = 'cursus';
