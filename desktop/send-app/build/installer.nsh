; Wording and steps for the File Share installer wizard. The pages themselves come from electron-builder.
; The installer asks Windows for permission once (the Yes button), and uses it to let File Share through the firewall,
; so the other computer can connect without any later question.
!macro customHeader
  !define MUI_WELCOMEPAGE_TITLE "Welcome to File Share by Evans Large"
  !define MUI_WELCOMEPAGE_TEXT "This wizard installs File Share by Evans Large on your computer.$\r$\n$\r$\nSend files and folders to another computer over Wi-Fi. Install it on both computers.$\r$\n$\r$\nWindows will ask for permission once. Press Yes: File Share uses it to allow other computers to connect.$\r$\n$\r$\nClick Next to continue."
  !define MUI_FINISHPAGE_TITLE "File Share is installed"
  !define MUI_FINISHPAGE_TEXT "File Share by Evans Large is ready, and this computer is allowed to connect to other computers.$\r$\n$\r$\nOpen it on both computers. Press Send on one and Receive on the other."
!macroend

!macro customInstall
  DetailPrint "Allowing File Share through the firewall..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="File Share by Evans Large"'
  Pop $0
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="File Share by Evans Large ports"'
  Pop $0
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="File Share by Evans Large" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=any'
  Pop $1
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="File Share by Evans Large ports" dir=in action=allow protocol=TCP localport=41874 enable=yes profile=any'
  Pop $2
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="File Share by Evans Large ports" dir=in action=allow protocol=UDP localport=41873 enable=yes profile=any'
  Pop $3
  ${If} $1 == "0"
  ${AndIf} $2 == "0"
  ${AndIf} $3 == "0"
    DetailPrint "The firewall permission is in place."
  ${Else}
    DetailPrint "The firewall permission was not added. File Share can ask for it again when it opens."
  ${EndIf}
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="File Share by Evans Large"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="File Share by Evans Large ports"'
!macroend
