; IG Leads Finder installer. Built by build.py with:  makensis /DVERSION=1.1.0 /DSRC=<app folder> /DOUT=<setup file> /DICON=<icon> installer.nsi
; Installs for the current user only, so Windows does not ask for an administrator password.
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user
!include "MUI2.nsh"

Name "IG Leads Finder"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\IG Leads Finder"
InstallDirRegKey HKCU "Software\IGLeadsFinder" "InstallDir"
BrandingText "IG Leads Finder ${VERSION}"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!ifdef SIDEBAR
!define MUI_WELCOMEFINISHPAGE_BITMAP "${SIDEBAR}"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${SIDEBAR}"
!endif
!define MUI_FINISHPAGE_RUN "$INSTDIR\IG Leads Finder.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open IG Leads Finder now"
!define MUI_WELCOMEPAGE_TEXT "This installs IG Leads Finder on your computer.$\r$\n$\r$\nFind the businesses that need your service, from your own Instagram login. It adds a Start Menu entry and a Desktop shortcut, and it shows an update at the top of the app when a new version is ready."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  ; Close a running copy so its files can be replaced (an upgrade install).
  nsExec::Exec 'taskkill /F /IM "IG Leads Finder.exe"'
  Sleep 800
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall IG Leads Finder.exe"
  CreateDirectory "$SMPROGRAMS\IG Leads Finder"
  CreateShortcut "$SMPROGRAMS\IG Leads Finder\IG Leads Finder.lnk" "$INSTDIR\IG Leads Finder.exe" "" "$INSTDIR\IG Leads Finder.exe" 0
  CreateShortcut "$SMPROGRAMS\IG Leads Finder\Uninstall IG Leads Finder.lnk" "$INSTDIR\Uninstall IG Leads Finder.exe"
  CreateShortcut "$DESKTOP\IG Leads Finder.lnk" "$INSTDIR\IG Leads Finder.exe" "" "$INSTDIR\IG Leads Finder.exe" 0
  WriteRegStr HKCU "Software\IGLeadsFinder" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGLeadsFinder" "DisplayName" "IG Leads Finder"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGLeadsFinder" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGLeadsFinder" "Publisher" "Evans Ademilua"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGLeadsFinder" "DisplayIcon" "$INSTDIR\IG Leads Finder.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGLeadsFinder" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGLeadsFinder" "UninstallString" '"$INSTDIR\Uninstall IG Leads Finder.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGLeadsFinder" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGLeadsFinder" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "IG Leads Finder.exe"'
  Sleep 800
  Delete "$DESKTOP\IG Leads Finder.lnk"
  RMDir /r "$SMPROGRAMS\IG Leads Finder"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\IGLeadsFinder"
  DeleteRegKey HKCU "Software\IGLeadsFinder"
  ; Results in Documents\IG Leads Finder and the saved Instagram login in AppData\Local\IGScout are left alone on purpose.
SectionEnd
