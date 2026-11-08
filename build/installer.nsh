; =====================================================================
;  AsturCut — instalador personalizado (tela moderna escura, estilo apps atuais)
;  Fluxo: tela de boas-vindas (idioma, pasta, atalho) -> progresso -> o AsturCut abre sozinho
; =====================================================================
!include nsDialogs.nsh
!include LogicLib.nsh
!include WinMessages.nsh

; funções compartilhadas recebem o prefixo "un." no desinstalador
!ifdef BUILD_UNINSTALLER
  !define ASTUR_P "un."
!else
  !define ASTUR_P ""
!endif

!if 1
  Var AsturLang      ; pt | en | es
  Var AsturDelData   ; 1 = apagar preferências ao desinstalar
  Var AsturDesk      ; 1 = criar atalho na área de trabalho
  Var AsturScale     ; 100 | 125 | 150 | 200 (escala de DPI)
  Var AsturDlg
  Var AsturTitle
  Var AsturSub
  Var AsturLblLang
  Var AsturLblDir
  Var AsturDirText
  Var AsturChange
  Var AsturSwitch
  Var AsturLblDesk
  Var AsturFoot
  Var AsturBtn
  Var AsturPt
  Var AsturEn
  Var AsturEs
  Var AsturFontTitle
  Var AsturFontText
  Var AsturFontSmall
  Var AsturFontBold
!endif

; ---------- utilitários ----------
; escala um retângulo (base 96 DPI) para a escala atual -> $R6..$R9
!macro AsturRect X Y W H
  IntOp $R6 ${X} * $AsturScale
  IntOp $R6 $R6 / 100
  IntOp $R7 ${Y} * $AsturScale
  IntOp $R7 $R7 / 100
  IntOp $R8 ${W} * $AsturScale
  IntOp $R8 $R8 / 100
  IntOp $R9 ${H} * $AsturScale
  IntOp $R9 $R9 / 100
!macroend

; carrega um bitmap da pasta de recursos e coloca num controle STATIC
!macro AsturSetBmp CTL NAME
  System::Call 'user32::LoadImage(p 0, t "$PLUGINSDIR\ui\${NAME}_$AsturScale.bmp", i 0, i 0, i 0, i 0x10) p .r0'
  SendMessage ${CTL} 0x172 0 $0
!macroend

; cria um texto com cor e fonte
!macro AsturLabel VAR X Y W H TEXT COLOR BG FONT EXTRA
  !insertmacro AsturRect ${X} ${Y} ${W} ${H}
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${EXTRA} 0 $R6 $R7 $R8 $R9 "${TEXT}"
  Pop ${VAR}
  SetCtlColors ${VAR} ${COLOR} ${BG}
  SendMessage ${VAR} ${WM_SETFONT} ${FONT} 1
!macroend

; cria uma imagem clicável
!macro AsturImage VAR X Y W H NAME
  !insertmacro AsturRect ${X} ${Y} ${W} ${H}
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|0x0E|0x40|0x100 0 $R6 $R7 $R8 $R9 ""
  Pop ${VAR}
  !insertmacro AsturSetBmp ${VAR} ${NAME}
!macroend

; esconde a moldura padrão do instalador (cabeçalho, botões, marca)
!macro AsturHideChrome
  Push $0
  !insertmacro AsturHideId 1
  !insertmacro AsturHideId 2
  !insertmacro AsturHideId 3
  !insertmacro AsturHideId 1028
  !insertmacro AsturHideId 1256
  !insertmacro AsturHideId 1034
  !insertmacro AsturHideId 1035
  !insertmacro AsturHideId 1036
  !insertmacro AsturHideId 1037
  !insertmacro AsturHideId 1038
  !insertmacro AsturHideId 1039
  !insertmacro AsturHideId 1045
  Pop $0
!macroend
!macro AsturHideId ID
  GetDlgItem $0 $HWNDPARENT ${ID}
  ShowWindow $0 ${SW_HIDE}
!macroend


