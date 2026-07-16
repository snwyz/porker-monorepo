/*
  Warnings:

  - Added the required column `payloadHash` to the `LedgerTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LedgerTransaction" ADD COLUMN     "payloadHash" TEXT NOT NULL;
