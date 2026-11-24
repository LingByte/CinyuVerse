use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::{error::AppError, state::AppState};

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ArtifactPreviewLeaseDto {
    pub lease_id: uuid::Uuid,
    pub artifact_id: uuid::Uuid,
    pub provider_id: String,
    pub loopback_port: u16,
    pub capability_token: String,
    pub expires_at_unix_ms: u64,
    pub preview_url: String,
    pub docx_fallback_supported: bool,
}

#[tauri::command]
pub async fn artifact_open_preview(
    _state: State<'_, AppState>,
    _preview_proxy: State<'_, crate::plugin_dev_server::DesktopPreviewProxy>,
    _artifact_id: uuid::Uuid,
) -> Result<ArtifactPreviewLeaseDto, AppError> {
    Err(AppError::BadRequest(
        "plugin artifact preview is unavailable".to_string(),
    ))
}

#[tauri::command]
pub async fn artifact_close_preview(
    _state: State<'_, AppState>,
    _preview_proxy: State<'_, crate::plugin_dev_server::DesktopPreviewProxy>,
    _lease_id: uuid::Uuid,
) -> Result<(), AppError> {
    Ok(())
}
