package com.pioneerfeeders.keeldashboard;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.AsyncTask;

import org.json.JSONObject;
import org.json.JSONArray;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class InboxWidgetProvider extends AppWidgetProvider {

    private static final String API_URL = "https://lively-learning-production-0ca0.up.railway.app/widget-inbox/070591cc-89ac-4c59-9b8e-55d351a56d90";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            new FetchInboxTask(context, appWidgetManager, appWidgetId).execute();
        }
    }

    private static class FetchInboxTask extends AsyncTask<Void, Void, JSONObject> {
        private final Context context;
        private final AppWidgetManager manager;
        private final int widgetId;

        FetchInboxTask(Context context, AppWidgetManager manager, int widgetId) {
            this.context = context;
            this.manager = manager;
            this.widgetId = widgetId;
        }

        @Override
        protected JSONObject doInBackground(Void... voids) {
            try {
                URL url = new URL(API_URL);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);

                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder result = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) result.append(line);
                reader.close();

                return new JSONObject(result.toString());
            } catch (Exception e) {
                return null;
            }
        }

        @Override
        protected void onPostExecute(JSONObject data) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_inbox);

            try {
                if (data == null) throw new Exception("No data");

                int approvals = data.optInt("approvals", 0);
                int failedRuns = data.optInt("failed_runs", 0);
                int mentions = data.optInt("mentions", 0);
                int totalAgents = data.optInt("total_agents", 0);
                int activeAgents = data.optInt("active_agents", 0);
                String lastUpdate = data.optString("updated", "--:--");
                int totalInbox = approvals + failedRuns + mentions;

                views.setTextViewText(R.id.widget_inbox_count, String.valueOf(totalInbox));
                views.setTextViewText(R.id.widget_approvals, approvals > 0 ? approvals + " approvals" : "No approvals");
                views.setTextViewText(R.id.widget_failed, failedRuns > 0 ? failedRuns + " failed" : "No failures");
                views.setTextViewText(R.id.widget_mentions, mentions > 0 ? mentions + " mentions" : "No mentions");
                views.setTextViewText(R.id.widget_agents_status, activeAgents + "/" + totalAgents + " active");
                views.setTextViewText(R.id.widget_updated, lastUpdate);

                if (totalInbox > 0) {
                    views.setTextColor(R.id.widget_inbox_count, 0xFFF87171);
                    views.setTextViewText(R.id.widget_inbox_label, "NEEDS ATTENTION");
                } else {
                    views.setTextColor(R.id.widget_inbox_count, 0xFF34D399);
                    views.setTextViewText(R.id.widget_inbox_label, "ALL CLEAR");
                }

                JSONArray items = data.optJSONArray("items");
                StringBuilder itemList = new StringBuilder();
                if (items != null && items.length() > 0) {
                    int limit = Math.min(items.length(), 4);
                    for (int i = 0; i < limit; i++) {
                        if (i > 0) itemList.append("\n");
                        itemList.append("\u2022 ").append(items.getJSONObject(i).optString("title", ""));
                    }
                } else {
                    itemList.append("No pending items");
                }
                views.setTextViewText(R.id.widget_items, itemList.toString());

            } catch (Exception e) {
                views.setTextViewText(R.id.widget_inbox_count, "?");
                views.setTextViewText(R.id.widget_items, "Tap to refresh");
            }

            // Open app on tap
            Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (intent != null) {
                PendingIntent pi = PendingIntent.getActivity(context, widgetId, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                views.setOnClickPendingIntent(R.id.widget_root, pi);
            }

            manager.updateAppWidget(widgetId, views);
        }
    }
}
