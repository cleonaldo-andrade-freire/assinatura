-- ============================================================
-- 048 — Trigger: criar profile do membro convidado ao confirmar e-mail
--
-- Quando o dentista (owner) convida uma atendente via
-- /dashboard/configuracoes/equipe, a API passa `clinic_id` e `role`
-- em `raw_user_meta_data`. Este trigger detecta a confirmação do convite
-- e insere o registro em `profiles` automaticamente, sem precisar de
-- intervenção manual no Supabase.
-- ============================================================

-- Função chamada logo após confirmação de e-mail de convite
create or replace function public.handle_staff_invite_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_role      user_role;
begin
  -- Só age se o metadata contiver clinic_id (convite gerado pela app)
  v_clinic_id := (new.raw_user_meta_data ->> 'clinic_id')::uuid;
  if v_clinic_id is null then
    return new;
  end if;

  v_role := coalesce(
    (new.raw_user_meta_data ->> 'role')::user_role,
    'staff'
  );

  -- Insere o profile vinculando o novo usuário à clínica do dentista
  insert into public.profiles (id, clinic_id, email, role)
  values (new.id, v_clinic_id, new.email, v_role)
  on conflict (id) do update
    set clinic_id = excluded.clinic_id,
        role      = excluded.role;

  return new;
end;
$$;

-- Trigger: dispara quando confirmed_at muda de NULL para preenchido
-- (ou seja, no momento em que o usuário clica no link do e-mail de convite)
drop trigger if exists on_staff_invite_confirmed on auth.users;
create trigger on_staff_invite_confirmed
  after update on auth.users
  for each row
  when (old.confirmed_at is null and new.confirmed_at is not null)
  execute procedure public.handle_staff_invite_confirmed();
