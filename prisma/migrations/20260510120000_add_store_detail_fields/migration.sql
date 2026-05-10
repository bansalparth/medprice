-- AlterTable
ALTER TABLE "JanAushadhiStore" ADD COLUMN "block" TEXT;
ALTER TABLE "JanAushadhiStore" ADD COLUMN "pincode" TEXT;
ALTER TABLE "JanAushadhiStore" ADD COLUMN "contactPerson" TEXT;
ALTER TABLE "JanAushadhiStore" ADD COLUMN "contactDetails" TEXT;

-- CreateIndex
CREATE INDEX "JanAushadhiStore_state_idx" ON "JanAushadhiStore"("state");
CREATE INDEX "JanAushadhiStore_district_idx" ON "JanAushadhiStore"("district");
CREATE INDEX "JanAushadhiStore_pincode_idx" ON "JanAushadhiStore"("pincode");
