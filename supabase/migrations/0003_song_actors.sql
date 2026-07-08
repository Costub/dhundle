-- Actor hint support.

alter table songs
  add column if not exists actors text[] not null default '{}';
