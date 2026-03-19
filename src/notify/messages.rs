use crate::api::types::PppoeStatusResponse;
use crate::monitor::relogin::ReloginSummary;

pub fn format_disconnect(device_name: &str, line_count: usize, details: &str) -> String {
    format!(
        "🔴 <b>{device_name}</b>: 检测到 {line_count} 条线路断线\n\
         {details}"
    )
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
        if s.config_uploaded { "成功" } else { "失败" },
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
        if all_ok { "全部成功 ✅" } else { "部分失败 ❌" },
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

pub fn format_status_report(statuses: &[(String, PppoeStatusResponse)]) -> String {
    let mut msg = "📊 <b>PPPoE 状态总览</b>\n".to_string();

    for (device_name, status) in statuses {
        msg.push_str(&format!(
            "\n📡 <b>{device_name}</b> (在线: {}/{})\n",
            status.connectedline, status.totalline
        ));
        for line in &status.multidial {
            let icon = if line.is_connected() { "🟢" } else { "🔴" };
            if line.is_connected() {
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
    }

    msg
}

pub fn format_error(context: &str, error: &str) -> String {
    format!("⚠️ <b>错误</b>: {context}\n{error}")
}
