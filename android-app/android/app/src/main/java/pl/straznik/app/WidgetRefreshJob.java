package pl.straznik.app;

import android.app.job.JobParameters;
import android.app.job.JobService;

/**
 * Odświeżenie widżetu co ~30 min, tylko z siecią. JobScheduler zamiast usługi w tle
 * (wycofanej) — system sam grupuje wybudzenia i szanuje Doze.
 */
public class WidgetRefreshJob extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        if (!Widgets.anyPlaced(this)) {
            Widgets.unscheduleIfUnused(this);
            return false;
        }
        Widgets.refreshAsync(this, () -> jobFinished(params, false));
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return false;   // następne okno i tak przyjdzie za pół godziny
    }
}
