-- CreateTable
CREATE TABLE "kv_entries" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kv_entries_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "kv_entries_expires_at_idx" ON "kv_entries"("expires_at");
