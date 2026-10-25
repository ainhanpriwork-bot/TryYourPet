-- Storage buckets. Run after schema.sql, in the same SQL Editor.
-- pet-media: public, holds pet photos shown on the website.
-- proofs:    private, holds bank-transfer screenshots; only the admin page can open them (short-lived links).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('pet-media', 'pet-media', true,  5242880, array['image/jpeg','image/png','image/webp']),
  ('proofs',    'proofs',    false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
