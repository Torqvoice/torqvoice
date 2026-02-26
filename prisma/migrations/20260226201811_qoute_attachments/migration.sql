-- CreateTable
CREATE TABLE "quote_attachments" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'image',
    "description" TEXT,
    "includeInInvoice" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quoteId" TEXT NOT NULL,

    CONSTRAINT "quote_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_attachments_quoteId_idx" ON "quote_attachments"("quoteId");

-- AddForeignKey
ALTER TABLE "quote_attachments" ADD CONSTRAINT "quote_attachments_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
