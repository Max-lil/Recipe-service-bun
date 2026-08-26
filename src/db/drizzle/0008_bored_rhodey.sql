ALTER TABLE "users" ADD COLUMN "username" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_username" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "uk_users_username" UNIQUE("username");