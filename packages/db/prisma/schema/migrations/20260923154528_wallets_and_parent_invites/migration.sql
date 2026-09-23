-- CreateEnum
CREATE TYPE "WalletTransactionKind" AS ENUM ('INCOME', 'WITHDRAWAL');

-- CreateTable
CREATE TABLE "parent_invites" (
    "token" TEXT NOT NULL,
    "parent_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "accepted_at" TIMESTAMPTZ,
    "accepted_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_invites_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "parent_wallets" (
    "parent_id" UUID NOT NULL,
    "balance_kopecks" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_wallets_pkey" PRIMARY KEY ("parent_id")
);

-- CreateTable
CREATE TABLE "teacher_wallet_transactions" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "kind" "WalletTransactionKind" NOT NULL,
    "amount_kopecks" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "group_id" UUID,
    "student_id" UUID,
    "payment_id" UUID,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parent_invites_parent_id_created_at_idx" ON "parent_invites"("parent_id", "created_at");

-- CreateIndex
CREATE INDEX "teacher_wallet_transactions_teacher_id_at_idx" ON "teacher_wallet_transactions"("teacher_id", "at");

-- AddForeignKey
ALTER TABLE "parent_invites" ADD CONSTRAINT "parent_invites_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_wallets" ADD CONSTRAINT "parent_wallets_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_wallet_transactions" ADD CONSTRAINT "teacher_wallet_transactions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_wallet_transactions" ADD CONSTRAINT "teacher_wallet_transactions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_wallet_transactions" ADD CONSTRAINT "teacher_wallet_transactions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
