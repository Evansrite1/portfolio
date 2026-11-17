; Large Lead Finder installer. Built by build.py with:  makensis /DVERSION=1.1.0 /DSRC=<app folder> /DOUT=<setup file> /DICON=<icon> installer.nsi
; Installs for the current user only, so Windows does not ask for an administrator password.
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user
!include "MUI2.nsh"
!include "LogicLib.nsh"

Name "Large Lead Finder"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\Large Lead Finder"
InstallDirRegKey HKCU "Software\LargeLeadFinder" "InstallDir"
BrandingText "Large Lead Finder ${VERSION}"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!ifdef SIDEBAR
!define MUI_WELCOMEFINISHPAGE_BITMAP "${SIDEBAR}"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${SIDEBAR}"
!endif
!define MUI_FINISHPAGE_RUN "$INSTDIR\Large Lead Finder.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open Large Lead Finder now"
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!define MUI_LICENSEPAGE_CHECKBOX
!define MUI_LICENSEPAGE_TEXT_TOP "Read these terms. You must tick the box to agree before Next is available."
!define MUI_WELCOMEPAGE_TEXT "This installs Large Lead Finder on your computer.$\r$\n$\r$\nFind leads for any niche, with a working email or an Instagram page on every one. The installer also downloads the built-in browser the app uses in the background (about 100 MB), so it needs the internet for a few minutes."

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
  nsExec::Exec 'taskkill /F /IM "Large Lead Finder.exe"'
  Sleep 800
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  DetailPrint "Installing the built-in browser (about 100 MB). This needs the internet and takes a few minutes."
  nsExec::ExecToLog '"$INSTDIR\Large Lead Finder.exe" --install-browser'
  Pop $0
  ${If} $0 != 0
    DetailPrint "The built-in browser could not be downloaded. The app still works; open Large Lead Finder and press Install the built-in browser when you are online."
  ${Else}
    DetailPrint "The built-in browser is installed."
  ${EndIf}
  WriteUninstaller "$INSTDIR\Uninstall Large Lead Finder.exe"
  CreateDirectory "$SMPROGRAMS\Large Lead Finder"
  CreateShortcut "$SMPROGRAMS\Large Lead Finder\Large Lead Finder.lnk" "$INSTDIR\Large Lead Finder.exe" "" "$INSTDIR\Large Lead Finder.exe" 0
  CreateShortcut "$SMPROGRAMS\Large Lead Finder\Uninstall Large Lead Finder.lnk" "$INSTDIR\Uninstall Large Lead Finder.exe"
  CreateShortcut "$DESKTOP\Large Lead Finder.lnk" "$INSTDIR\Large Lead Finder.exe" "" "$INSTDIR\Large Lead Finder.exe" 0
  WriteRegStr HKCU "Software\LargeLeadFinder" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LargeLeadFinder" "DisplayName" "Large Lead Finder"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LargeLeadFinder" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LargeLeadFinder" "Publisher" "Evans Large"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LargeLeadFinder" "DisplayIcon" "$INSTDIR\Large Lead Finder.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LargeLeadFinder" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LargeLeadFinder" "UninstallString" '"$INSTDIR\Uninstall Large Lead Finder.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LargeLeadFinder" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LargeLeadFinder" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "Large Lead Finder.exe"'
  Sleep 800
  Delete "$DESKTOP\Large Lead Finder.lnk"
  RMDir /r "$SMPROGRAMS\Large Lead Finder"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LargeLeadFinder"
  DeleteRegKey HKCU "Software\LargeLeadFinder"
  ; Your leads, results and saved mailbox sign-ins in AppData\Local\LargeLeadFinder are left alone on purpose, so a reinstall keeps them.
SectionEnd
