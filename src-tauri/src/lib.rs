mod application;
mod commands;
mod commercial;
mod database;
mod licensing;
mod logging;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let logger = logging::initialize(app.handle())
                .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })?;
            app.manage(logger);
            database::initialize(app.handle())
                .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })?;
            application::continuity::finalize_startup(app.handle())
                .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })?;
            tracing::info!("CaixaSimples - Bratec iniciado");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::database_status,
            commands::commercial_plans,
            commands::commercial_status,
            commands::commercial_build_info,
            commands::commercial_create_checkout,
            commands::commercial_activate_beta,
            commands::commercial_refresh_entitlement,
            commands::onboarding_status,
            commands::initial_configuration,
            commands::complete_onboarding,
            commands::list_contacts,
            commands::get_contact,
            commands::contact_duplicates,
            commands::save_contact,
            commands::list_reference_data,
            commands::save_category,
            commands::save_account,
            commands::save_payment_method,
            commands::list_catalog,
            commands::save_catalog_item,
            commands::set_master_active,
            commands::delete_master,
            commands::read_contact_csv,
            commands::preview_contact_import,
            commands::import_contacts,
            commands::create_contact_csv_template,
            commands::export_contacts,
            commands::finance_options,
            commands::list_financial_entries,
            commands::get_financial_entry,
            commands::save_financial_entry,
            commands::settle_financial_entry,
            commands::create_financial_transfer,
            commands::cancel_financial_entry,
            commands::reschedule_financial_entry,
            commands::reverse_financial_entry,
            commands::list_recurrences,
            commands::set_recurrence_active,
            commands::generate_recurrences,
            commands::list_obligations,
            commands::financial_cash_flow,
            commands::management_dashboard,
            commands::management_goal,
            commands::save_management_goal,
            commands::report_options,
            commands::preview_report,
            commands::export_report_csv,
            commands::export_report_pdf,
            commands::sales_options,
            commands::list_sales,
            commands::get_sale,
            commands::save_sale,
            commands::cancel_sale,
            commands::export_sale_receipt_pdf,
            commands::phase2_status,
            commands::activate_license_file,
            commands::load_demo_data,
            commands::remove_demo_data,
            commands::open_user_manual,
            commands::create_backup,
            commands::inspect_backup,
            commands::restore_backup,
            commands::continuity_overview,
            commands::save_backup_settings,
            commands::run_automatic_backup,
            commands::create_diagnostic_package,
            commands::inspect_update,
            commands::prepare_update
        ])
        .run(tauri::generate_context!())
        .expect("erro ao executar o CaixaSimples - Bratec");
}
