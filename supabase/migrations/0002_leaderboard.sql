-- Leaderboard support: optional player display name on results, and an index
-- for the all-time aggregation scan.

alter table game_results
  add column if not exists display_name text
  check (display_name is null or char_length(display_name) between 1 and 24);

create index if not exists game_results_finished_at_idx
  on game_results (finished_at desc);
