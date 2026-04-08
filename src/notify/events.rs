use crate::monitor::relogin::ReloginSummary;
use std::time::Duration;

/// Cross-module notification events. Produced by poller/scheduler,
/// consumed by the Telegram bot's sender loop.
pub enum NotifyMessage {
    LineDisconnected {
        device_name: String,
        line_count: usize,
        details: String,
    },
    ReloginComplete {
        summary: ReloginSummary,
    },
    DailyReloginStart,
    DailyReloginComplete {
        summaries: Vec<ReloginSummary>,
    },
    /// Emitted once when a device transitions from reachable to unreachable.
    DeviceUnreachable {
        device_name: String,
        error: String,
    },
    /// Emitted once when a device transitions from unreachable back to reachable.
    DeviceRecovered {
        device_name: String,
        outage: Duration,
    },
}
