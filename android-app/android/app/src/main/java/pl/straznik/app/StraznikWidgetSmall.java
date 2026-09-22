package pl.straznik.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** Mały widżet 2×2: pierwsze obserwowane województwo. Logika w {@link Widgets}. */
public class StraznikWidgetSmall extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        Widgets.redrawAll(c);
        Widgets.schedule(c);
        final PendingResult pr = goAsync();
        Widgets.refreshAsync(c, pr::finish);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle o) {
        // zmiana rozmiaru: inna liczba wierszy / punkty w wierszu poziomu
        Widgets.redrawAll(c);
    }

    @Override
    public void onDisabled(Context c) {
        Widgets.unscheduleIfUnused(c);
    }
}
