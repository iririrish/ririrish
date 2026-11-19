-- Run once in Supabase > SQL Editor (free plan, no billing needed).
-- Creates a public bucket limited to small WebP files and lets the website add, read and delete images in it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('thesis-images', 'thesis-images', true, 2097152, array['image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/webp'];

create policy "thesis images insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'thesis-images' and name like 'images/%');
create policy "thesis images select" on storage.objects for select to anon, authenticated
  using (bucket_id = 'thesis-images');
create policy "thesis images delete" on storage.objects for delete to anon, authenticated
  using (bucket_id = 'thesis-images' and name like 'images/%');
