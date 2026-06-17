// Prevents additional console window on Windows in release, DO NOT REMOVE!!
// 临时启用控制台以便调试
// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  paperlens_lib::run();
}
