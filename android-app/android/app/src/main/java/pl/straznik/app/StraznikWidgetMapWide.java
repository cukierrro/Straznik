package pl.straznik.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** Widżet z mapą 4×2 — mapa i lista obserwowanych województw. Logika w {@link Widgets}, rysowanie mapy w {@link WidgetMap}. */
public class StraznikWidgetMapWide extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        Widgets.redrawAll(c);
        Widgets.schedule(c);
        final PendingResult pr = goAsync();
        Widgets.refreshAsync(c, pr::finish);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle o) {
        // zmiana rozmiaru: inny kadr mapy i inna liczba wierszy
        Widgets.redrawAll(c);
    }

    @Override
    public void onDisabled(Context c) {
        Widgets.unscheduleIfUnused(c);
    }
}
