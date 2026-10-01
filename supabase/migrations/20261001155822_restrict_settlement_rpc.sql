-- Settlement mutations are private authenticated operations, never anonymous APIs.
revoke execute on function public.create_settled_actual(jsonb, jsonb) from public, anon;
grant execute on function public.create_settled_actual(jsonb, jsonb) to authenticated;

revoke execute on function public.reverse_actual(uuid) from public, anon;
grant execute on function public.reverse_actual(uuid) to authenticated;
