-- CreateTable
CREATE TABLE "inbox_events" (
    "id" VARCHAR(128) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_events_processed_at_idx" ON "inbox_events"("processed_at");

