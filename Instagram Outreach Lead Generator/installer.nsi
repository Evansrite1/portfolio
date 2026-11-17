; IG Outreach installer. Built by build.py with:  makensis /DVERSION=1.1.0 /DSRC=<app folder> /DOUT=<setup file> /DICON=<icon> installer.nsi
; Installs for the current user only, so Windows does not ask for an administrator password.
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user
!include "MUI2.nsh"
!include "LogicLib.nsh"

Name "IG Outreach"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\Evans Large\IG Outreach"
BrandingText "IG Outreach ${VERSION}"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!ifdef SIDEBAR
!define MUI_WELCOMEFINISHPAGE_BITMAP "${SIDEBAR}"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${SIDEBAR}"
!endif
!define MUI_FINISHPAGE_RUN "$INSTDIR\IG Outreach.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open IG Outreach now"
!define MUI_WELCOMEPAGE_TEXT "This installs IG Outreach on your computer.$\r$\n$\r$\nFind the businesses that need your service, from your own Instagram login. It adds a Start Menu entry and a Desktop shortcut, and it shows an update at the top of the app when a new version is ready."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  ; Close a running copy so its files can be replaced (an upgrade install).
  nsExec::Exec 'taskkill /F /IM "IG Outreach.exe"'
  Sleep 800
  ; An older version lived outside the Evans Large folder: remove it so there is only one copy.
  ReadRegStr $R0 HKCU "Software\IGOutreach" "InstallDir"
  ${If} $R0 != ""
  ${AndIf} $R0 != "$INSTDIR"
    RMDir /r "$R0"
  ${EndIf}
  RMDir /r "$SMPROGRAMS\IG Outreach"
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall IG Outreach.exe"
  CreateDirectory "$SMPROGRAMS\Evans Large"
  CreateShortcut "$SMPROGRAMS\Evans Large\IG Outreach.lnk" "$INSTDIR\IG Outreach.exe" "" "$INSTDIR\IG Outreach.exe" 0
  CreateShortcut "$SMPROGRAMS\Evans Large\Uninstall IG Outreach.lnk" "$INSTDIR\Uninstall IG Outreach.exe"
  CreateShortcut "$DESKTOP\IG Outreach.lnk" "$INSTDIR\IG Outreach.exe" "" "$INSTDIR\IG Outreach.exe" 0
  WriteRegStr HKCU "Software\IGOutreach" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGOutreach" "DisplayName" "IG Outreach"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGOutreach" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGOutreach" "Publisher" "Evans Ademilua"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGOutreach" "DisplayIcon" "$INSTDIR\IG Outreach.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGOutreach" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGOutreach" "UninstallString" '"$INSTDIR\Uninstall IG Outreach.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGOutreach" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGOutreach" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "IG Outreach.exe"'
  Sleep 800
  Delete "$DESKTOP\IG Outreach.lnk"
  Delete "$SMPROGRAMS\Evans Large\IG Outreach.lnk"
  Delete "$SMPROGRAMS\Evans Large\Uninstall IG Outreach.lnk"
  RMDir "$SMPROGRAMS\Evans Large"
  RMDir /r "$INSTDIR"
  RMDir "$LOCALAPPDATA\Programs\Evans Large"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGOutreach"
  DeleteRegKey HKCU "Software\IGOutreach"
  ; Results in Documents\IG Outreach and the saved Instagram login in AppData\Local\IGScout are left alone on purpose.
SectionEnd