; ---------- funções compartilhadas (instalador e desinstalador) ----------
Function ${ASTUR_P}AsturGuiInit
  ; escala de DPI
  System::Call 'user32::GetDpiForWindow(p $HWNDPARENT) i .r0'
  ${If} $0 < 96
    StrCpy $0 96
  ${EndIf}
  ${If} $0 >= 192
    StrCpy $AsturScale 200
  ${ElseIf} $0 >= 144
    StrCpy $AsturScale 150
  ${ElseIf} $0 >= 120
    StrCpy $AsturScale 125
  ${Else}
    StrCpy $AsturScale 100
  ${EndIf}
  Call ${ASTUR_P}AsturResize
  ; barra de título escura + cantos arredondados (Windows 10/11)
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 33, *i 2, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 35, *i 0x161414, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 34, *i 0x3A2C2C, i 4)'
  !insertmacro AsturHideChrome
  ; fontes
  CreateFont $AsturFontTitle "Segoe UI Semibold" 17 600
  CreateFont $AsturFontText "Segoe UI" 10 400
  CreateFont $AsturFontSmall "Segoe UI" 8 400
  CreateFont $AsturFontBold "Segoe UI Semibold" 8 600
FunctionEnd

Function ${ASTUR_P}AsturResize
  !insertmacro AsturRect 0 0 720 490
  System::Call '*(i,i,i,i) p .r1'
  System::Call 'user32::GetWindowRect(p $HWNDPARENT, p r1)'
  System::Call '*$1(i .r2, i .r3, i .r4, i .r5)'
  System::Call 'user32::GetClientRect(p $HWNDPARENT, p r1)'
  System::Call '*$1(i, i, i .r6, i .r7)'
  System::Free $1
  IntOp $8 $4 - $2
  IntOp $8 $8 - $6
  IntOp $8 $8 + $R8
  IntOp $9 $5 - $3
  IntOp $9 $9 - $7
  IntOp $9 $9 + $R9
  System::Call 'user32::GetSystemMetrics(i 0) i .r2'
  System::Call 'user32::GetSystemMetrics(i 1) i .r3'
  IntOp $2 $2 - $8
  IntOp $2 $2 / 2
  IntOp $3 $3 - $9
  IntOp $3 $3 / 2
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i r2, i r3, i r8, i r9, i 0x14)'
  ; a área das páginas ocupa a janela toda
  GetDlgItem $0 $HWNDPARENT 1018
  System::Call 'user32::SetWindowPos(p r0, p 0, i 0, i 0, i $R8, i $R9, i 0x14)'
FunctionEnd

