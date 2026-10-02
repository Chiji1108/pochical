CREATE TABLE `order_clears` (
	`from_date` text PRIMARY KEY NOT NULL,
	`hlc_counter` integer NOT NULL,
	`hlc_device` text NOT NULL,
	`hlc_ms` integer NOT NULL
);
