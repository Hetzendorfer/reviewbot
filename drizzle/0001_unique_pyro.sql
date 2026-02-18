CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_user_id" integer NOT NULL,
	"github_username" text NOT NULL,
	"github_avatar" text,
	"access_token_encrypted" text NOT NULL,
	"access_token_iv" text NOT NULL,
	"access_token_auth_tag" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
