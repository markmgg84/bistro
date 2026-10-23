-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'EMPLOYEE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "userId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("userId","venueId")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeVenue" (
    "employeeId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "hourlyCost" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "EmployeeVenue_pkey" PRIMARY KEY ("employeeId","venueId")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ,
    "pauseMinutes" INTEGER NOT NULL DEFAULT 0,
    "hourlyCost" DECIMAL(10,2) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pause" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ,

    CONSTRAINT "Pause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Absence" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "receipt" TEXT NOT NULL,
    "revenue" DECIMAL(12,2) NOT NULL,
    "covers" INTEGER NOT NULL,
    "desserts" INTEGER NOT NULL,
    "importId" TEXT,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "revenue" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "dessertPercent" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "revenueTarget" DECIMAL(12,2) NOT NULL DEFAULT 120000,
    "dailyRevenueTarget" DECIMAL(12,2) NOT NULL DEFAULT 5000,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "accepted" INTEGER NOT NULL,
    "rejected" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_name_key" ON "Venue"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Shift_venueId_startsAt_idx" ON "Shift"("venueId", "startsAt");

-- CreateIndex
CREATE INDEX "Attendance_venueId_startsAt_idx" ON "Attendance"("venueId", "startsAt");

-- CreateIndex
CREATE INDEX "Absence_venueId_startsAt_idx" ON "Absence"("venueId", "startsAt");

-- CreateIndex
CREATE INDEX "Sale_venueId_businessDate_idx" ON "Sale"("venueId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_venueId_businessDate_receipt_key" ON "Sale"("venueId", "businessDate", "receipt");

-- CreateIndex
CREATE UNIQUE INDEX "Goal_venueId_month_key" ON "Goal"("venueId", "month");

-- CreateIndex
CREATE INDEX "AuditLog_venueId_createdAt_idx" ON "AuditLog"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportRun_venueId_createdAt_idx" ON "ImportRun"("venueId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeVenue" ADD CONSTRAINT "EmployeeVenue_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeVenue" ADD CONSTRAINT "EmployeeVenue_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_employeeId_venueId_fkey" FOREIGN KEY ("employeeId", "venueId") REFERENCES "EmployeeVenue"("employeeId", "venueId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_venueId_fkey" FOREIGN KEY ("employeeId", "venueId") REFERENCES "EmployeeVenue"("employeeId", "venueId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pause" ADD CONSTRAINT "Pause_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_employeeId_venueId_fkey" FOREIGN KEY ("employeeId", "venueId") REFERENCES "EmployeeVenue"("employeeId", "venueId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRun" ADD CONSTRAINT "ImportRun_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRun" ADD CONSTRAINT "ImportRun_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Invariants enforced even when concurrent requests race.
CREATE UNIQUE INDEX "Attendance_one_open_per_employee" ON "Attendance" ("employeeId") WHERE "endsAt" IS NULL;
CREATE UNIQUE INDEX "Pause_one_open" ON "Pause" ("attendanceId") WHERE "endsAt" IS NULL;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_valid_times" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt"), ADD CONSTRAINT "Attendance_positive_cost" CHECK ("hourlyCost" >= 0), ADD CONSTRAINT "Attendance_valid_pause" CHECK ("pauseMinutes" >= 0 AND ("endsAt" IS NULL OR "pauseMinutes" * 60 <= EXTRACT(EPOCH FROM ("endsAt" - "startsAt"))));
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_valid_times" CHECK ("endsAt" > "startsAt" AND "endsAt" <= "startsAt" + INTERVAL '36 hours');
ALTER TABLE "Pause" ADD CONSTRAINT "Pause_valid_times" CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt");
ALTER TABLE "EmployeeVenue" ADD CONSTRAINT "EmployeeVenue_positive_cost" CHECK ("hourlyCost" >= 0);
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_positive_values" CHECK ("revenue" >= 0 AND "covers" >= 0 AND "desserts" >= 0);
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_valid_values" CHECK ("dessertPercent" BETWEEN 0 AND 100 AND "revenueTarget" >= 0 AND "dailyRevenueTarget" >= 0);
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_valid_times" CHECK ("endsAt" > "startsAt");
