-- O teste comercial é permanente e limitado exclusivamente por operações criadas.
UPDATE app_license
SET trial_ends_at = NULL,
    trial_entry_limit = 50,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE activation_status = 'TRIAL';
