package com.c4isecure.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin propio: envío de SMS desde el chip de la campaña (solo activo en la versión "envios")
        registerPlugin(SmsSenderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
