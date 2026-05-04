-- AlterTable
ALTER TABLE "PharmacyListing" ADD COLUMN     "locationPrice" DOUBLE PRECISION,
ADD COLUMN     "serviceable" BOOLEAN NOT NULL DEFAULT true;
