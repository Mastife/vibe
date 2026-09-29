-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "currency" SET DEFAULT 'KZT';

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "currency" SET DEFAULT 'KZT';

-- AlterTable
ALTER TABLE "servers" ALTER COLUMN "currency" SET DEFAULT 'KZT';

-- Panel works in tenge only: move existing rows off the old RUB default.
UPDATE "projects" SET "currency" = 'KZT' WHERE "currency" = 'RUB';
UPDATE "servers" SET "currency" = 'KZT' WHERE "currency" = 'RUB';
UPDATE "invoices" SET "currency" = 'KZT' WHERE "currency" = 'RUB';
