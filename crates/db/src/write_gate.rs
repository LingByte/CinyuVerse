//! Process-wide SQLite writer serialization.
//!
//! SQLite allows one writer. Without a gate, many tasks each `pool.acquire()`
//! then block inside `BEGIN IMMEDIATE` on `busy_timeout` while holding a pool
//! slot — starving every other reader (ADR-0061 §8.3). Wait on this mutex
//! **before** checking out a connection for a write transaction.

use std::sync::OnceLock;

use tokio::sync::{Mutex, MutexGuard};

pub fn sqlite_writer_gate() -> &'static Mutex<()> {
    static GATE: OnceLock<Mutex<()>> = OnceLock::new();
    GATE.get_or_init(|| Mutex::new(()))
}

/// RAII permit for the process-wide writer gate.
///
/// Prefer this when a crate must hold the gate across a returned connection
/// without depending on `tokio::sync::MutexGuard` in its own type signatures.
pub struct SqliteWriterPermit {
    _guard: MutexGuard<'static, ()>,
}

impl SqliteWriterPermit {
    pub async fn acquire() -> Self {
        Self {
            _guard: sqlite_writer_gate().lock().await,
        }
    }
}
