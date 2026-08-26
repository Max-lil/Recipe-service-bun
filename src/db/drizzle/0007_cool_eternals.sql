ALTER TABLE "recipes" ADD COLUMN "user_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "fk_recipes_user_id" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "uk_recipes_user_url" UNIQUE("user_id","url");