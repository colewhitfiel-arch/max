-- CreateIndex
CREATE INDEX "ai_conversations_student_id_idx" ON "ai_conversations"("student_id");

-- CreateIndex
CREATE INDEX "assignments_teacher_id_idx" ON "assignments"("teacher_id");

-- CreateIndex
CREATE INDEX "block_progress_block_id_idx" ON "block_progress"("block_id");

-- CreateIndex
CREATE INDEX "course_progress_course_id_idx" ON "course_progress"("course_id");

-- CreateIndex
CREATE INDEX "paid_periods_payment_id_idx" ON "paid_periods"("payment_id");

-- CreateIndex
CREATE INDEX "payments_enrollment_id_idx" ON "payments"("enrollment_id");

