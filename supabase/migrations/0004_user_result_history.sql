-- Faster signed-in archive/result history reads.

create index if not exists game_results_user_finished_at_idx
  on game_results (user_id, finished_at desc)
  where user_id is not null;
