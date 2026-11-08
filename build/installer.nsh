; Grava o idioma escolhido no instalador para o AsturCut abrir no mesmo idioma
!macro customInstall
  FileOpen $0 "$INSTDIR\resources\installer-lang.txt" w
  FileWrite $0 "$LANGUAGE"
  FileClose $0
!macroend
