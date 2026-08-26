ALTER TABLE "account" DROP CONSTRAINT "uk_account_provider_account";--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "issuer" text NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "uk_account_issuer_account" UNIQUE("issuer","account_id");