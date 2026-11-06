; IG Scout installer. Built by build.py with:  makensis /DVERSION=1.1.0 /DSRC=<app folder> /DOUT=<setup file> /DICON=<icon> installer.nsi
; Installs for the current user only, so Windows does not ask for an administrator password.
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user
!include "MUI2.nsh"

Name "IG Scout"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\IG Scout"
InstallDirRegKey HKCU "Software\IGScout" "InstallDir"
BrandingText "IG Scout ${VERSION}"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\IG Scout.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open IG Scout now"
!define MUI_WELCOMEPAGE_TEXT "This installs IG Scout on your computer.$\r$\n$\r$\nIt adds a Start Menu entry and a Desktop shortcut, and it updates itself when a new version is ready."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  ; Close a running copy so its files can be replaced (an upgrade install).
  nsExec::Exec 'taskkill /F /IM "IG Scout.exe"'
  Sleep 800
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall IG Scout.exe"
  CreateDirectory "$SMPROGRAMS\IG Scout"
  CreateShortcut "$SMPROGRAMS\IG Scout\IG Scout.lnk" "$INSTDIR\IG Scout.exe" "" "$INSTDIR\IG Scout.exe" 0
  CreateShortcut "$SMPROGRAMS\IG Scout\Uninstall IG Scout.lnk" "$INSTDIR\Uninstall IG Scout.exe"
  CreateShortcut "$DESKTOP\IG Scout.lnk" "$INSTDIR\IG Scout.exe" "" "$INSTDIR\IG Scout.exe" 0
  WriteRegStr HKCU "Software\IGScout" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGScout" "DisplayName" "IG Scout"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGScout" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGScout" "Publisher" "Evans Ademilua"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGScout" "DisplayIcon" "$INSTDIR\IG Scout.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGScout" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGScout" "UninstallString" '"$INSTDIR\Uninstall IG Scout.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGScout" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGScout" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "IG Scout.exe"'
  Sleep 800
  Delete "$DESKTOP\IG Scout.lnk"
  RMDir /r "$SMPROGRAMS\IG Scout"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGScout"
  DeleteRegKey HKCU "Software\IGScout"
  ; Results in Documents\IG Scout and the saved Instagram login in AppData\Local\IGScout are left alone on purpose.
SectionEnd
