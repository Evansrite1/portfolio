; Outreach Mailer installer. Built by build.py with:  makensis /DVERSION=1.1.0 /DSRC=<app folder> /DOUT=<setup file> /DICON=<icon> installer.nsi
; Installs for the current user only, so Windows does not ask for an administrator password.
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user
!include "MUI2.nsh"
!include "LogicLib.nsh"

Name "Outreach Mailer"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\Evans Large\Outreach Mailer"
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
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!define MUI_LICENSEPAGE_CHECKBOX
!define MUI_LICENSEPAGE_TEXT_TOP "Read these terms. You must tick the box to agree before Next is available."
!define MUI_WELCOMEPAGE_TEXT "This installs Outreach Mailer on your computer.$\r$\n$\r$\nSend your outreach emails from your own Gmail and watch the results live: sent, opened, replied and bounced. It adds a Start Menu entry and a Desktop shortcut, and it shows an update at the top of the app when a new version is ready."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${LICENSE}"
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
  ; An older version lived outside the Evans Large folder: remove it so there is only one copy.
  ReadRegStr $R0 HKCU "Software\OutreachMailer" "InstallDir"
  ${If} $R0 != ""
  ${AndIf} $R0 != "$INSTDIR"
    RMDir /r "$R0"
  ${EndIf}
  RMDir /r "$SMPROGRAMS\Outreach Mailer"
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall Outreach Mailer.exe"
  CreateDirectory "$SMPROGRAMS\Evans Large"
  CreateShortcut "$SMPROGRAMS\Evans Large\Outreach Mailer.lnk" "$INSTDIR\Outreach Mailer.exe" "" "$INSTDIR\Outreach Mailer.exe" 0
  CreateShortcut "$SMPROGRAMS\Evans Large\Uninstall Outreach Mailer.lnk" "$INSTDIR\Uninstall Outreach Mailer.exe"
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
  Delete "$SMPROGRAMS\Evans Large\Outreach Mailer.lnk"
  Delete "$SMPROGRAMS\Evans Large\Uninstall Outreach Mailer.lnk"
  RMDir "$SMPROGRAMS\Evans Large"
  RMDir /r "$INSTDIR"
  RMDir "$LOCALAPPDATA\Programs\Evans Large"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OutreachMailer"
  DeleteRegKey HKCU "Software\OutreachMailer"
  ; Your leads, results and saved mailbox sign-ins in AppData\Local\OutreachMailer are left alone on purpose, so a reinstall keeps them.
SectionEnd
