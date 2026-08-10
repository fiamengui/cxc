use std::fs;

use tauri::{AppHandle, Manager};
use thiserror::Error;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{filter::LevelFilter, prelude::*, EnvFilter};

pub struct ApplicationLogger {
    _guard: WorkerGuard,
}

#[derive(Debug, Error)]
pub enum LoggingError {
    #[error("não foi possível preparar o diretório de logs: {0}")]
    Io(#[from] std::io::Error),
    #[error("não foi possível determinar o diretório de logs da aplicação: {0}")]
    Path(#[from] tauri::Error),
    #[error("não foi possível inicializar o registrador: {0}")]
    Subscriber(#[from] tracing::subscriber::SetGlobalDefaultError),
}

pub fn initialize(app: &AppHandle) -> Result<ApplicationLogger, LoggingError> {
    let directory = app.path().app_log_dir()?;
    fs::create_dir_all(&directory)?;

    let appender = tracing_appender::rolling::daily(directory, "caixasimples-bratec.log");
    let (writer, guard) = tracing_appender::non_blocking(appender);
    let filter = EnvFilter::builder()
        .with_default_directive(LevelFilter::INFO.into())
        .from_env_lossy();
    let subscriber = tracing_subscriber::registry().with(filter).with(
        tracing_subscriber::fmt::layer()
            .with_ansi(false)
            .with_writer(writer),
    );
    tracing::subscriber::set_global_default(subscriber)?;

    Ok(ApplicationLogger { _guard: guard })
}
