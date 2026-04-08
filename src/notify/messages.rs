use crate::api::types::PppoeStatusResponse;
use crate::monitor::relogin::ReloginSummary;
use std::time::Duration;

pub fn format_disconnect(device_name: &str, line_count: usize, details: &str) -> String {
    format!(
        "🔴 <b>{device_name}</b>: 检测到 {line_count} 条线路断线\n\
         {details}"
    )
}

pub fn format_device_unreachable(device_name: &str, error: &str) -> String {
    format!("🔴 <b>{device_name}</b>: 设备不可达\n{error}")
}

pub fn format_device_recovered(device_name: &str, outage: Duration) -> String {
    format!(
        "🟢 <b>{device_name}</b>: 设备已恢复 (断连 {})",
        format_duration(outage)
    )
}

/// Render a duration as `5s` / `2m30s` / `1h5m` / `1d2h` etc.
/// Shows the two most significant units; sub-second values round up to `1s`.
pub fn format_duration(d: Duration) -> String {
    let total = d.as_secs();
    if total == 0 {
        return "1s".to_string();
    }
    let days = total / 86_400;
    let hours = (total % 86_400) / 3_600;
    let minutes = (total % 3_600) / 60;
    let seconds = total % 60;

    if days > 0 {
        if hours > 0 {
            format!("{days}d{hours}h")
        } else {
            format!("{days}d")
        }
    } else if hours > 0 {
        if minutes > 0 {
            format!("{hours}h{minutes}m")
        } else {
            format!("{hours}h")
        }
    } else if minutes > 0 {
        if seconds > 0 {
            format!("{minutes}m{seconds}s")
        } else {
            format!("{minutes}m")
        }
    } else {
        format!("{seconds}s")
    }
}

pub fn format_relogin_summary(s: &ReloginSummary) -> String {
    let status_icon = if s.config_uploaded { "✅" } else { "❌" };
    let mut msg = format!(
        "{status_icon} <b>{}</b>: 重拨完成\n\
         替换: {}/{} 条线路\n\
         配置上传: {}",
        s.device_name,
        s.replaced_count,
        s.total_lines,
        if s.config_uploaded {
            "成功"
        } else {
            "失败"
        },
    );

    if s.failed_logins > 0 {
        msg.push_str(&format!("\n⚠️ 登录失败: {} 条", s.failed_logins));
    }

    if let Some(ref err) = s.error {
        msg.push_str(&format!("\n错误: {err}"));
    }

    if !s.new_macs.is_empty() {
        msg.push_str("\n新MAC:");
        for mac in &s.new_macs {
            msg.push_str(&format!("\n  <code>{mac}</code>"));
        }
    }

    msg
}

pub fn format_daily_start() -> String {
    "🔄 <b>每日定时重拨开始</b>".to_string()
}

pub fn format_daily_complete(summaries: &[ReloginSummary]) -> String {
    let total_replaced: usize = summaries.iter().map(|s| s.replaced_count).sum();
    let total_lines: usize = summaries.iter().map(|s| s.total_lines).sum();
    let all_ok = summaries.iter().all(|s| s.config_uploaded);

    let mut msg = format!(
        "📋 <b>每日重拨完成</b>\n\
         总替换: {total_replaced}/{total_lines} 条线路\n\
         状态: {}",
        if all_ok {
            "全部成功 ✅"
        } else {
            "部分失败 ❌"
        },
    );

    for s in summaries {
        let icon = if s.config_uploaded { "✅" } else { "❌" };
        msg.push_str(&format!(
            "\n\n{icon} <b>{}</b>: {}/{} 条",
            s.device_name, s.replaced_count, s.total_lines
        ));
        if let Some(ref err) = s.error {
            msg.push_str(&format!("\n  错误: {err}"));
        }
    }

    msg
}

pub fn format_status_report(statuses: &[(String, PppoeStatusResponse)]) -> Vec<String> {
    let mut reports = Vec::new();
    reports.push("📊 <b>PPPoE 状态总览</b>".to_string());

    for (device_name, status) in statuses {
        let mut msg = format!(
            "\n📡 <b>{device_name}</b> (在线: {}/{})\n",
            status.connectedline, status.totalline
        );
        let mut total_upspeed = 0;
        let mut total_downspeed = 0;
        for line in &status.multidial {
            let icon = if line.is_connected() { "🟢" } else { "🔴" };
            if line.is_connected() {
                total_upspeed += line.upspeed;
                total_downspeed += line.downspeed;
                msg.push_str(&format!(
                    "  {icon} {}: {} @ {} (↓{:.1}MB/s ↑{:.1}MB/s)\n",
                    line.tag,
                    line.username,
                    line.ipaddr,
                    line.downspeed as f64 / 1_048_576.0,
                    line.upspeed as f64 / 1_048_576.0,
                ));
            } else {
                msg.push_str(&format!(
                    "  {icon} {}: 断线 ({}) mac={}\n",
                    line.tag, line.status, line.macaddr,
                ));
            }
        }
        msg.push_str(&format!(
            "\n📊 总速度: ↓{:.1}MB/s ↑{:.1}MB/s",
            total_downspeed as f64 / 1_048_576.0,
            total_upspeed as f64 / 1_048_576.0,
        ));
        reports.push(msg);
    }

    reports
}

#[cfg(test)]
mod tests {
    use super::format_duration;
    use std::time::Duration;

    #[test]
    fn format_duration_sub_second() {
        assert_eq!(format_duration(Duration::from_millis(500)), "1s");
    }

    #[test]
    fn format_duration_seconds() {
        assert_eq!(format_duration(Duration::from_secs(45)), "45s");
    }

    #[test]
    fn format_duration_minutes_seconds() {
        assert_eq!(format_duration(Duration::from_secs(2 * 60 + 30)), "2m30s");
    }

    #[test]
    fn format_duration_hours_minutes() {
        assert_eq!(format_duration(Duration::from_secs(3600 + 5 * 60)), "1h5m");
    }

    #[test]
    fn format_duration_exact_hours() {
        assert_eq!(format_duration(Duration::from_secs(2 * 3600)), "2h");
    }

    #[test]
    fn format_duration_days_hours() {
        assert_eq!(
            format_duration(Duration::from_secs(86_400 + 2 * 3600)),
            "1d2h"
        );
    }
}
