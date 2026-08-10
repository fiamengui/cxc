use crate::application::continuity::{
    self, BackupInfo, BackupSettings, BackupSettingsInput, ContinuityOverview, Phase2Status,
    UpdateInfo,
};
use crate::application::entitlements;
use crate::application::finance::{
    self, CashFlowQuery, CashFlowResult, EntryDetail, EntryInput, EntryListQuery, EntrySummary,
    FinanceOptions, ObligationPage, ObligationQuery, Page as FinancePage, RecurrenceSummary,
    SaveEntriesResult, SettlementInput, SettlementResult, TransferInput,
};
use crate::application::management::{
    self, DashboardQuery, DashboardResult, GoalInput, GoalPerformance,
};
use crate::application::masters::{
    self, AccountInput, CatalogItem, CatalogItemInput, CategoryInput, ContactCsvMapping,
    ContactDetail, ContactImportPreview, ContactInput, ContactSummary, CsvFilePreview,
    DuplicateCandidate, ImportResult, ListQuery, Page, PaymentMethodInput, ReferenceItem,
};
use crate::application::onboarding::{
    self, InitialConfiguration, OnboardingInput, OnboardingStatus,
};
use crate::application::reports::{self, ReportOptions, ReportQuery, ReportResult};
use crate::application::sales::{
    self, Page as SalesPage, SaleDetail, SaleInput, SaleListQuery, SaleSaveResult, SaleSummary,
    SalesOptions,
};
use crate::commercial::{
    self, CheckoutRequest, CheckoutResponse, CommercialPlan, CommercialStatus,
};
use serde::Serialize;
use tauri::AppHandle;
use tauri::{path::BaseDirectory, Manager};
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseStatus {
    migration_version: u32,
}

#[tauri::command]
pub fn database_status(app: AppHandle) -> Result<DatabaseStatus, String> {
    let migration_version = crate::database::current_version(&app).map_err(|error| {
        tracing::error!(error = %error, "Falha ao consultar a versão do banco local");
        error.to_string()
    })?;
    Ok(DatabaseStatus { migration_version })
}

#[tauri::command]
pub fn commercial_plans() -> Vec<CommercialPlan> {
    commercial::plans()
}

#[tauri::command]
pub fn commercial_status(app: AppHandle) -> Result<CommercialStatus, String> {
    commercial::status(&app)
}

#[tauri::command]
pub fn commercial_create_checkout(
    app: AppHandle,
    input: CheckoutRequest,
) -> Result<CheckoutResponse, String> {
    commercial::create_checkout(&app, input)
}

#[tauri::command]
pub fn commercial_refresh_entitlement(app: AppHandle) -> Result<CommercialStatus, String> {
    let result = commercial::refresh(&app)?;
    entitlements::reconcile(&app)?;
    Ok(result)
}

