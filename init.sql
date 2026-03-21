DO $$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'mytrackr') THEN
      CREATE DATABASE mytrackr
          WITH OWNER = postgres
          ENCODING = 'UTF8'
          LC_COLLATE = 'en_US.utf8'
          LC_CTYPE = 'en_US.utf8'
          TEMPLATE = template0
          CONNECTION LIMIT = -1;
   END IF;
END$$;