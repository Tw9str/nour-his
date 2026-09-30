ALTER TABLE "User"
  DROP COLUMN "mfaSecret",
  DROP COLUMN "mfaPending",
  DROP COLUMN "mfaPendingAt",
  DROP COLUMN "mfaCounter";
