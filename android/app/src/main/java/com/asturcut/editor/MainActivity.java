package com.asturcut.editor;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AsturNativePlugin.class);
        super.onCreate(savedInstanceState);
        // serve os vídeos importados com suporte a "Range" (avançar/voltar no vídeo)
        bridge.setWebViewClient(new AsturWebViewClient(bridge));
        // botão voltar: primeiro fecha janelas e gavetas do editor
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                bridge.getWebView().evaluateJavascript("(window.asturBack && window.asturBack()) ? '1' : '0'", (v) -> {
                    if (v == null || !v.contains("1")) moveTaskToBack(true);
                });
            }
        });
    }
}
