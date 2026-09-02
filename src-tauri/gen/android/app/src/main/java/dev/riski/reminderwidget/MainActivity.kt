package dev.riski.reminderwidget

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onResume() {
    super.onResume()
    ReminderAppWidgetProvider.updateAllWidgets(this)
  }

  override fun onPause() {
    super.onPause()
    ReminderAppWidgetProvider.updateAllWidgets(this)
  }
}

