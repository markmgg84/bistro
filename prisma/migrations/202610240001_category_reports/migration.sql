-- Add category exports as reports. Existing Sale and SaleItem data is untouched.
CREATE TABLE "CategoryReport" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "rows" JSONB NOT NULL,
  "quantity" BIGINT NOT NULL,
  "revenue" DECIMAL(16,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CategoryReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CategoryReport_period_check" CHECK ("endsOn" >= "startsOn"),
  CONSTRAINT "CategoryReport_totals_check" CHECK ("quantity" >= 0 AND "revenue" >= 0),
  CONSTRAINT "CategoryReport_rows_check" CHECK (jsonb_typeof("rows") = 'array'),
  CONSTRAINT "CategoryReport_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CategoryReport_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CategoryReport_venueId_startsOn_endsOn_key" ON "CategoryReport"("venueId", "startsOn", "endsOn");
CREATE INDEX "CategoryReport_venueId_createdAt_idx" ON "CategoryReport"("venueId", "createdAt");
-- Local app role exists in the standard setup. External deployments assign their own grants.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bistro_app') THEN
    GRANT SELECT, INSERT ON "CategoryReport" TO bistro_app;
  END IF;
END $$;