Function ${ASTUR_P}AsturInstShow
  !insertmacro AsturHideChrome
  FindWindow $R0 "#32770" "" $HWNDPARENT
  SetCtlColors $R0 "FFFFFF" "141416"
  ; a página de instalação tem tamanho fixo: estica para a janela toda
  !insertmacro AsturRect 0 0 720 490
  System::Call 'user32::SetWindowPos(p $R0, p 0, i 0, i 0, i $R8, i $R9, i 0x14)'
  ; fundo escuro atrás de tudo
  System::Call 'user32::CreateWindowEx(i 0, t "STATIC", t "", i 0x50000000, i 0, i 0, i $R8, i $R9, p $R0, p 0, p 0, p 0) p .r1'
  SetCtlColors $1 "FFFFFF" "141416"
  System::Call 'user32::SetWindowPos(p r1, p 1, i 0, i 0, i 0, i 0, i 0x13)'
  ; esconde lista de detalhes e botão
  GetDlgItem $0 $R0 1016
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $R0 1027
  ShowWindow $0 ${SW_HIDE}
  ; banner
  !insertmacro AsturRect 0 0 720 210
  System::Call 'user32::CreateWindowEx(i 0, t "STATIC", t "", i 0x5000004E, i $R6, i $R7, i $R8, i $R9, p $R0, p 0, p 0, p 0) p .r1'
  !insertmacro AsturSetBmp $1 banner
  ; título
  !ifdef BUILD_UNINSTALLER
  ${If} $AsturLang == "en"
    StrCpy $2 "Removing AsturCut…"
    StrCpy $3 "Just a moment. Your projects and videos stay on your computer."
  ${ElseIf} $AsturLang == "es"
    StrCpy $2 "Eliminando AsturCut…"
    StrCpy $3 "Un momento. Tus proyectos y videos siguen en tu computadora."
  ${Else}
    StrCpy $2 "Removendo o AsturCut…"
    StrCpy $3 "Só um instante. Seus projetos e vídeos continuam no computador."
  ${EndIf}
  !else
  ${If} $AsturLang == "en"
    StrCpy $2 "Installing AsturCut…"
    StrCpy $3 "This only takes a few seconds. AsturCut will open when it's done."
  ${ElseIf} $AsturLang == "es"
    StrCpy $2 "Instalando AsturCut…"
    StrCpy $3 "Solo tarda unos segundos. AsturCut se abrirá al terminar."
  ${Else}
    StrCpy $2 "Instalando o AsturCut…"
    StrCpy $3 "Isso leva só alguns segundos. O AsturCut abre sozinho no final."
  ${EndIf}
  !endif
  !insertmacro AsturRect 40 240 640 36
  System::Call 'user32::CreateWindowEx(i 0, t "STATIC", t "$2", i 0x50000000, i $R6, i $R7, i $R8, i $R9, p $R0, p 0, p 0, p 0) p .r1'
  SetCtlColors $1 "FFFFFF" "141416"
  SendMessage $1 ${WM_SETFONT} $AsturFontTitle 1
  !insertmacro AsturRect 41 280 640 22
  System::Call 'user32::CreateWindowEx(i 0, t "STATIC", t "$3", i 0x50000000, i $R6, i $R7, i $R8, i $R9, p $R0, p 0, p 0, p 0) p .r1'
  SetCtlColors $1 "9A9AA3" "141416"
  SendMessage $1 ${WM_SETFONT} $AsturFontText 1
  ; barra de progresso plana (ciano)
  GetDlgItem $1 $R0 1004
  System::Call 'uxtheme::SetWindowTheme(p r1, w "", w "")'
  System::Call 'user32::GetWindowLong(p r1, i -16) i .r2'
  IntOp $2 $2 | 1
  System::Call 'user32::SetWindowLong(p r1, i -16, i r2)'
  System::Call 'user32::SetWindowLong(p r1, i -20, i 0)'
  SendMessage $1 0x409 0 0xDCCF1C
  SendMessage $1 0x2001 0 0x2A2626
  !insertmacro AsturRect 40 340 640 8
  System::Call 'user32::SetWindowPos(p r1, p 0, i $R6, i $R7, i $R8, i $R9, i 0x34)'
  ; texto de status (arquivo sendo extraído) discreto
  GetDlgItem $1 $R0 1006
  SetCtlColors $1 "6E6E78" "141416"
  SendMessage $1 ${WM_SETFONT} $AsturFontSmall 1
  !insertmacro AsturRect 40 360 640 18
  System::Call 'user32::SetWindowPos(p r1, p 0, i $R6, i $R7, i $R8, i $R9, i 0x14)'
FunctionEnd

!ifndef BUILD_UNINSTALLER

; ---------- textos nos três idiomas ----------
Function AsturTexts
  ${If} $AsturLang == "en"
    StrCpy $R0 "Welcome to AsturCut"
    StrCpy $R1 "Edit amazing videos, your way. Ready to install?"
    StrCpy $R2 "LANGUAGE"
    StrCpy $R3 "INSTALL FOLDER"
    StrCpy $R4 "Change"
    StrCpy $R5 "Create a desktop shortcut"
    StrCpy $5 "Free  ·  MIT license  ·  about 350 MB"
  ${ElseIf} $AsturLang == "es"
    StrCpy $R0 "Te damos la bienvenida a AsturCut"
    StrCpy $R1 "Edita videos increíbles, a tu manera. ¿Instalamos?"
    StrCpy $R2 "IDIOMA"
    StrCpy $R3 "CARPETA DE INSTALACIÓN"
    StrCpy $R4 "Cambiar"
    StrCpy $R5 "Crear un acceso directo en el escritorio"
    StrCpy $5 "Gratis  ·  Licencia MIT  ·  unos 350 MB"
  ${Else}
    StrCpy $R0 "Bem-vindo ao AsturCut"
    StrCpy $R1 "Edite vídeos incríveis, do seu jeito. Vamos instalar?"
    StrCpy $R2 "IDIOMA"
    StrCpy $R3 "PASTA DE INSTALAÇÃO"
    StrCpy $R4 "Alterar"
    StrCpy $R5 "Criar atalho na área de trabalho"
    StrCpy $5 "Gratuito  ·  Licença MIT  ·  cerca de 350 MB"
  ${EndIf}
