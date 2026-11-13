-- 0009's token check used {64,512}; PostgreSQL caps regex repetition at 255, so every insert failed.
begin;
alter table public.push_tokens drop constraint push_tokens_token_check;
alter table public.push_tokens add constraint push_tokens_token_check
  check (token ~ '^[0-9a-f]+$' and char_length(token) between 64 and 512);
commit;
