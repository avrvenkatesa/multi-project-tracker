CREATE TABLE "action_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"priority" varchar(20) DEFAULT 'medium',
	"category" varchar(50) DEFAULT 'General',
	"phase" varchar(50),
	"component" varchar(50),
	"assignee" varchar(100),
	"due_date" timestamp,
	"progress" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'To Do',
	"project_id" integer NOT NULL,
	"type" varchar(20) DEFAULT 'action-item',
	"milestone" varchar(100),
	"is_deliverable" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"priority" varchar(20) DEFAULT 'medium',
	"category" varchar(50) DEFAULT 'General',
	"phase" varchar(50),
	"component" varchar(50),
	"assignee" varchar(100),
	"due_date" timestamp,
	"status" varchar(20) DEFAULT 'To Do',
	"project_id" integer NOT NULL,
	"type" varchar(20) DEFAULT 'issue',
	"milestone" varchar(100),
	"is_deliverable" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"template" varchar(50) DEFAULT 'generic',
	"status" varchar(20) DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(100) NOT NULL,
	"password" varchar(255) NOT NULL,
	"role" varchar(50) DEFAULT 'Team Member',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