FunctionEnd

Function AsturApplyLang
  Call AsturTexts
  ${If} $AsturTitle != ""
    SendMessage $AsturTitle ${WM_SETTEXT} 0 "STR:$R0"
    SendMessage $AsturSub ${WM_SETTEXT} 0 "STR:$R1"
    SendMessage $AsturLblLang ${WM_SETTEXT} 0 "STR:$R2"
    SendMessage $AsturLblDir ${WM_SETTEXT} 0 "STR:$R3"
    SendMessage $AsturChange ${WM_SETTEXT} 0 "STR:$R4"
    SendMessage $AsturLblDesk ${WM_SETTEXT} 0 "STR:$R5"
    SendMessage $AsturFoot ${WM_SETTEXT} 0 "STR:$5"
    ${If} $AsturLang == "pt"
      !insertmacro AsturSetBmp $AsturPt lang_pt_on
    ${Else}
      !insertmacro AsturSetBmp $AsturPt lang_pt
    ${EndIf}
    ${If} $AsturLang == "en"
      !insertmacro AsturSetBmp $AsturEn lang_en_on
    ${Else}
      !insertmacro AsturSetBmp $AsturEn lang_en
    ${EndIf}
    ${If} $AsturLang == "es"
      !insertmacro AsturSetBmp $AsturEs lang_es_on
    ${Else}
      !insertmacro AsturSetBmp $AsturEs lang_es
    ${EndIf}
    !insertmacro AsturSetBmp $AsturBtn btn_install_$AsturLang
  ${EndIf}
FunctionEnd

Function AsturPickPt
  StrCpy $AsturLang "pt"
  Call AsturApplyLang
FunctionEnd
Function AsturPickEn
  StrCpy $AsturLang "en"
  Call AsturApplyLang
FunctionEnd
Function AsturPickEs
  StrCpy $AsturLang "es"
  Call AsturApplyLang
FunctionEnd

Function AsturToggleDesk
  ${If} $AsturDesk == "1"
    StrCpy $AsturDesk "0"
    !insertmacro AsturSetBmp $AsturSwitch switch_off
  ${Else}
    StrCpy $AsturDesk "1"
    !insertmacro AsturSetBmp $AsturSwitch switch_on
  ${EndIf}
FunctionEnd

Function AsturBrowse
  Call AsturTexts
  nsDialogs::SelectFolderDialog "$R3" "$INSTDIR"
  Pop $0
  ${If} $0 != "error"
  ${AndIf} $0 != ""
    StrCpy $1 $0 "" -8
    ${If} $1 != "AsturCut"
      StrCpy $0 "$0\AsturCut"
    ${EndIf}
    StrCpy $INSTDIR $0
    SendMessage $AsturDirText ${WM_SETTEXT} 0 "STR:  $INSTDIR"
  ${EndIf}
FunctionEnd

Function AsturInstallClick
  SendMessage $HWNDPARENT 0x408 1 0
FunctionEnd

; ---------- janela: tamanho, título escuro, cantos ----------


; janela com área interna de 720 x 490 (na escala atual), centralizada


