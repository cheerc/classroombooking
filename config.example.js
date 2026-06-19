/**
 * classroombooking — 必要的 GAS Script Properties 設定
 *
 * 此檔案僅供文件參考，列出所有需要在 GAS Script Editor 中設定的 Script Properties。
 * 不要直接修改此檔案中的值。
 *
 * 設定方式：
 * 1. 開啟 GAS Script Editor
 * 2. 進入 Project Settings → Script Properties
 * 3. 依序新增以下 key-value pairs
 */
const REQUIRED_SCRIPT_PROPERTIES = {
  // 管理員 email（擁有所有課表的管理權限）
  ADMIN_EMAIL: 'admin@your-domain.com',

  // Google Drive 字體檔案 ID（用於 PDF 匯出，可選）
  font_drive_file_id: 'your-google-drive-file-id',
};
