-- Staging-only verification. This transaction leaves no garage or entitlement behind.
begin;

do $$
declare
  test_garage_id uuid := gen_random_uuid();
  automation_blocked boolean := false;
  sms_blocked boolean := false;
  whatsapp_blocked boolean := false;
begin
  insert into public.garages (id, nom_garage)
  values (test_garage_id, '__NEXORA_STAGING_PILOT_TEST__');

  insert into public.garage_entitlements (
    garage_id,
    plan_code,
    enabled_features,
    trial_ends_at,
    active
  )
  values (
    test_garage_id,
    'pilot',
    array['gmail', 'invoicing', 'analytics'],
    now() + interval '30 days',
    true
  );

  if not public.garage_has_active_feature(test_garage_id, 'gmail') then
    raise exception 'PILOT_GMAIL_ACCESS_NOT_GRANTED';
  end if;

  begin
    update public.garages
    set automatisation_active = true
    where id = test_garage_id;
  exception when others then
    automation_blocked := sqlerrm = 'AUTOMATION_FEATURE_NOT_ENABLED';
  end;

  begin
    update public.garages
    set canaux_notifications = jsonb_build_object('confirmation_rdv', 'sms')
    where id = test_garage_id;
  exception when others then
    sms_blocked := sqlerrm = 'SMS_FEATURE_NOT_ENABLED';
  end;

  begin
    update public.garages
    set numero_whatsapp = '+33600000000'
    where id = test_garage_id;
  exception when others then
    whatsapp_blocked := sqlerrm = 'WHATSAPP_FEATURE_NOT_ENABLED';
  end;

  if not automation_blocked then
    raise exception 'PILOT_AUTOMATION_WAS_NOT_BLOCKED';
  end if;
  if not sms_blocked then
    raise exception 'PILOT_SMS_WAS_NOT_BLOCKED';
  end if;
  if not whatsapp_blocked then
    raise exception 'PILOT_WHATSAPP_WAS_NOT_BLOCKED';
  end if;

  raise notice 'PILOT_ENTITLEMENTS_STAGING_TEST_PASSED';
end;
$$;

rollback;