; ---------- página 1: boas-vindas ----------
Function AsturWelcome
  ; instalações silenciosas (atualizações automáticas) pulam a tela
  IfSilent 0 +2
    Abort
  !insertmacro AsturHideChrome
  nsDialogs::Create 1018
  Pop $AsturDlg
  ${If} $AsturDlg == error
    Abort
  ${EndIf}
  SetCtlColors $AsturDlg "FFFFFF" "141416"
  Call AsturTexts

  ; banner com o logo
  !insertmacro AsturImage $1 0 0 720 210 banner

  !insertmacro AsturLabel $AsturTitle 40 212 640 34 "$R0" "FFFFFF" "141416" $AsturFontTitle 0
  !insertmacro AsturLabel $AsturSub 41 248 640 22 "$R1" "9A9AA3" "141416" $AsturFontText 0

  ; idioma
  !insertmacro AsturLabel $AsturLblLang 41 286 300 16 "$R2" "8D8D96" "141416" $AsturFontBold 0
  !insertmacro AsturImage $AsturPt 40 304 150 38 lang_pt
  ${NSD_OnClick} $AsturPt AsturPickPt
  !insertmacro AsturImage $AsturEn 198 304 150 38 lang_en
  ${NSD_OnClick} $AsturEn AsturPickEn
  !insertmacro AsturImage $AsturEs 356 304 150 38 lang_es
  ${NSD_OnClick} $AsturEs AsturPickEs

  ; pasta
  !insertmacro AsturLabel $AsturLblDir 41 356 300 16 "$R3" "8D8D96" "141416" $AsturFontBold 0
  !insertmacro AsturLabel $AsturDirText 40 374 560 32 "  $INSTDIR" "D6D6DC" "1E1E21" $AsturFontText 0x8200
  !insertmacro AsturLabel $AsturChange 604 374 76 32 "$R4" "1CCFDC" "1E1E21" $AsturFontBold 0x301
  ${NSD_OnClick} $AsturChange AsturBrowse

  ; atalho na área de trabalho
  !insertmacro AsturImage $AsturSwitch 38 422 44 26 switch_on
  ${NSD_OnClick} $AsturSwitch AsturToggleDesk
  !insertmacro AsturLabel $AsturLblDesk 88 426 360 20 "$R5" "D6D6DC" "141416" $AsturFontText 0x100
  ${NSD_OnClick} $AsturLblDesk AsturToggleDesk

  ; rodapé e botão principal
  !insertmacro AsturLabel $AsturFoot 41 460 420 18 "$5" "6E6E78" "141416" $AsturFontSmall 0
  !insertmacro AsturImage $AsturBtn 490 420 210 58 btn_install_pt
  ${NSD_OnClick} $AsturBtn AsturInstallClick

  Call AsturApplyLang
  nsDialogs::Show
FunctionEnd

Function AsturWelcomeLeave
FunctionEnd

; ---------- página 2: progresso estilizado ----------


; ---------- página 3: tudo pronto ----------
Var AsturFinBtn
Function AsturFinish
  IfSilent 0 +2
    Abort
  !insertmacro AsturHideChrome
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  SetCtlColors $0 "FFFFFF" "141416"
  !insertmacro AsturImage $1 0 0 720 210 banner
  ${If} $AsturLang == "en"
    StrCpy $2 "All set!"
    StrCpy $3 "AsturCut is installed. Time to create your first video."
  ${ElseIf} $AsturLang == "es"
    StrCpy $2 "¡Todo listo!"
    StrCpy $3 "AsturCut está instalado. Es hora de crear tu primer video."
  ${Else}
    StrCpy $2 "Tudo pronto!"
    StrCpy $3 "O AsturCut foi instalado. Hora de criar o seu primeiro vídeo."
  ${EndIf}
  !insertmacro AsturLabel $4 40 236 640 40 "$2" "FFFFFF" "141416" $AsturFontTitle 0
  !insertmacro AsturLabel $4 41 280 640 22 "$3" "9A9AA3" "141416" $AsturFontText 0
  !insertmacro AsturImage $AsturFinBtn 490 420 210 58 btn_open_$AsturLang
  ${NSD_OnClick} $AsturFinBtn AsturOpenApp
  nsDialogs::Show
FunctionEnd
Function AsturOpenApp
  Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  SendMessage $HWNDPARENT 0x408 1 0
