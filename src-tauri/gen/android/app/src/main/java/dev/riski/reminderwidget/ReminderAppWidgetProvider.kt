package dev.riski.reminderwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ReminderAppWidgetProvider : AppWidgetProvider() {

    companion object {
        const val ACTION_UPDATE_WIDGET = "dev.riski.reminderwidget.ACTION_UPDATE_WIDGET"

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

            // Click entire widget to launch MainActivity
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

            // Read widget tasks data
            val tasks = loadWidgetTasks(context)
            val nowMs = System.currentTimeMillis()

            // Update timestamp
            val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
            views.setTextViewText(R.id.widget_sync_time, "Sync ${timeFormat.format(Date(nowMs))}")

            if (tasks.isEmpty()) {
                views.setViewVisibility(R.id.widget_empty_view, View.VISIBLE)
                views.setViewVisibility(R.id.widget_tasks_container, View.GONE)
            } else {
                views.setViewVisibility(R.id.widget_empty_view, View.GONE)
                views.setViewVisibility(R.id.widget_tasks_container, View.VISIBLE)

                val taskViews = listOf(
                    Triple(R.id.widget_task_1, R.id.widget_dot_1, Pair(R.id.widget_title_1, Pair(R.id.widget_course_1, R.id.widget_time_1))),
                    Triple(R.id.widget_task_2, R.id.widget_dot_2, Pair(R.id.widget_title_2, Pair(R.id.widget_course_2, R.id.widget_time_2))),
                    Triple(R.id.widget_task_3, R.id.widget_dot_3, Pair(R.id.widget_title_3, Pair(R.id.widget_course_3, R.id.widget_time_3)))
                )

                for (i in 0 until 3) {
                    val (layoutId, dotId, textPair) = taskViews[i]
                    val (titleId, subPair) = textPair
                    val (courseId, timeId) = subPair

                    if (i < tasks.size) {
                        val task = tasks[i]
                        views.setViewVisibility(layoutId, View.VISIBLE)
                        views.setTextViewText(titleId, task.title)
                        views.setTextViewText(courseId, task.course.ifEmpty { "BRONE" })

                        val remainingMs = task.dueMs - nowMs
                        val (timeText, dotRes, colorHex) = formatRelativeTime(remainingMs)

                        views.setTextViewText(timeId, timeText)
                        views.setTextColor(timeId, Color.parseColor(colorHex))
                        views.setImageViewResource(dotId, dotRes)
                    } else {
                        views.setViewVisibility(layoutId, View.GONE)
                    }
                }
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun formatRelativeTime(remainingMs: Long): Triple<String, Int, String> {
            val hourMs = 60 * 60 * 1000L
            val dayMs = 24 * hourMs

            return when {
                remainingMs <= 0 -> {
                    val overdueHours = Math.abs(remainingMs) / hourMs
                    val label = if (overdueHours < 1) "Terlewat" else "Terlewat ${overdueHours}j"
                    Triple(label, R.drawable.dot_red, "#ef4444")
                }
                remainingMs < dayMs -> {
                    val hours = Math.max(1L, remainingMs / hourMs)
                    Triple("${hours} jam lagi", R.drawable.dot_amber, "#f59e0b")
                }
                else -> {
                    val days = remainingMs / dayMs
                    Triple("${days} hari lagi", R.drawable.dot_green, "#38bdf8")
                }
            }
        }

        private fun loadWidgetTasks(context: Context): List<TaskItem> {
            val files = listOf(
                File(context.filesDir, "widget_tasks.json"),
                File(context.noBackupFilesDir, "widget_tasks.json")
            )

            for (file in files) {
                if (file.exists()) {
                    try {
                        val content = file.readText()
                        val array = JSONArray(content)
                        val list = mutableListOf<TaskItem>()
                        for (i in 0 until array.length()) {
                            val obj = array.getJSONObject(i)
                            list.add(
                                TaskItem(
                                    id = obj.optString("id", ""),
                                    title = obj.optString("title", ""),
                                    course = obj.optString("course", ""),
                                    dueMs = obj.optLong("dueMs", 0L)
                                )
                            )
                        }
                        return list
                    } catch (_: Exception) {
                    }
                }
            }
            return emptyList()
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

    data class TaskItem(
        val id: String,
        val title: String,
        val course: String,
        val dueMs: Long
    )
}
