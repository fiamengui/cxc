!macro NSIS_HOOK_PREUNINSTALL
  IfSilent preserve_customer_data
  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "O Caixa no Controle preserva o banco e as configuracoes por padrao.$\r$\n$\r$\nDeseja tambem remover permanentemente TODOS os dados locais deste usuario?$\r$\n$\r$\nEscolha Nao para manter os dados e reinstalar ou atualizar depois." IDNO preserve_customer_data
  RMDir /r "$APPDATA\br.com.bratecinfo.caixanocontrole"
  RMDir /r "$LOCALAPPDATA\br.com.bratecinfo.caixanocontrole"
preserve_customer_data:
!macroend