FunctionEnd
Function AsturFinishLeave
FunctionEnd

!endif ; BUILD_UNINSTALLER

; ---------- páginas (modo assistente) ----------
; pula a escolha "só para mim / todos": instala sempre para o usuário atual (sem pedir administrador)
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customHeader
  AutoCloseWindow true
!macroend

!macro customWelcomePage
  !define MUI_CUSTOMFUNCTION_GUIINIT AsturGuiInit
  Page custom AsturWelcome AsturWelcomeLeave
!macroend

!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW AsturInstShow
!macroend

!macro customFinishPage
  Page custom AsturFinish AsturFinishLeave
!macroend

; ---------- inicialização: extrai a arte e escolhe o idioma inicial ----------
!macro customInit
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\ui"
  File "${BUILD_RESOURCES_DIR}\installer\*.bmp"
  StrCpy $AsturDesk "1"
  IntOp $0 $LANGUAGE & 0x3FF
  ${If} $0 = 22
    StrCpy $AsturLang "pt"
  ${ElseIf} $0 = 10
    StrCpy $AsturLang "es"
  ${Else}
    StrCpy $AsturLang "en"
  ${EndIf}
!macroend

; ---------- depois de copiar os arquivos ----------
!macro customInstall
  ; idioma escolhido -> o AsturCut abre no mesmo idioma
  ${If} $AsturLang == "pt"
    StrCpy $0 "1046"
  ${ElseIf} $AsturLang == "en"
    StrCpy $0 "1033"
  ${ElseIf} $AsturLang == "es"
    StrCpy $0 "3082"
  ${Else}
    StrCpy $0 "$LANGUAGE"
  ${EndIf}
  FileOpen $1 "$INSTDIR\resources\installer-lang.txt" w
  FileWrite $1 "$0"
  FileClose $1
  ; atalho na área de trabalho (opcional)
  ${If} $AsturDesk == "1"
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  ${EndIf}
!macroend

!macro customUnInstall
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  ; preferências e dados do app (só se a pessoa marcou e não é atualização)
  ${If} $AsturDelData == "1"
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
  ${EndIf}
!macroend

; =====================================================================
;  Desinstalador no mesmo visual
; =====================================================================
!ifdef BUILD_UNINSTALLER
Var AsturUnSwitch
Function un.AsturToggleData
  ${If} $AsturDelData == "1"
    StrCpy $AsturDelData "0"
    !insertmacro AsturSetBmp $AsturUnSwitch switch_off
  ${Else}
    StrCpy $AsturDelData "1"
    !insertmacro AsturSetBmp $AsturUnSwitch switch_on
  ${EndIf}
FunctionEnd
Function un.AsturDoUninstall
  SendMessage $HWNDPARENT 0x408 1 0
FunctionEnd
Function un.AsturCancel
  SendMessage $HWNDPARENT ${WM_COMMAND} 2 0
FunctionEnd

Function un.AsturUnWelcome
  IfSilent 0 +2
    Abort
  !insertmacro AsturHideChrome
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  SetCtlColors $0 "FFFFFF" "141416"
  ${If} $AsturLang == "en"
    StrCpy $2 "Uninstall AsturCut?"
    StrCpy $3 "Your projects (.astur) and videos will stay on your computer."
    StrCpy $4 "Also delete my preferences and app data"
  ${ElseIf} $AsturLang == "es"
    StrCpy $2 "¿Desinstalar AsturCut?"
    StrCpy $3 "Tus proyectos (.astur) y videos seguirán en tu computadora."
    StrCpy $4 "Borrar también mis preferencias y datos de la app"
  ${Else}
    StrCpy $2 "Desinstalar o AsturCut?"
    StrCpy $3 "Seus projetos (.astur) e vídeos continuam guardados no computador."
    StrCpy $4 "Apagar também minhas preferências e dados do app"
  ${EndIf}
  !insertmacro AsturImage $1 0 0 720 210 banner
  !insertmacro AsturLabel $5 40 236 640 40 "$2" "FFFFFF" "141416" $AsturFontTitle 0
  !insertmacro AsturLabel $5 41 280 640 22 "$3" "9A9AA3" "141416" $AsturFontText 0
  !insertmacro AsturImage $AsturUnSwitch 38 330 44 26 switch_off
  ${NSD_OnClick} $AsturUnSwitch un.AsturToggleData
  !insertmacro AsturLabel $5 88 334 520 20 "$4" "D6D6DC" "141416" $AsturFontText 0x100
  ${NSD_OnClick} $5 un.AsturToggleData
  !insertmacro AsturImage $5 330 420 150 58 btn_cancel_$AsturLang
  ${NSD_OnClick} $5 un.AsturCancel
  !insertmacro AsturImage $5 490 420 210 58 btn_uninstall_$AsturLang
  ${NSD_OnClick} $5 un.AsturDoUninstall
  nsDialogs::Show
