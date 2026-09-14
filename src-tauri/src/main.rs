#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde::{Deserialize, Serialize};
use std::{sync::Mutex, time::{SystemTime, UNIX_EPOCH}};
use tauri::{Manager, menu::{Menu, MenuItem}, tray::TrayIconBuilder};
use tauri_plugin_notification::NotificationExt;
#[derive(Clone, Serialize, Deserialize)]
struct Reminder { id: String, title: String, body: String, at: u64 }
struct Reminders(Mutex<Vec<Reminder>>);
fn persist(app: &tauri::AppHandle, rows: &[Reminder]) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("reminders.json"), serde_json::to_vec(rows).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
#[tauri::command]
fn schedule_reminders(app: tauri::AppHandle, reminders: Vec<Reminder>, state: tauri::State<Reminders>) -> Result<(), String> {
    if reminders.len() > 500 || reminders.iter().any(|r| r.title.len()>1000 || r.body.len()>10000) {return Err("提醒数量或长度超限".into());}
    let mut rows = state.0.lock().map_err(|e| e.to_string())?;
    persist(&app, &reminders)?; *rows = reminders; Ok(())
}
#[tauri::command]
async fn export_text(name: String, content: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = rfd::FileDialog::new().set_file_name(&name).save_file();
        if let Some(path) = path {std::fs::write(path,content).map_err(|e|e.to_string())?;Ok(true)}else{Ok(false)}
    }).await.map_err(|e|e.to_string())?
}
fn main() {
    tauri::Builder::default()
      .plugin(tauri_plugin_single_instance::init(|app,_,_|{if let Some(w)=app.get_webview_window("main"){let _=w.show();let _=w.set_focus();}}))
      .plugin(tauri_plugin_notification::init())
      .invoke_handler(tauri::generate_handler![schedule_reminders,export_text])
      .setup(|app| {
        let path=app.path().app_data_dir()?.join("reminders.json");
        let reminders:Vec<Reminder>=std::fs::read(path).ok().and_then(|b|serde_json::from_slice(&b).ok()).unwrap_or_default();
        app.manage(Reminders(Mutex::new(reminders)));
        let show=MenuItem::with_id(app,"show","打开自明",true,None::<&str>)?;
        let quit=MenuItem::with_id(app,"quit","退出（停止提醒）",true,None::<&str>)?;
        let menu=Menu::with_items(app,&[&show,&quit])?;
        TrayIconBuilder::new().icon(app.default_window_icon().unwrap().clone()).tooltip("自明 SELF · 后台提醒").menu(&menu)
          .on_menu_event(|app,event|match event.id.as_ref(){"show"=>{if let Some(w)=app.get_webview_window("main"){let _=w.show();let _=w.set_focus();}},"quit"=>app.exit(0),_=>{}}).build(app)?;
        let handle=app.handle().clone();
        std::thread::spawn(move || loop {
          std::thread::sleep(std::time::Duration::from_secs(10));
          let now=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
          let state=handle.state::<Reminders>();
          if let Ok(mut rows)=state.0.lock(){
            let due:Vec<_>=rows.iter().filter(|r|r.at<=now&&r.at+300_000>=now).cloned().collect();
            let future:Vec<_>=rows.iter().filter(|r|r.at>now).cloned().collect();
            if future.len()!=rows.len()&&persist(&handle,&future).is_ok(){*rows=future;for r in due{let _=handle.notification().builder().title(r.title).body(r.body).show();}}
          };
        });
        Ok(())
      })
      .on_window_event(|window,event| {if let tauri::WindowEvent::CloseRequested{api,..}=event {api.prevent_close();let _=window.hide();}})
      .run(tauri::generate_context!()).expect("Unable to start SELF");
}
