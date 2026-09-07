CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`workshop_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`code` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`q1_score` real,
	`q1_rating` integer,
	`q2_score` real,
	`q2_rating` integer,
	`q3_score` real,
	`q3_rating` integer,
	`q4_score` real,
	`q4_rating` integer,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`workshop_id`) REFERENCES `workshops`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "q1_valid" CHECK((q1_score IS NULL AND q1_rating IS NULL) OR (q1_score IS NOT NULL AND q1_rating IS NOT NULL AND q1_score BETWEEN 0 AND 100 AND q1_rating BETWEEN 1 AND 5)),
	CONSTRAINT "q2_valid" CHECK((q2_score IS NULL AND q2_rating IS NULL) OR (q2_score IS NOT NULL AND q2_rating IS NOT NULL AND q2_score BETWEEN 0 AND 100 AND q2_rating BETWEEN 1 AND 5)),
	CONSTRAINT "q3_valid" CHECK((q3_score IS NULL AND q3_rating IS NULL) OR (q3_score IS NOT NULL AND q3_rating IS NOT NULL AND q3_score BETWEEN 0 AND 100 AND q3_rating BETWEEN 1 AND 5)),
	CONSTRAINT "q4_valid" CHECK((q4_score IS NULL AND q4_rating IS NULL) OR (q4_score IS NOT NULL AND q4_rating IS NOT NULL AND q4_score BETWEEN 0 AND 100 AND q4_rating BETWEEN 1 AND 5))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_workshop_email` ON `students` (`email`,`workshop_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `students_workshop_code` ON `students` (`workshop_id`,`code`);--> statement-breakpoint
CREATE TABLE `workshops` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
