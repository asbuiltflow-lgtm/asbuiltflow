-- Manual, pre-launch rollback only. NEVER run against populated feature tables.
-- A populated installation requires a separately approved forward repair or maintenance rollback.
begin;
do $$ begin
if exists(select 1 from public.closeout_requirements) or exists(select 1 from public.closeout_submissions) then
raise exception 'Rollback refused: closeout history exists. Preserve data and use a reviewed forward repair.';
end if;
end $$;
drop function public.abf_closeout_command(text,jsonb);
drop function public.abf_closeout_state(uuid);
drop table public.completeness_reviews,public.submission_evidence,public.closeout_submissions,public.evidence_versions,public.deliverables,public.closeout_requirements;
commit;
