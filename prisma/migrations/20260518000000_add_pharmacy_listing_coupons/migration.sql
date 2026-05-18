-- Add unconditional pricing + conditional coupon fields to PharmacyListing.
-- Used by lib/scrapers/pharmeasy.ts to record the assured/coupon-applied prices
-- separately, so we rank pharmacies by the price the user actually pays without
-- any conditional discount.

ALTER TABLE "PharmacyListing"
  ADD COLUMN "baseSellingPrice" DOUBLE PRECISION,
  ADD COLUMN "baseDiscountPercent" DOUBLE PRECISION,
  ADD COLUMN "couponCode" TEXT,
  ADD COLUMN "couponMinCart" DOUBLE PRECISION,
  ADD COLUMN "couponAppOnly" BOOLEAN,
  ADD COLUMN "couponFinalPrice" DOUBLE PRECISION;
