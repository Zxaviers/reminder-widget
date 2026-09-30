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

            // Scrollable list backed by WidgetTaskService. The data URI carries
            // current timestamp so every update binds a FRESH factory that
            // reads the current file and resets scroll to row 0 (audit D1).
            val nowMs = System.currentTimeMillis()
            val serviceIntent = Intent(context, WidgetTaskService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                data = Uri.parse("reminderwidget://tasks/$appWidgetId/$nowMs")
            }
            views.setRemoteAdapter(R.id.widget_task_list, serviceIntent)
            views.setEmptyView(R.id.widget_task_list, R.id.widget_empty_view)

            // Relative sync age from the tasks file mtime — same words as the
            // app ("sync 5 mnt"), never an absolute clock (audit C8).
            val syncAgeMs = findWidgetTasksFile(context)?.lastModified()?.let { nowMs - it }
            views.setTextViewText(R.id.widget_sync_time, syncText(syncAgeMs))

            // Hero shows tasks[0]; the service list shows the rest.
            val hero = loadFirstTask(context)
            if (hero == null) {
                views.setViewVisibility(R.id.widget_hero, View.GONE)
            } else {
                views.setViewVisibility(R.id.widget_hero, View.VISIBLE)
                val remainingMs = hero.dueMs - nowMs
                val (heroText, heroColor) = heroLabel(remainingMs)
                views.setTextViewText(R.id.widget_hero_count, heroText)
                views.setTextColor(R.id.widget_hero_count, android.graphics.Color.parseColor(heroColor))
                val src = hero.course.ifEmpty { "BRONE" }
                views.setTextViewText(R.id.widget_hero_sub, "${hero.title} · $src")
            }

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

        private fun findWidgetTasksFile(context: Context): File? {
            val files = listOf(
                File(context.dataDir, "widget_tasks.json"),
                File(context.filesDir, "widget_tasks.json"),
                File(context.noBackupFilesDir, "widget_tasks.json")
            )
            return files.firstOrNull { it.exists() }
        }

        private fun loadFirstTask(context: Context): WidgetTaskService.TaskItem? {
            val file = findWidgetTasksFile(context) ?: return null
            try {
                val array = org.json.JSONArray(file.readText())
                if (array.length() == 0) return null
                val obj = array.getJSONObject(0)
                return WidgetTaskService.TaskItem(
                    id = obj.optString("id", ""),
                    title = obj.optString("title", ""),
                    course = obj.optString("course", ""),
                    dueMs = obj.optLong("dueMs", 0L)
                )
            } catch (_: Exception) {
                return null
            }
        }

        private fun syncText(ageMs: Long?): String {
            if (ageMs == null || ageMs < 0) return "sync"
            if (ageMs < 90 * 1000L) return "sync baru saja"
            val minutes = ageMs / (60 * 1000L)
            if (minutes < 60) return "sync ${minutes} mnt"
            val hours = minutes / 60
            if (hours < 24) return "sync ${hours} jam"
            return "sync ${hours / 24} hari"
        }

        private fun heroLabel(remainingMs: Long): Pair<String, String> {
            val hourMs = 60 * 60 * 1000L
            val dayMs = 24 * hourMs
            return when {
                remainingMs <= 0 -> {
                    val overdueMinutes = Math.abs(remainingMs) / (60 * 1000L)
                    val overdueHours = overdueMinutes / 60
                    val label = if (overdueMinutes < 60) {
                        "Terlewat ${Math.max(overdueMinutes, 1)}mnt"
                    } else if (overdueHours < 24) {
                        "Terlewat ${overdueHours}j"
                    } else {
                        "Terlewat ${overdueHours / 24} hari"
                    }
                    Pair(label, "#D66161")
                }
                remainingMs < dayMs -> {
                    val hours = Math.max(1L, remainingMs / hourMs)
                    Pair("${hours} jam lagi", "#E8B85E") // soon token (dark)
                }
                else -> {
                    val days = remainingMs / dayMs
                    Pair("${days} hari lagi", "#F2F1EE") // neutral ink-900
                }
            }
        }

        private fun hasWidgetTasks(context: Context): Boolean {
            val file = findWidgetTasksFile(context) ?: return false
            try {
                val text = file.readText().trim()
                if (text.isNotEmpty() && text != "[]") return true
            } catch (_: Exception) {
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
