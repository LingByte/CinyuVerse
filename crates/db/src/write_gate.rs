//! Process-wide SQLite writer serialization.
//!
//! SQLite allows one writer. Without a gate, many tasks each `pool.acquire()`
//! then block inside `BEGIN IMMEDIATE` on `busy_timeout` while holding a pool
//! slot — starving every other reader (ADR-0061 §8.3). Wait on this mutex
//! **before** checking out a connection for a write transaction.

use std::sync::OnceLock;

use tokio::sync::Mutex;

pub fn sqlite_writer_gate() -> &'static Mutex<()> {
    static GATE: OnceLock<Mutex<()>> = OnceLock::new();
    GATE.get_or_init(|| Mutex::new(()))
}
