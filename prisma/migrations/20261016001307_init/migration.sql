-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TENANT', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('ONE_BED', 'TWO_BED', 'THREE_BED');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('VACANT', 'RESERVED', 'OCCUPIED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('AWAITING_PAYMENT', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BookingDecision" AS ENUM ('REFUND', 'KEEP');

-- CreateEnum
CREATE TYPE "RentCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('UNPAID', 'PAID', 'REFUNDED', 'PARTIAL_REFUND');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('PENDING_DEPOSIT', 'ACTIVE', 'ENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('HOLD_FEE', 'DEPOSIT', 'RENT', 'SANITATION', 'CLEANING', 'DAMAGE_CHARGE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PAYSTACK_MOMO', 'PAYSTACK_CARD', 'PAYSTACK_OTHER', 'CASH', 'BANK');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('BOOKING_APPROVED', 'BOOKING_REJECTED', 'BOOKING_EXPIRED', 'DEPOSIT_RETURN');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "TicketScope" AS ENUM ('APARTMENT', 'SHARED');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('PLUMBING', 'ELECTRICAL', 'DOORS_LOCKS', 'APPLIANCE', 'AC_FAN', 'PAINT_WALLS', 'PESTS', 'OTHER', 'WATER', 'POWER', 'LIGHTS', 'GATE_SECURITY', 'WASTE_DRAINS', 'STAIRS', 'PARKING', 'OTHER_SHARED');

-- CreateEnum
CREATE TYPE "SharedFloor" AS ENUM ('GROUND', 'FIRST', 'SECOND', 'WHOLE_BUILDING', 'COMPOUND');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('EMERGENCY', 'URGENT', 'NORMAL');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('REPORTED', 'SEEN', 'ASSIGNED', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "Payer" AS ENUM ('ALTHEO', 'TENANT');

-- CreateEnum
CREATE TYPE "CleaningType" AS ENUM ('STANDARD', 'DEEP', 'MOVE_OUT');

-- CreateEnum
CREATE TYPE "CleaningStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TENANT',
    "trade" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "description" TEXT,
    "floors" INTEGER NOT NULL DEFAULT 3,
    "photos" TEXT[],

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "type" "UnitType" NOT NULL,
    "floor" INTEGER NOT NULL,
    "sizeSqm" INTEGER,
    "rooms" TEXT[],
    "rentAmount" INTEGER NOT NULL,
    "depositAmount" INTEGER NOT NULL,
    "description" TEXT,
    "photos" TEXT[],
    "status" "UnitStatus" NOT NULL DEFAULT 'VACANT',

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "moveInDate" TIMESTAMP(3),
    "notes" TEXT,
    "holdExpiresAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "bookingDecision" "BookingDecision",
    "bookingKeepReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lease" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "rentAmount" INTEGER NOT NULL,
    "rentCycle" "RentCycle" NOT NULL DEFAULT 'MONTHLY',
    "depositAmount" INTEGER NOT NULL,
    "depositStatus" "DepositStatus" NOT NULL DEFAULT 'UNPAID',
    "status" "LeaseStatus" NOT NULL DEFAULT 'PENDING_DEPOSIT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "leaseId" TEXT,
    "applicationId" TEXT,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paystackReference" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "paystackRefundId" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRequest" (
    "id" TEXT NOT NULL,
    "ticketNo" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "scope" "TicketScope" NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "room" TEXT,
    "sharedFloor" "SharedFloor",
    "description" TEXT NOT NULL,
    "media" TEXT[],
    "urgency" "Urgency" NOT NULL DEFAULT 'NORMAL',
    "preferredVisitAt" TIMESTAMP(3),
    "preferredSlot" TEXT,
    "permissionToEnter" BOOLEAN NOT NULL DEFAULT false,
    "status" "TicketStatus" NOT NULL DEFAULT 'REPORTED',
    "assignedStaffId" TEXT,
    "externalName" TEXT,
    "externalPhone" TEXT,
    "externalTrade" TEXT,
    "visitAt" TIMESTAMP(3),
    "repairCost" INTEGER,
    "payer" "Payer",
    "damageInvoiceId" TEXT,
    "seenAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "fixedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketComment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "media" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildingNotice" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "TicketCategory",
    "ticketId" TEXT,
    "expectedFixAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuildingNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "serviceType" "CleaningType" NOT NULL,
    "preferredDate" TIMESTAMP(3) NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "status" "CleaningStatus" NOT NULL DEFAULT 'REQUESTED',
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CleaningRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_propertyId_unitNumber_key" ON "Unit"("propertyId", "unitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paystackReference_key" ON "Payment"("paystackReference");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceRequest_ticketNo_key" ON "MaintenanceRequest"("ticketNo");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceRequest_damageInvoiceId_key" ON "MaintenanceRequest"("damageInvoiceId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_status_urgency_idx" ON "MaintenanceRequest"("status", "urgency");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningRequest_invoiceId_key" ON "CleaningRequest"("invoiceId");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_damageInvoiceId_fkey" FOREIGN KEY ("damageInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MaintenanceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingNotice" ADD CONSTRAINT "BuildingNotice_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingNotice" ADD CONSTRAINT "BuildingNotice_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MaintenanceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningRequest" ADD CONSTRAINT "CleaningRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningRequest" ADD CONSTRAINT "CleaningRequest_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningRequest" ADD CONSTRAINT "CleaningRequest_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
