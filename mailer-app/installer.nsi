; Outreach Mailer installer. Built by build.py with:  makensis /DVERSION=1.1.0 /DSRC=<app folder> /DOUT=<setup file> /DICON=<icon> installer.nsi
; Installs for the current user only, so Windows does not ask for an administrator password.
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user
!include "MUI2.nsh"

Name "Outreach Mailer"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\Outreach Mailer"
InstallDirRegKey HKCU "Software\OutreachMailer" "InstallDir"
BrandingText "Outreach Mailer ${VERSION}"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!ifdef SIDEBAR
!define MUI_WELCOMEFINISHPAGE_BITMAP "${SIDEBAR}"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${SIDEBAR}"
!endif
!define MUI_FINISHPAGE_RUN "$INSTDIR\Outreach Mailer.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open Outreach Mailer now"
!define MUI_WELCOMEPAGE_TEXT "This installs Outreach Mailer on your computer.$\r$\n$\r$\nSend your outreach emails from your own Gmail and watch the results live: sent, opened, replied and bounced. It adds a Start Menu entry and a Desktop shortcut, and it shows an update at the top of the app when a new version is ready."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  ; Close a running copy so its files can be replaced (an upgrade install).
  nsExec::Exec 'taskkill /F /IM "Outreach Mailer.exe"'
  Sleep 800
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall Outreach Mailer.exe"
  CreateDirectory "$SMPROGRAMS\Outreach Mailer"
  CreateShortcut "$SMPROGRAMS\Outreach Mailer\Outreach Mailer.lnk" "$INSTDIR\Outreach Mailer.exe" "" "$INSTDIR\Outreach Mailer.exe" 0
  CreateShortcut "$SMPROGRAMS\Outreach Mailer\Uninstall Outreach Mailer.lnk" "$INSTDIR\Uninstall Outreach Mailer.exe"
  CreateShortcut "$DESKTOP\Outreach Mailer.lnk" "$INSTDIR\Outreach Mailer.exe" "" "$INSTDIR\Outreach Mailer.exe" 0
  WriteRegStr HKCU "Software\OutreachMailer" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OutreachMailer" "DisplayName" "Outreach Mailer"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OutreachMailer" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OutreachMailer" "Publisher" "Evans Large"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OutreachMailer" "DisplayIcon" "$INSTDIR\Outreach Mailer.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OutreachMailer" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OutreachMailer" "UninstallString" '"$INSTDIR\Uninstall Outreach Mailer.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OutreachMailer" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OutreachMailer" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "Outreach Mailer.exe"'
  Sleep 800
  Delete "$DESKTOP\Outreach Mailer.lnk"
  RMDir /r "$SMPROGRAMS\Outreach Mailer"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OutreachMailer"
  DeleteRegKey HKCU "Software\OutreachMailer"
  ; Your leads, results and saved mailbox sign-ins in AppData\Local\OutreachMailer are left alone on purpose, so a reinstall keeps them.
SectionEnd
