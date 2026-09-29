-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "auto_period" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "auto_invoice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billing_day" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "domains" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "registrar" TEXT,
    "project_id" UUID,
    "expires_at" DATE,
    "renewal_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KZT',
    "notes" TEXT,
    "expiry_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_log" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "kind" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "due_at" DATE NOT NULL,
    "threshold" INTEGER NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domains_name_key" ON "domains"("name");

-- CreateIndex
CREATE INDEX "domains_project_id_idx" ON "domains"("project_id");

-- CreateIndex
CREATE INDEX "domains_expires_at_idx" ON "domains"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_log_kind_entity_id_due_at_threshold_key" ON "reminder_log"("kind", "entity_id", "due_at", "threshold");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_project_id_auto_period_key" ON "invoices"("project_id", "auto_period");

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
