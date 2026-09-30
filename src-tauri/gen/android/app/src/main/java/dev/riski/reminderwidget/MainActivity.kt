package dev.riski.reminderwidget

import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
import androidx.activity.enableEdgeToEdge
import java.io.File

class MainActivity : TauriActivity() {
  private var settingsObserver: android.os.FileObserver? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    setupSettingsObserver()
  }

  override fun onDestroy() {
    settingsObserver?.stopWatching()
    settingsObserver = null
    super.onDestroy()
  }

  override fun onResume() {
    super.onResume()
    // The in-app theme (dark/light/auto) lives in settings.json, written by
    // Rust on every change. Static themes.xml only follows the OS, so re-apply
    // the icon style here: covers fresh launch, foreground return, and the
    // settings→home back navigation after a theme toggle (audit A1).
    applyStatusBarFromSettings()
    ReminderAppWidgetProvider.updateAllWidgets(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    // OS night flip while foregrounded (audit A1, Otomatis case).
    applyStatusBarFromSettings()
  }

  private fun setupSettingsObserver() {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        settingsObserver = object : android.os.FileObserver(dataDir, CLOSE_WRITE or MOVED_TO) {
          override fun onEvent(event: Int, path: String?) {
            if (path == null || path.contains("settings.json")) {
              runOnUiThread { applyStatusBarFromSettings() }
            }
          }
        }
      } else {
        @Suppress("DEPRECATION")
        settingsObserver = object : android.os.FileObserver(dataDir.absolutePath, CLOSE_WRITE or MOVED_TO) {
          override fun onEvent(event: Int, path: String?) {
            if (path == null || path.contains("settings.json")) {
              runOnUiThread { applyStatusBarFromSettings() }
            }
          }
        }
      }
      settingsObserver?.startWatching()
    } catch (_: Exception) {
    }
  }

  companion object {
    /** Light (white) icons for dark surfaces, dark icons for light ones. */
    @JvmStatic
    fun applyStatusBarAppearance(activity: android.app.Activity, lightIcons: Boolean) {
      try {
        if (Build.VERSION.SDK_INT < 30) return
        activity.runOnUiThread {
          try {
            // Framework API is setSystemBarsAppearance(appearance, mask).
            activity.window?.insetsController?.setSystemBarsAppearance(
              if (lightIcons) 0 else APPEARANCE_LIGHT_STATUS_BARS,
              APPEARANCE_LIGHT_STATUS_BARS
            )
          } catch (_: Exception) {
          }
        }
      } catch (_: Exception) {
      }
    }
  }

  private fun applyStatusBarFromSettings() {
    try {
      val theme = readThemeSetting()
      val night = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
      val dark = when (theme) {
        "dark" -> true
        "light" -> false
        else -> night == Configuration.UI_MODE_NIGHT_YES
      }
      applyStatusBarAppearance(this, dark)
    } catch (_: Exception) {
    }
  }

  /** Best effort: any failure keeps the current (static-theme) behavior. */
  private fun readThemeSetting(): String {
    val candidates = listOf(
      File(dataDir, "settings.json"),
      File(filesDir, "settings.json"),
      File(noBackupFilesDir, "settings.json")
    )
    for (file in candidates) {
      try {
        if (!file.exists()) continue
        val text = file.readText()
        val key = "\"theme\""
        val at = text.indexOf(key)
        if (at < 0) continue
        val colon = text.indexOf(':', at + key.length)
        if (colon < 0) continue
        val firstQuote = text.indexOf('"', colon + 1)
        if (firstQuote < 0) continue
        val endQuote = text.indexOf('"', firstQuote + 1)
        if (endQuote < 0) continue
        return text.substring(firstQuote + 1, endQuote).trim()
      } catch (_: Exception) {
      }
    }
    return "auto"
  }

  override fun onPause() {
    super.onPause()
    ReminderAppWidgetProvider.updateAllWidgets(this)
  }
}

