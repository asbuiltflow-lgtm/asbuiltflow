import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('lifecycle migration defines tenant-scoped V1 resources and guarded command API', async()=>{
  const sql=await readFile(new URL('../supabase/migrations/202609220000_lifecycle_v1.sql',import.meta.url),'utf8');
  for(const table of ['construction_packages','construction_package_files','field_changes','project_assets','asset_imports']) assert.match(sql,new RegExp(`create table public\\.${table}\\b`));
  for(const table of ['construction_packages','construction_package_files','field_changes','project_assets','asset_imports']) assert.match(sql,new RegExp(`create policy abf_.* on public\\.${table}`));
  assert.match(sql,/create or replace function public\.abf_lifecycle_command/);
  assert.match(sql,/public\.abf_write\(pid\)/);
  assert.match(sql,/status='superseded'/);
  assert.match(sql,/create unique index construction_packages_one_released/);
  assert.doesNotMatch(sql,/drop table|truncate table|delete from/i);
});
