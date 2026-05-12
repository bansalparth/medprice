-- AlterTable: SearchLog
ALTER TABLE "SearchLog"
  ADD COLUMN     "sid" TEXT,
  ADD COLUMN     "pincode" TEXT,
  ADD COLUMN     "city" TEXT,
  ADD COLUMN     "state" TEXT,
  ADD COLUMN     "latencyMs" INTEGER,
  ADD COLUMN     "autocompletePicked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "refinedFromId" TEXT;

CREATE INDEX "SearchLog_createdAt_idx" ON "SearchLog"("createdAt");
CREATE INDEX "SearchLog_sid_createdAt_idx" ON "SearchLog"("sid", "createdAt");
CREATE INDEX "SearchLog_pincode_idx" ON "SearchLog"("pincode");
CREATE INDEX "SearchLog_medicineId_createdAt_idx" ON "SearchLog"("medicineId", "createdAt");

-- AlterTable: ClickLog
ALTER TABLE "ClickLog"
  ADD COLUMN     "sid" TEXT,
  ADD COLUMN     "searchLogId" TEXT,
  ADD COLUMN     "position" INTEGER,
  ADD COLUMN     "sellingPriceAtClick" DOUBLE PRECISION,
  ADD COLUMN     "mrpAtClick" DOUBLE PRECISION,
  ADD COLUMN     "isCheapestShown" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "isJanAushadhi" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "pincode" TEXT;

CREATE INDEX "ClickLog_createdAt_idx" ON "ClickLog"("createdAt");
CREATE INDEX "ClickLog_sid_createdAt_idx" ON "ClickLog"("sid", "createdAt");
CREATE INDEX "ClickLog_searchLogId_idx" ON "ClickLog"("searchLogId");
CREATE INDEX "ClickLog_pharmacyName_createdAt_idx" ON "ClickLog"("pharmacyName", "createdAt");

ALTER TABLE "ClickLog" ADD CONSTRAINT "ClickLog_searchLogId_fkey" FOREIGN KEY ("searchLogId") REFERENCES "SearchLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: Session
CREATE TABLE "Session" (
    "sid" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "deviceClass" TEXT,
    "referrer" TEXT,
    "pincode" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "locationSource" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX "Session_firstSeenAt_idx" ON "Session"("firstSeenAt");
CREATE INDEX "Session_lastSeenAt_idx" ON "Session"("lastSeenAt");
CREATE INDEX "Session_state_city_idx" ON "Session"("state", "city");
CREATE INDEX "Session_pincode_idx" ON "Session"("pincode");

-- CreateTable: PageView
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL,
    "sid" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referrer" TEXT,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PageView_sid_createdAt_idx" ON "PageView"("sid", "createdAt");
CREATE INDEX "PageView_createdAt_idx" ON "PageView"("createdAt");
CREATE INDEX "PageView_path_createdAt_idx" ON "PageView"("path", "createdAt");

-- CreateTable: OcrUpload
CREATE TABLE "OcrUpload" (
    "id" TEXT NOT NULL,
    "sid" TEXT,
    "fileSizeBytes" INTEGER,
    "mimeType" TEXT,
    "medsExtracted" INTEGER NOT NULL DEFAULT 0,
    "succeeded" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrUpload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OcrUpload_createdAt_idx" ON "OcrUpload"("createdAt");
CREATE INDEX "OcrUpload_sid_idx" ON "OcrUpload"("sid");

-- CreateTable: ApiLog
CREATE TABLE "ApiLog" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "ms" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiLog_createdAt_route_idx" ON "ApiLog"("createdAt", "route");
CREATE INDEX "ApiLog_statusCode_createdAt_idx" ON "ApiLog"("statusCode", "createdAt");

-- CreateTable: SearchImpression
CREATE TABLE "SearchImpression" (
    "id" TEXT NOT NULL,
    "searchLogId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "pharmacyName" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "sellingPrice" DOUBLE PRECISION,
    "mrp" DOUBLE PRECISION,
    "isJanAushadhi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchImpression_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SearchImpression_searchLogId_idx" ON "SearchImpression"("searchLogId");
CREATE INDEX "SearchImpression_pharmacyName_createdAt_idx" ON "SearchImpression"("pharmacyName", "createdAt");
CREATE INDEX "SearchImpression_createdAt_idx" ON "SearchImpression"("createdAt");

ALTER TABLE "SearchImpression" ADD CONSTRAINT "SearchImpression_searchLogId_fkey" FOREIGN KEY ("searchLogId") REFERENCES "SearchLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
