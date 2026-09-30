package dev.riski.reminderwidget

import android.content.Context
import android.content.Intent
import android.graphics.Color
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
            // The provider's hero block shows tasks[0]; the list shows the rest.
            val all = loadWidgetTasks(context)
            tasks = if (all.size > 1) all.drop(1) else emptyList()
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
            views.setTextViewText(R.id.widget_row_src, task.course.ifEmpty { "BRONE" })

            val remainingMs = task.dueMs - System.currentTimeMillis()
            val (timeText, colorHex) = formatRelativeTime(remainingMs)
            views.setTextViewText(R.id.widget_row_time, timeText)
            views.setTextColor(R.id.widget_row_time, Color.parseColor(colorHex))
            // Urgency = left-border strip + colored time text (never color alone:
            // timeText always carries the word/number label).
            views.setInt(
                R.id.widget_row_border,
                "setBackgroundColor",
                Color.parseColor(colorHex)
            )

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

        private fun formatRelativeTime(remainingMs: Long): Pair<String, String> {
            val hourMs = 60 * 60 * 1000L
            val dayMs = 24 * hourMs

            return when {
                remainingMs <= 0 -> {
                    // Never a bare label: always carry the duration.
                    // mnt (menit) / j (jam) / hr (hari) — never bare "h".
                    val overdueMinutes = Math.abs(remainingMs) / (60 * 1000L)
                    val overdueHours = overdueMinutes / 60
                    val label = if (overdueMinutes < 60) {
                        "Terlewat ${Math.max(overdueMinutes, 1)}mnt"
                    } else if (overdueHours < 24) {
                        "Terlewat ${overdueHours}j"
                    } else {
                        "Terlewat ${overdueHours / 24} hari"
                    }
                    Pair(label, "#D66161") // overdue token, 4.98:1 on #14151A
                }
                remainingMs < dayMs -> {
                    val hours = Math.max(1L, remainingMs / hourMs)
                    Pair("${hours} jam lagi", "#E8B85E") // soon token (dark)
                }
                else -> {
                    val days = remainingMs / dayMs
                    Pair("${days} hari lagi", "#B8B6B0") // neutral ink-600
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