FunctionEnd
Function un.AsturUnWelcomeLeave
FunctionEnd

Function un.AsturUnFinish
  IfSilent 0 +2
    Abort
  !insertmacro AsturHideChrome
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  SetCtlColors $0 "FFFFFF" "141416"
  ${If} $AsturLang == "en"
    StrCpy $2 "AsturCut was removed"
    StrCpy $3 "Thanks for using AsturCut. Come back anytime!"
  ${ElseIf} $AsturLang == "es"
    StrCpy $2 "AsturCut se eliminó"
    StrCpy $3 "Gracias por usar AsturCut. ¡Vuelve cuando quieras!"
  ${Else}
    StrCpy $2 "O AsturCut foi removido"
    StrCpy $3 "Obrigado por usar o AsturCut. Volte quando quiser!"
  ${EndIf}
  !insertmacro AsturImage $1 0 0 720 210 banner
  !insertmacro AsturLabel $5 40 236 640 40 "$2" "FFFFFF" "141416" $AsturFontTitle 0
  !insertmacro AsturLabel $5 41 280 640 22 "$3" "9A9AA3" "141416" $AsturFontText 0
  !insertmacro AsturImage $5 490 420 210 58 btn_done_$AsturLang
  ${NSD_OnClick} $5 un.AsturDoUninstall
  nsDialogs::Show
FunctionEnd
Function un.AsturUnFinishLeave
FunctionEnd
Function un.AsturSkipPage
  Abort
FunctionEnd
!endif

!macro customUnWelcomePage
  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.AsturGuiInit
  UninstPage custom un.AsturUnWelcome un.AsturUnWelcomeLeave
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.AsturInstShow
!macroend

!macro customUninstallPage
  UninstPage custom un.AsturUnFinish un.AsturUnFinishLeave
  ; pula a página final padrão
  !define MUI_PAGE_CUSTOMFUNCTION_PRE un.AsturSkipPage
!macroend

!macro customUnInit
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\ui"
  File "${BUILD_RESOURCES_DIR}\installer\banner_*.bmp"
  File "${BUILD_RESOURCES_DIR}\installer\switch_*.bmp"
  File "${BUILD_RESOURCES_DIR}\installer\btn_uninstall_*.bmp"
  File "${BUILD_RESOURCES_DIR}\installer\btn_cancel_*.bmp"
  File "${BUILD_RESOURCES_DIR}\installer\btn_done_*.bmp"
  StrCpy $AsturDelData "0"
  ; idioma: o mesmo escolhido na instalação
  StrCpy $0 ""
  ClearErrors
  FileOpen $1 "$INSTDIR\resources\installer-lang.txt" r
  ${IfNot} ${Errors}
    FileRead $1 $0
    FileClose $1
  ${EndIf}
  ${If} $0 == ""
    StrCpy $0 $LANGUAGE
  ${EndIf}
  IntOp $0 $0 & 0x3FF
  ${If} $0 = 22
    StrCpy $AsturLang "pt"
  ${ElseIf} $0 = 10
    StrCpy $AsturLang "es"
  ${Else}
    StrCpy $AsturLang "en"
  ${EndIf}
!macroend
