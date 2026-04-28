-- CreateTable
CREATE TABLE "Medicine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "brandName" TEXT,
    "manufacturer" TEXT,
    "saltComposition" TEXT,
    "ingredients" TEXT,
    "dosageForm" TEXT,
    "packSize" TEXT,
    "category" TEXT,
    "description" TEXT,
    "isCatalog" BOOLEAN NOT NULL DEFAULT false,
    "prescriptionRequired" BOOLEAN NOT NULL DEFAULT false,
    "soldOnline" BOOLEAN NOT NULL DEFAULT true,
    "uses" TEXT,
    "howItWorks" TEXT,
    "sideEffects" TEXT,
    "warnings" TEXT,
    "storage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyListing" (
    "id" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "pharmacyName" TEXT NOT NULL,
    "brandName" TEXT,
    "productName" TEXT NOT NULL,
    "packSize" TEXT,
    "mrp" DOUBLE PRECISION,
    "sellingPrice" DOUBLE PRECISION,
    "discountPercent" DOUBLE PRECISION,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "productUrl" TEXT,
    "deliveryEta" TEXT,
    "pincode" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JanAushadhiProduct" (
    "id" TEXT NOT NULL,
    "drugCode" TEXT NOT NULL,
    "genericName" TEXT NOT NULL,
    "saltComposition" TEXT,
    "unitSize" TEXT,
    "mrpBppi" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JanAushadhiProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JanAushadhiStore" (
    "id" TEXT NOT NULL,
    "kendraId" TEXT NOT NULL,
    "state" TEXT,
    "district" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "JanAushadhiStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaltMapping" (
    "id" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "janAushadhiProductId" TEXT NOT NULL,
    "matchConfidence" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaltMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeJob" (
    "id" TEXT NOT NULL,
    "pharmacy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "medicinesScraped" INTEGER,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "ScrapeJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchLog" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "medicineId" TEXT,
    "inputMethod" TEXT NOT NULL,
    "resultsCount" INTEGER,
    "janAushadhiMatch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClickLog" (
    "id" TEXT NOT NULL,
    "pharmacyName" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "productUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClickLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "pharmacyName" TEXT NOT NULL,
    "sellingPrice" DOUBLE PRECISION,
    "mrp" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Medicine_normalizedName_key" ON "Medicine"("normalizedName");

-- CreateIndex
CREATE INDEX "Medicine_normalizedName_idx" ON "Medicine"("normalizedName");

-- CreateIndex
CREATE INDEX "Medicine_brandName_idx" ON "Medicine"("brandName");

-- CreateIndex
CREATE INDEX "PharmacyListing_medicineId_idx" ON "PharmacyListing"("medicineId");

-- CreateIndex
CREATE INDEX "PharmacyListing_pharmacyName_idx" ON "PharmacyListing"("pharmacyName");

-- CreateIndex
CREATE INDEX "PharmacyListing_scrapedAt_idx" ON "PharmacyListing"("scrapedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JanAushadhiProduct_drugCode_key" ON "JanAushadhiProduct"("drugCode");

-- CreateIndex
CREATE UNIQUE INDEX "JanAushadhiStore_kendraId_key" ON "JanAushadhiStore"("kendraId");

-- CreateIndex
CREATE UNIQUE INDEX "SaltMapping_medicineId_janAushadhiProductId_key" ON "SaltMapping"("medicineId", "janAushadhiProductId");

-- CreateIndex
CREATE INDEX "PriceHistory_medicineId_pharmacyName_recordedAt_idx" ON "PriceHistory"("medicineId", "pharmacyName", "recordedAt");

-- CreateIndex
CREATE INDEX "PriceHistory_medicineId_recordedAt_idx" ON "PriceHistory"("medicineId", "recordedAt");

-- AddForeignKey
ALTER TABLE "PharmacyListing" ADD CONSTRAINT "PharmacyListing_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaltMapping" ADD CONSTRAINT "SaltMapping_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaltMapping" ADD CONSTRAINT "SaltMapping_janAushadhiProductId_fkey" FOREIGN KEY ("janAushadhiProductId") REFERENCES "JanAushadhiProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchLog" ADD CONSTRAINT "SearchLog_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
