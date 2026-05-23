-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'THEORY', 'FILL_IN_BLANK', 'TRUE_FALSE');

-- CreateEnum
CREATE TYPE "QuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "AskRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "question_bank" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "class_level" TEXT,
    "topic" TEXT,
    "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "type" "QuestionType" NOT NULL DEFAULT 'MCQ',
    "question" TEXT NOT NULL,
    "options" JSONB,
    "answer" TEXT NOT NULL,
    "explanation" TEXT,
    "model" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "question_bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ask_conversations" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ask_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ask_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "AskRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ask_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_bank_school_id_subject_id_idx" ON "question_bank"("school_id", "subject_id");

-- CreateIndex
CREATE INDEX "question_bank_school_id_class_level_idx" ON "question_bank"("school_id", "class_level");

-- CreateIndex
CREATE INDEX "question_bank_deleted_at_idx" ON "question_bank"("deleted_at");

-- CreateIndex
CREATE INDEX "ask_conversations_school_id_user_id_updated_at_idx" ON "ask_conversations"("school_id", "user_id", "updated_at");

-- CreateIndex
CREATE INDEX "ask_conversations_deleted_at_idx" ON "ask_conversations"("deleted_at");

-- CreateIndex
CREATE INDEX "ask_messages_conversation_id_created_at_idx" ON "ask_messages"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ask_conversations" ADD CONSTRAINT "ask_conversations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ask_conversations" ADD CONSTRAINT "ask_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ask_messages" ADD CONSTRAINT "ask_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ask_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

