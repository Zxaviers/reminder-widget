package dev.riski.reminderwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ReminderAppWidgetProvider : AppWidgetProvider() {

    companion object {
        const val ACTION_UPDATE_WIDGET = "dev.riski.reminderwidget.ACTION_UPDATE_WIDGET"
        const val EXTRA_TASK_ID = "dev.riski.reminderwidget.EXTRA_TASK_ID"

        fun updateAllWidgets(context: Context) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val thisWidget = ComponentName(context, ReminderAppWidgetProvider::class.java)
            val allWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget)
            for (widgetId in allWidgetIds) {
                updateAppWidget(context, appWidgetManager, widgetId)
            }
        }

        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_reminder_layout)

            // Click anywhere to launch MainActivity.
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
            views.setPendingIntentTemplate(R.id.widget_task_list, pendingIntent)

            // Scrollable list backed by WidgetTaskService.
            val serviceIntent = Intent(context, WidgetTaskService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                // Distinct URI per widget so the system does not reuse one factory.
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }
            views.setRemoteAdapter(R.id.widget_task_list, serviceIntent)
            views.setEmptyView(R.id.widget_task_list, R.id.widget_empty_view)

            // Update timestamp.
            val nowMs = System.currentTimeMillis()
            val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
            views.setTextViewText(R.id.widget_sync_time, "Sync ${timeFormat.format(Date(nowMs))}")

            // Empty-view toggle needs a count; the rows themselves come from
            // the service. A missing file means "not synced yet".
            val hasTasks = hasWidgetTasks(context)
            views.setViewVisibility(
                R.id.widget_task_list,
                if (hasTasks) View.VISIBLE else View.GONE
            )
            views.setViewVisibility(
                R.id.widget_empty_view,
                if (hasTasks) View.GONE else View.VISIBLE
            )

            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_task_list)
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun hasWidgetTasks(context: Context): Boolean {
            val files = listOf(
                File(context.dataDir, "widget_tasks.json"),
                File(context.filesDir, "widget_tasks.json"),
                File(context.noBackupFilesDir, "widget_tasks.json")
            )
            for (file in files) {
                if (!file.exists()) continue
                try {
                    val text = file.readText().trim()
                    if (text.isNotEmpty() && text != "[]") return true
                    return false
                } catch (_: Exception) {
                }
            }
            return false
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_UPDATE_WIDGET) {
            updateAllWidgets(context)
        }
    }
}
