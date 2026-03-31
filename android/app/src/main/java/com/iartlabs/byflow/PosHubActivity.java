package com.iartlabs.byflow;

import android.os.Bundle;
import android.view.View;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class PosHubActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_pos_hub);

        TextView statusLine = findViewById(R.id.pos_hub_status_line);
        SimpleDateFormat formatter = new SimpleDateFormat("dd/MM/yyyy HH:mm", new Locale("es", "MX"));
        String statusText = "Wrapper listo - Backend Railway - " + formatter.format(new Date());
        statusLine.setText(statusText);

        bindRoute(R.id.hub_btn_mesas, "bares-v2.html?native=android", "mesas");
        bindRoute(R.id.hub_btn_comandas, "bares-v2.html?native=android", "comandas");
        bindRoute(R.id.hub_btn_cocina, "bares-v2.html?native=android", "cocina");
        bindRoute(R.id.hub_btn_inventario, "bares-v2.html?native=android", "inventario");
        bindRoute(R.id.hub_btn_corte, "bares-v2.html?native=android", "corte");
        bindRoute(R.id.hub_btn_wrapper, "index.html?native=android", null);
    }

    private void bindRoute(int viewId, final String startPath, final String targetView) {
        View target = findViewById(viewId);
        if (target == null) {
            return;
        }

        target.setOnClickListener(v -> startActivity(MainActivity.createLaunchIntent(PosHubActivity.this, startPath, targetView)));
    }
}
