BEGIN;
ALTER TABLE "User" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "Department" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");
CREATE TABLE "Ward" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "departmentName" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Ward_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Ward_departmentName_name_key" ON "Ward"("departmentName", "name");
INSERT INTO "Department" ("id", "name")
  SELECT gen_random_uuid()::text, "department" FROM "Bed" GROUP BY "department";
INSERT INTO "Ward" ("id", "departmentName", "name")
  SELECT gen_random_uuid()::text, "department", "ward" FROM "Bed" GROUP BY "department", "ward";
ALTER TABLE "Bed" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Ward" ADD CONSTRAINT "Ward_departmentName_fkey"
  FOREIGN KEY ("departmentName") REFERENCES "Department"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_department_ward_fkey"
  FOREIGN KEY ("department", "ward") REFERENCES "Ward"("departmentName", "name") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Local installs have a separate runtime role; hosted databases may use another role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nour_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "Department", "Ward" TO nour_app;
  END IF;
END
$$;
COMMIT;
