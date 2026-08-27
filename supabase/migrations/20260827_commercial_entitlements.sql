-- Nexora commercial foundations: per-garage plan and purchased capabilities.
-- Apply this migration in Supabase before deploying code that enforces feature access.

create table if not exists public.garage_entitlements (
  garage_id uuid primary key references public.garages(id) on delete cascade,
  plan_code text not null default 'pilot'
    check (plan_code in ('pilot', 'essential', 'business', 'custom')),
  enabled_features text[] not null default array[]::text[]
    check (enabled_features <@ array[
      'gmail',
      'google_calendar',
      'sms',
      'whatsapp',
      'online_payment',
      'automations',
      'invoicing',
      'parts_assistant',
      'accounting_ai',
      'analytics'
    ]::text[]),
  trial_ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (plan_code <> 'pilot' or trial_ends_at is not null)
);

alter table public.garage_entitlements enable row level security;
revoke all on table public.garage_entitlements from anon;
revoke insert, update, delete on table public.garage_entitlements from authenticated;
grant select on table public.garage_entitlements to authenticated;

-- A garage can see its purchased options, but never grant itself more options.
create policy "Garage owner reads its entitlements"
  on public.garage_entitlements
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.garages
      where garages.id = garage_entitlements.garage_id
        and garages.owner_user_id = auth.uid()
    )
  );

create or replace function public.touch_garage_entitlements_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_garage_entitlements_updated_at
  before update on public.garage_entitlements
  for each row execute function public.touch_garage_entitlements_updated_at();

create or replace function public.garage_has_active_feature(p_garage_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.garage_entitlements entitlements
    where entitlements.garage_id = p_garage_id
      and entitlements.active is true
      and (entitlements.trial_ends_at is null or entitlements.trial_ends_at > now())
      and p_feature = any(entitlements.enabled_features)
  );
$$;

-- A garage cannot enable automatic sending unless the option is active and unexpired.
create or replace function public.enforce_garage_automation_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.automatisation_active is true
    and not public.garage_has_active_feature(new.id, 'automations') then
    raise exception 'AUTOMATION_FEATURE_NOT_ENABLED';
  end if;
  return new;
end;
$$;

create trigger enforce_garage_automation_entitlement
  before insert or update of automatisation_active on public.garages
  for each row execute function public.enforce_garage_automation_entitlement();

-- Removing or expiring the option immediately switches automatic sending off.
create or replace function public.disable_unentitled_garage_automation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active is false
    or (new.trial_ends_at is not null and new.trial_ends_at <= now())
    or not ('automations' = any(new.enabled_features)) then
    update public.garages
      set automatisation_active = false
      where id = new.garage_id
        and automatisation_active is true;
  end if;
  return new;
end;
$$;

create trigger disable_unentitled_garage_automation
  after insert or update of active, trial_ends_at, enabled_features on public.garage_entitlements
  for each row execute function public.disable_unentitled_garage_automation();

-- Direct API calls cannot select SMS or WhatsApp when those options are absent.
create or replace function public.enforce_garage_channel_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if position('"sms"' in coalesce(new.canaux_notifications::text, '')) > 0
    and not public.garage_has_active_feature(new.id, 'sms') then
    raise exception 'SMS_FEATURE_NOT_ENABLED';
  end if;
  if (
      position('"whatsapp"' in coalesce(new.canaux_notifications::text, '')) > 0
      or coalesce(new.numero_whatsapp, '') <> ''
    ) and not public.garage_has_active_feature(new.id, 'whatsapp') then
    raise exception 'WHATSAPP_FEATURE_NOT_ENABLED';
  end if;
  return new;
end;
$$;

create trigger enforce_garage_channel_entitlements
  before insert or update of canaux_notifications, numero_whatsapp on public.garages
  for each row execute function public.enforce_garage_channel_entitlements();

-- A hidden payment field cannot be bypassed with a direct Supabase request.
create or replace function public.enforce_rendez_vous_payment_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.lien_paiement, '') <> ''
    and not public.garage_has_active_feature(new.garage_id, 'online_payment') then
    raise exception 'ONLINE_PAYMENT_FEATURE_NOT_ENABLED';
  end if;
  return new;
end;
$$;

create trigger enforce_rendez_vous_payment_entitlement
  before insert or update of lien_paiement on public.rendez_vous
  for each row execute function public.enforce_rendez_vous_payment_entitlement();

revoke all on function public.touch_garage_entitlements_updated_at() from public, anon, authenticated;
revoke all on function public.garage_has_active_feature(uuid, text) from public, anon, authenticated;
revoke all on function public.enforce_garage_automation_entitlement() from public, anon, authenticated;
revoke all on function public.disable_unentitled_garage_automation() from public, anon, authenticated;
revoke all on function public.enforce_garage_channel_entitlements() from public, anon, authenticated;
revoke all on function public.enforce_rendez_vous_payment_entitlement() from public, anon, authenticated;

-- Recommended pilot assignment (run only after replacing the garage UUID):
-- insert into public.garage_entitlements (garage_id, plan_code, enabled_features, trial_ends_at)
-- values ('GARAGE_UUID', 'pilot', array['gmail', 'invoicing', 'analytics'], now() + interval '30 days')
-- on conflict (garage_id) do update set
--   plan_code = excluded.plan_code,
--   enabled_features = excluded.enabled_features,
--   trial_ends_at = excluded.trial_ends_at,
--   active = true;
