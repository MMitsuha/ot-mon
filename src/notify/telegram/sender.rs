use crate::notify::events::NotifyMessage;
use crate::notify::messages;
use teloxide::prelude::*;
use teloxide::types::ParseMode;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

/// Pump loop: pull notifications from the channel and forward to Telegram.
pub async fn run(
    bot: Bot,
    chat_id: ChatId,
    mut notify_rx: mpsc::Receiver<NotifyMessage>,
    cancel: CancellationToken,
) {
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            msg = notify_rx.recv() => {
                let Some(msg) = msg else { break };
                let text = render(&msg);
                if let Err(e) = bot
                    .send_message(chat_id, &text)
                    .parse_mode(ParseMode::Html)
                    .await
                {
                    tracing::error!(error = %e, "发送 Telegram 通知失败");
                }
            }
        }
    }
}

fn render(msg: &NotifyMessage) -> String {
    match msg {
        NotifyMessage::LineDisconnected {
            device_name,
            line_count,
            details,
        } => messages::format_disconnect(device_name, *line_count, details),
        NotifyMessage::ReloginComplete { summary } => messages::format_relogin_summary(summary),
        NotifyMessage::DailyReloginStart => messages::format_daily_start(),
        NotifyMessage::DailyReloginComplete { summaries } => {
            messages::format_daily_complete(summaries)
        }
        NotifyMessage::DeviceUnreachable { device_name, error } => {
            messages::format_device_unreachable(device_name, error)
        }
        NotifyMessage::DeviceRecovered {
            device_name,
            outage,
        } => messages::format_device_recovered(device_name, *outage),
    }
}