#[tauri::command]
pub fn onboarding_status(app: AppHandle) -> Result<OnboardingStatus, String> {
    onboarding::status(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn initial_configuration(app: AppHandle) -> Result<InitialConfiguration, String> {
    onboarding::configuration(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn complete_onboarding(
    app: AppHandle,
    input: OnboardingInput,
) -> Result<OnboardingStatus, String> {
    onboarding::complete(&app, input).map_err(|error| {
        tracing::warn!(error = %error, "Onboarding recusado");
        error.to_string()
    })
}

#[tauri::command]
pub fn list_contacts(app: AppHandle, query: ListQuery) -> Result<Page<ContactSummary>, String> {
    masters::list_contacts(&app, query).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn get_contact(app: AppHandle, id: String) -> Result<ContactDetail, String> {
    masters::get_contact(&app, &id).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn contact_duplicates(
    app: AppHandle,
    input: ContactInput,
) -> Result<Vec<DuplicateCandidate>, String> {
    masters::contact_duplicates(&app, input).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn save_contact(app: AppHandle, input: ContactInput) -> Result<String, String> {
    masters::save_contact(&app, input).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn list_reference_data(app: AppHandle, resource: String) -> Result<Vec<ReferenceItem>, String> {
    masters::list_reference_data(&app, &resource).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn save_category(app: AppHandle, input: CategoryInput) -> Result<String, String> {
    masters::save_category(&app, input).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn save_account(app: AppHandle, input: AccountInput) -> Result<String, String> {
    masters::save_account(&app, input).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn save_payment_method(app: AppHandle, input: PaymentMethodInput) -> Result<String, String> {
    masters::save_payment_method(&app, input).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn list_catalog(app: AppHandle, query: ListQuery) -> Result<Page<CatalogItem>, String> {
    masters::list_catalog(&app, query).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn save_catalog_item(app: AppHandle, input: CatalogItemInput) -> Result<String, String> {
    masters::save_catalog_item(&app, input).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn set_master_active(
    app: AppHandle,
    resource: String,
    id: String,
    active: bool,
) -> Result<(), String> {
    masters::set_active(&app, &resource, &id, active).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn delete_master(app: AppHandle, resource: String, id: String) -> Result<(), String> {
    masters::delete_master(&app, &resource, &id).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn read_contact_csv(path: String) -> Result<CsvFilePreview, String> {
    masters::read_contact_csv(&path).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn preview_contact_import(
    app: AppHandle,
    path: String,
    mapping: ContactCsvMapping,
) -> Result<ContactImportPreview, String> {
    masters::preview_contact_import(&app, &path, mapping).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn import_contacts(
    app: AppHandle,
    path: String,
    mapping: ContactCsvMapping,
    allow_duplicates: bool,
) -> Result<ImportResult, String> {
    masters::import_contacts(&app, &path, mapping, allow_duplicates)
        .map_err(|error| error.to_string())
}
#[tauri::command]
pub fn create_contact_csv_template(path: String) -> Result<(), String> {
    masters::create_contact_csv_template(&path).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn export_contacts(app: AppHandle, path: String, query: ListQuery) -> Result<usize, String> {
    masters::export_contacts(&app, &path, query).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn finance_options(app: AppHandle) -> Result<FinanceOptions, String> {
    finance::finance_options(&app).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn list_financial_entries(
    app: AppHandle,
    query: EntryListQuery,
) -> Result<FinancePage<EntrySummary>, String> {
    finance::list_entries(&app, query).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn get_financial_entry(app: AppHandle, id: String) -> Result<EntryDetail, String> {
    finance::get_entry(&app, &id).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn save_financial_entry(
    app: AppHandle,
    input: EntryInput,
) -> Result<SaveEntriesResult, String> {
    entitlements::reconcile(&app)?;
    let result = finance::save_entry(&app, input).map_err(|error| error.to_string())?;
    entitlements::sync_trial_high_water(&app)?;
    Ok(result)
}
#[tauri::command]
pub fn settle_financial_entry(
    app: AppHandle,
    input: SettlementInput,
) -> Result<SettlementResult, String> {
    finance::settle_entry(&app, input).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn create_financial_transfer(
    app: AppHandle,
    input: TransferInput,
) -> Result<SaveEntriesResult, String> {
    entitlements::reconcile(&app)?;
    let result = finance::create_transfer(&app, input).map_err(|error| error.to_string())?;
    entitlements::sync_trial_high_water(&app)?;
    Ok(result)
}
#[tauri::command]
pub fn cancel_financial_entry(app: AppHandle, id: String, reason: String) -> Result<(), String> {
    finance::cancel_entry(&app, &id, &reason).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn reschedule_financial_entry(
    app: AppHandle,
    id: String,
    due_date: String,
) -> Result<(), String> {
    finance::reschedule_entry(&app, &id, &due_date).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn reverse_financial_entry(
    app: AppHandle,
    id: String,
    reversal_date: String,
    reason: String,
) -> Result<SaveEntriesResult, String> {
    entitlements::reconcile(&app)?;
    finance::reverse_entry(&app, &id, &reversal_date, &reason).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn list_recurrences(app: AppHandle) -> Result<Vec<RecurrenceSummary>, String> {
    finance::list_recurrences(&app).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn set_recurrence_active(app: AppHandle, id: String, active: bool) -> Result<(), String> {
    finance::set_recurrence_active(&app, &id, active).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn generate_recurrences(app: AppHandle, through_date: String) -> Result<usize, String> {
    entitlements::reconcile(&app)?;
    let result =
        finance::generate_recurrences(&app, &through_date).map_err(|error| error.to_string())?;
    entitlements::sync_trial_high_water(&app)?;
    Ok(result)
}
#[tauri::command]
pub fn list_obligations(app: AppHandle, query: ObligationQuery) -> Result<ObligationPage, String> {
    finance::list_obligations(&app, query).map_err(|error| error.to_string())
}
#[tauri::command]
pub fn financial_cash_flow(app: AppHandle, query: CashFlowQuery) -> Result<CashFlowResult, String> {
    finance::cash_flow(&app, query).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn management_dashboard(
    app: AppHandle,
    query: DashboardQuery,
) -> Result<DashboardResult, String> {
    management::dashboard(&app, query).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn management_goal(app: AppHandle, reference_month: String) -> Result<GoalPerformance, String> {
    management::goal(&app, &reference_month).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_management_goal(app: AppHandle, input: GoalInput) -> Result<GoalPerformance, String> {
    management::save_goal(&app, input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn report_options(app: AppHandle) -> Result<ReportOptions, String> {
    reports::options(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn preview_report(app: AppHandle, query: ReportQuery) -> Result<ReportResult, String> {
    reports::preview(&app, query).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_report_csv(app: AppHandle, query: ReportQuery, path: String) -> Result<(), String> {
    reports::export_csv(&app, query, &path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_report_pdf(app: AppHandle, query: ReportQuery, path: String) -> Result<(), String> {
    reports::export_pdf(&app, query, &path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn sales_options(app: AppHandle) -> Result<SalesOptions, String> {
    sales::options(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_sales(app: AppHandle, query: SaleListQuery) -> Result<SalesPage<SaleSummary>, String> {
    sales::list(&app, query).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_sale(app: AppHandle, id: String) -> Result<SaleDetail, String> {
    sales::get(&app, &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_sale(app: AppHandle, input: SaleInput) -> Result<SaleSaveResult, String> {
    entitlements::reconcile(&app)?;
    let result = sales::save(&app, input).map_err(|error| error.to_string())?;
    entitlements::sync_trial_high_water(&app)?;
    Ok(result)
}

#[tauri::command]
pub fn cancel_sale(app: AppHandle, id: String, reason: String) -> Result<(), String> {
    sales::cancel(&app, &id, &reason).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_sale_receipt_pdf(app: AppHandle, id: String, path: String) -> Result<(), String> {
    sales::export_receipt_pdf(&app, &id, &path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn phase2_status(app: AppHandle) -> Result<Phase2Status, String> {
    continuity::status(&app).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn activate_license_file(app: AppHandle, path: String) -> Result<Phase2Status, String> {
    continuity::activate_license(&app, &path).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn load_demo_data(app: AppHandle) -> Result<Phase2Status, String> {
    continuity::load_demo(&app).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn remove_demo_data(app: AppHandle) -> Result<Phase2Status, String> {
    continuity::remove_demo(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_user_manual(app: AppHandle) -> Result<(), String> {
    let path = app
        .path()
        .resolve(
            "manual/Manual-do-Usuario-Caixa-no-Controle.pdf",
            BaseDirectory::Resource,
        )
        .map_err(|error| format!("não foi possível localizar o manual: {error}"))?;
    if !path.is_file() {
        return Err("o manual do usuário não está disponível nesta instalação".into());
    }
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| format!("não foi possível abrir o manual no leitor de PDF: {error}"))
}
#[tauri::command]
pub fn create_backup(
    app: AppHandle,
    path: String,
    password: Option<String>,
) -> Result<BackupInfo, String> {
    continuity::create_backup(&app, &path, password.as_deref()).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn inspect_backup(path: String, password: Option<String>) -> Result<BackupInfo, String> {
    continuity::inspect_backup(&path, password.as_deref()).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn restore_backup(
    app: AppHandle,
    path: String,
    password: Option<String>,
) -> Result<BackupInfo, String> {
    continuity::restore_backup(&app, &path, password.as_deref()).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn continuity_overview(app: AppHandle) -> Result<ContinuityOverview, String> {
    continuity::overview(&app).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn save_backup_settings(
    app: AppHandle,
    input: BackupSettingsInput,
) -> Result<BackupSettings, String> {
    continuity::save_backup_settings(&app, input).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn run_automatic_backup(app: AppHandle) -> Result<Option<BackupInfo>, String> {
    continuity::run_automatic_backup(&app).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn create_diagnostic_package(app: AppHandle, path: String) -> Result<(), String> {
    continuity::create_diagnostic_package(&app, &path).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn inspect_update(app: AppHandle, path: String) -> Result<UpdateInfo, String> {
    continuity::inspect_update(&app, &path).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn prepare_update(app: AppHandle, path: String) -> Result<String, String> {
    continuity::prepare_update(&app, &path).map_err(|e| e.to_string())
}
