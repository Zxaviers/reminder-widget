package dev.riski.reminderwidget

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray
import java.io.File

/**
 * Scrollable home-widget list. Rows are rendered from the same
 * `widget_tasks.json` the Rust side syncs on every visible-list rebuild,
 * so the widget shows every synced task and scrolls instead of clipping
 * at a fixed row count.
 */
class WidgetTaskService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return WidgetTaskFactory(applicationContext)
    }

    class WidgetTaskFactory(
        private val context: Context
    ) : RemoteViewsFactory {

        private var tasks: List<TaskItem> = emptyList()

        override fun onCreate() {}

        override fun onDataSetChanged() {
            tasks = loadWidgetTasks(context)
        }

        override fun onDestroy() {
            tasks = emptyList()
        }

        override fun getCount(): Int = tasks.size

        override fun getViewAt(position: Int): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_task_row)
            if (position >= tasks.size) return views
            val task = tasks[position]

            views.setTextViewText(R.id.widget_row_title, task.title)
            if (task.course.isEmpty()) {
                views.setViewVisibility(R.id.widget_row_course, View.GONE)
            } else {
                views.setViewVisibility(R.id.widget_row_course, View.VISIBLE)
                views.setTextViewText(R.id.widget_row_course, task.course)
            }

            val remainingMs = task.dueMs - System.currentTimeMillis()
            val (timeText, dotRes, colorHex) = formatRelativeTime(remainingMs)
            views.setTextViewText(R.id.widget_row_time, timeText)
            views.setTextColor(R.id.widget_row_time, Color.parseColor(colorHex))
            views.setImageViewResource(R.id.widget_row_dot, dotRes)

            val fillIn = Intent().apply {
                putExtra(ReminderAppWidgetProvider.EXTRA_TASK_ID, task.id)
            }
            views.setOnClickFillInIntent(R.id.widget_row_root, fillIn)
            return views
        }

        override fun getLoadingView(): RemoteViews? = null

        override fun getViewTypeCount(): Int = 1

        override fun getItemId(position: Int): Long = position.toLong()

        override fun hasStableIds(): Boolean = false

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
                    Triple("${days} hari lagi", R.drawable.dot_green, "#7ee787")
                }
            }
        }

        private fun loadWidgetTasks(context: Context): List<TaskItem> {
            // Rust writes via app_config_dir(), which on Android resolves to
            // the app data root (Context.dataDir), not filesDir.
            val files = listOf(
                File(context.dataDir, "widget_tasks.json"),
                File(context.filesDir, "widget_tasks.json"),
                File(context.noBackupFilesDir, "widget_tasks.json")
            )

            for (file in files) {
                if (file.exists()) {
                    try {
                        val array = JSONArray(file.readText())
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

    data class TaskItem(
        val id: String,
        val title: String,
        val course: String,
        val dueMs: Long
    )
}
