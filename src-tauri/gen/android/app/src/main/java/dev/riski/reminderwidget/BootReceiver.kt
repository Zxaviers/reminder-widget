package dev.riski.reminderwidget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Refreshes the home-screen widget after device reboot.
 *
 * Scheduled notification alarms do NOT survive reboot (Android clears
 * AlarmManager state on restart). Alarms are rescheduled on the next app
 * open by the renderer's reschedule loop (see schedulePlan.js); this
 * receiver only keeps the visible widget data fresh.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            ReminderAppWidgetProvider.updateAllWidgets(context)
        }
    }
}
