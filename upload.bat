@echo off
chcp 65001 > nul
cd /d "%~dp0"
setlocal

echo ==========================================
echo   R8 熊本マップ  サイト更新アップロード
echo ==========================================
echo.

where git > nul 2>&1
if errorlevel 1 (
  echo [エラー] Git が見つかりません。Git for Windows をインストールしてください。
  pause
  exit /b 1
)

echo 変更内容を確認しています...
git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo 変更はありません。アップロードするものはありませんでした。
  echo.
  pause
  exit /b 0
)

echo.
echo --- 今回アップロードするファイル ---
git diff --cached --name-status
echo ------------------------------------
echo.

set /p ANSWER="この内容でアップロードしますか？ (Y/N): "
if /i not "%ANSWER%"=="Y" (
  echo 中止しました。（変更はそのまま残っています）
  git reset > nul
  pause
  exit /b 0
)

echo.
echo コミットしています...
git commit -m "手動更新 %date% %time%"
if errorlevel 1 goto :failed

echo リモートの最新を取り込んでいます...
git pull --rebase origin main
if errorlevel 1 goto :conflict

echo アップロードしています...
git push
if errorlevel 1 goto :failed

echo.
echo ==========================================
echo   完了しました。
echo   1?2分後にサイトへ反映されます。
echo   https://r8kumamoto.promate2.com/
echo ==========================================
echo.
pause
exit /b 0

:conflict
echo.
echo [エラー] リモートの変更と競合しました。
echo 自動更新（拠点データ）と同じファイルを編集した可能性があります。
echo 次のコマンドで中断できます:  git rebase --abort
echo.
pause
exit /b 1

:failed
echo.
echo [エラー] 処理に失敗しました。上のメッセージを確認してください。
echo.
pause
exit /b 1
