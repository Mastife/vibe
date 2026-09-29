-- CreateEnum
CREATE TYPE "PilotOutcome" AS ENUM ('CONTINUE', 'DECLINE');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "pilot_ends_at" DATE,
ADD COLUMN     "pilot_outcome" "PilotOutcome",
ADD COLUMN     "pilot_starts_at" DATE;
