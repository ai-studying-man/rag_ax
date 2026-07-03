grant usage on schema public to anon, authenticated;
grant select on public.dapa_rag_assignment_chunks to anon, authenticated;
grant execute on function public.dapa_rag_assignment_match_chunks(extensions.vector, integer, double precision) to anon, authenticated;
grant execute on function public.dapa_rag_assignment_keyword_chunks(text, integer) to anon, authenticated;

drop policy if exists dapa_rag_assignment_public_read on public.dapa_rag_assignment_chunks;
create policy dapa_rag_assignment_public_read
on public.dapa_rag_assignment_chunks
for select
to anon, authenticated
using (metadata ->> 'security_level' = 'public_sample');
