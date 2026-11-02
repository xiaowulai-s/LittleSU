package com.xiaowulai.littlesu

import android.Manifest
import android.app.AlarmManager
import android.app.DownloadManager
import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.util.Rational
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.roundToInt

class MainActivity : TauriActivity() {
  companion object {
    @Volatile
    var instance: MainActivity? = null
  }

  private var webViewRef: WebView? = null
  private var dlnaManager: DlnaManager? = null
  private var castManager: CastManager? = null
  private var receiverRegistered = false
  private var notificationAsked = false
  private var resumeToken = 0
  private var activityPaused = false
  private val pendingInstalls = ConcurrentHashMap<Long, PendingInstall>()

  private data class PendingInstall(val url: String, val file: File)

  private val downloadReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
      val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
      if (id < 0) return
      val pending = pendingInstalls.remove(id) ?: return
      val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
      if (isDownloadSuccessful(manager, id) && isApkFile(pending.file)) {
        val uri = manager.getUriForDownloadedFile(id)
        if (uri != null && openInstaller(uri)) return
      }
      pending.file.delete()
      openInBrowser(pending.url, "安装包下载失败或文件无效，已打开浏览器下载页")
    }
  }

  private fun isDownloadSuccessful(manager: DownloadManager, id: Long): Boolean {
    val cursor = manager.query(DownloadManager.Query().setFilterById(id)) ?: return false
    cursor.use {
      if (!it.moveToFirst()) return false
      return it.getInt(it.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) == DownloadManager.STATUS_SUCCESSFUL
    }
  }

  private fun isApkFile(file: File): Boolean {
    if (!file.exists() || file.length() < 1024L) return false
    return try {
      packageManager.getPackageArchiveInfo(file.absolutePath, 0)?.packageName == packageName
    } catch (_: Exception) {
      false
    }
  }

  private fun openInstaller(uri: Uri): Boolean {
    val install = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, "application/vnd.android.package-archive")
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    return try {
      startActivity(install)
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun openInBrowser(url: String, message: String) {
    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: Exception) {
      /* 没有浏览器时保留 Toast 提示 */
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    instance = this

    // Enable edge-to-edge display
    WindowCompat.setDecorFitsSystemWindows(window, false)

    val controller = WindowInsetsControllerCompat(window, window.decorView)

    // Hide the system bars (status bar and navigation bar)
    controller.hide(WindowInsetsCompat.Type.systemBars())

    // Set the behavior for when system bars are shown (e.g., by swiping from an edge)
    controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

    val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      registerReceiver(downloadReceiver, filter)
    }
    receiverRegistered = true
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webViewRef = webView
    webView.settings.mediaPlaybackRequiresUserGesture = false
    webView.addJavascriptInterface(NativeBridge(), "LsuNative")
    dlnaManager = DlnaManager(this, webView)
    castManager = CastManager(this, webView)
  }

  override fun onPause() {
    activityPaused = true
    // 必须调用 super，否则 Android 会抛 SuperNotCalledException。
    // super 会暂停 WebView，随后在画中画/后台恢复其媒体与定时器。
    val keepPlaying = PlaybackState.active
    super.onPause()
    if (!keepPlaying) return
    val webView = webViewRef ?: return
    val token = ++resumeToken
    webView.onResume()
    webView.resumeTimers()
    for (delay in longArrayOf(400L, 1200L, 2600L)) {
      webView.postDelayed({
        if (resumeToken != token) return@postDelayed
        webView.onResume()
        webView.resumeTimers()
        sendMediaAction("play")
      }, delay)
    }
  }

  override fun onResume() {
    super.onResume()
    activityPaused = false
    webViewRef?.onResume()
  }

  /** 退到桌面时进入系统画中画，保持 WebView 可见与媒体播放。 */
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && PlaybackState.active && !isInPictureInPictureMode) {
      // 先让前端切到“只显示视频”的 PiP 布局，避免进入时闪一下完整 UI
      webViewRef?.evaluateJavascript("document.body.classList.add('lsu-pip')", null)
      val entered = try {
        enterPictureInPictureMode(
          PictureInPictureParams.Builder()
            .setAspectRatio(Rational(16, 9))
            .build()
        )
      } catch (_: Exception) {
        false
      }
      if (!entered) {
        webViewRef?.evaluateJavascript("document.body.classList.remove('lsu-pip')", null)
      }
    }
  }

  override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    webViewRef?.evaluateJavascript(
      "document.body.classList.toggle('lsu-pip', $isInPictureInPictureMode);",
      null
    )
    if (isInPictureInPictureMode) {
      webViewRef?.onResume()
      webViewRef?.resumeTimers()
    }
  }

  override fun onDestroy() {
    if (receiverRegistered) {
      try {
        unregisterReceiver(downloadReceiver)
      } catch (_: Exception) {
        /* ignore */
      }
      receiverRegistered = false
    }
    if (!isChangingConfigurations) {
      try {
        stopService(Intent(this, PlaybackService::class.java))
      } catch (_: Exception) {
        /* ignore */
      }
      PlaybackState.active = false
    }
    dlnaManager?.shutdown()
    dlnaManager = null
    castManager?.shutdown()
    castManager = null
    webViewRef = null
    activityPaused = false
    if (instance === this) instance = null
    super.onDestroy()
  }

  fun sendMediaAction(action: String, positionMs: Long = -1L) {
    runOnUiThread {
      if (action == "pause" || action == "stop") {
        resumeToken += 1
        if (activityPaused) {
          webViewRef?.onPause()
          webViewRef?.pauseTimers()
        }
      } else if (action == "play" && activityPaused) {
        // 从画中画/后台通知点播放时恢复 WebView
        webViewRef?.onResume()
        webViewRef?.resumeTimers()
      }
      val detail = if (positionMs >= 0L) {
        "{action:'$action',position:$positionMs}"
      } else {
        "{action:'$action'}"
      }
      try {
        webViewRef?.evaluateJavascript(
          "window.dispatchEvent(new CustomEvent('lsu:native-media',{detail:$detail}))",
          null
        )
      } catch (_: Exception) {
        /* WebView 已销毁时忽略 */
      }
    }
  }

  private fun ensureNotificationPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || notificationAsked) return
    if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
    notificationAsked = true
    runOnUiThread {
      try {
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS)) { }
      } catch (_: Exception) {
        /* 权限弹窗不可用时不影响播放 */
      }
    }
  }

  inner class NativeBridge {
    @Volatile
    private var screenBrightnessPercent = -1

    @JavascriptInterface
    fun getMediaVolume(): Int = try {
      val audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      if (max <= 0) 100 else (audio.getStreamVolume(AudioManager.STREAM_MUSIC) * 100f / max).roundToInt().coerceIn(0, 100)
    } catch (_: Exception) {
      100
    }

    @JavascriptInterface
    fun setMediaVolume(percent: Double) {
      try {
        val audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        if (max <= 0) return
        val target = (percent.roundToInt().coerceIn(0, 100) * max / 100f).roundToInt()
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
      } catch (_: Exception) {
        /* 部分设备在勿扰模式下拒绝调整，忽略 */
      }
    }

    @JavascriptInterface
    fun getScreenBrightness(): Int {
      if (screenBrightnessPercent > 0) return screenBrightnessPercent
      return try {
        val system = Settings.System.getInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS, 255)
        (system * 100f / 255f).roundToInt().coerceIn(1, 100)
      } catch (_: Exception) {
        100
      }
    }

    @JavascriptInterface
    fun setScreenBrightness(percent: Double) {
      val value = percent.roundToInt().coerceIn(1, 100)
      screenBrightnessPercent = value
      runOnUiThread {
        try {
          val attrs = window.attributes
          attrs.screenBrightness = value / 100f
          window.attributes = attrs
        } catch (_: Exception) {
          /* 窗口属性不可用时保留系统亮度 */
        }
      }
    }

    @JavascriptInterface
    fun resetScreenBrightness() {
      screenBrightnessPercent = -1
      runOnUiThread {
        try {
          val attrs = window.attributes
          attrs.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
          window.attributes = attrs
        } catch (_: Exception) {
          /* ignore */
        }
      }
    }

    @JavascriptInterface
    fun openCastSettings() {
      runOnUiThread {
        val actions = listOf(
          "android.settings.CAST_SETTINGS",
          Settings.ACTION_WIRELESS_SETTINGS,
          Settings.ACTION_DISPLAY_SETTINGS,
        )
        for (action in actions) {
          try {
            startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return@runOnUiThread
          } catch (_: Exception) {
            /* 尝试下一个系统设置页 */
          }
        }
        Toast.makeText(this@MainActivity, "当前系统没有投屏设置入口", Toast.LENGTH_SHORT).show()
      }
    }

    @JavascriptInterface
    fun discoverDlna(): Boolean = dlnaManager?.discover() == true

    @JavascriptInterface
    fun castDlna(deviceId: String, url: String, title: String): Boolean =
      dlnaManager?.cast(deviceId, url, title) == true

    @JavascriptInterface
    fun stopDlna(deviceId: String): Boolean = dlnaManager?.stop(deviceId) == true

    @JavascriptInterface
    fun chromecastAvailable(): Boolean = castManager?.isAvailable() == true

    @JavascriptInterface
    fun castChromecast(url: String, title: String): Boolean =
      castManager?.cast(url, title) == true

    @JavascriptInterface
    fun stopChromecast(): Boolean = castManager?.stop() == true

    @JavascriptInterface
    fun enterPipMode(): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
      return try {
        runOnUiThread {
          try {
            enterPictureInPictureMode(
              PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9)).build(),
            )
          } catch (_: Exception) {
            /* 非前台或系统不允许时忽略 */
          }
        }
        true
      } catch (_: Exception) {
        false
      }
    }

    @JavascriptInterface
    fun scheduleEpgReminder(id: String, triggerAtMs: Double, title: String, body: String): Boolean {
      if (!triggerAtMs.isFinite() || triggerAtMs <= System.currentTimeMillis()) return false
      ensureNotificationPermission()
      return try {
        val alarm = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pending = epgPendingIntent(id, title, body, true)
        alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs.toLong(), pending)
        true
      } catch (_: Exception) {
        false
      }
    }

    @JavascriptInterface
    fun cancelEpgReminder(id: String) {
      try {
        val alarm = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pending = epgPendingIntent(id)
        alarm.cancel(pending)
        pending.cancel()
      } catch (_: Exception) {
        /* ignore */
      }
    }

    private fun epgPendingIntent(
      id: String,
      title: String = "",
      body: String = "",
      withExtras: Boolean = false,
    ): PendingIntent {
      val intent = Intent(this@MainActivity, EpgReminderReceiver::class.java).apply {
        action = EpgReminderReceiver.ACTION_REMIND
        if (withExtras) {
          putExtra(EpgReminderReceiver.EXTRA_ID, id)
          putExtra(EpgReminderReceiver.EXTRA_TITLE, title)
          putExtra(EpgReminderReceiver.EXTRA_BODY, body)
        }
      }
      return PendingIntent.getBroadcast(
        this@MainActivity,
        id.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    @JavascriptInterface
    fun installApk(url: String): Boolean {
      val parsed = Uri.parse(url)
      val isApk = parsed.scheme == "https" && parsed.path?.endsWith(".apk", ignoreCase = true) == true
      if (!isApk) return false
      return try {
        val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return false
        dir.listFiles()
          ?.filter { it.name.startsWith("littlesu-update-") }
          ?.forEach { it.delete() }
        val file = File(dir, "littlesu-update-${System.currentTimeMillis()}.apk")
        val request = DownloadManager.Request(parsed)
          .setTitle("LittleSU TV 更新")
          .setDescription("正在下载安装包…")
          .setMimeType("application/vnd.android.package-archive")
          .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
          .setDestinationInExternalFilesDir(
            this@MainActivity,
            Environment.DIRECTORY_DOWNLOADS,
            file.name
          )
          .setAllowedOverMetered(true)
          .setAllowedOverRoaming(true)
          .addRequestHeader("Accept", "application/octet-stream")
          .addRequestHeader(
            "User-Agent",
            "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36"
          )
        val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val id = manager.enqueue(request)
        pendingInstalls[id] = PendingInstall(url, file)
        true
      } catch (_: Exception) {
        false
      }
    }

    @JavascriptInterface
    fun updatePlayback(
      title: String,
      subtitle: String,
      playing: Boolean,
      positionSec: Double,
      durationSec: Double,
    ) {
      PlaybackState.title = title
      PlaybackState.subtitle = subtitle
      PlaybackState.playing = playing
      PlaybackState.active = playing
      PlaybackState.positionMs = if (positionSec.isFinite() && positionSec > 0) {
        (positionSec * 1000).toLong()
      } else {
        0L
      }
      PlaybackState.durationMs = if (durationSec.isFinite() && durationSec > 0) {
        (durationSec * 1000).toLong()
      } else {
        0L
      }
      if (playing) ensureNotificationPermission()
      if (!playing && !PlaybackState.serviceRunning) return
      val intent = Intent(this@MainActivity, PlaybackService::class.java).apply {
        action = PlaybackService.ACTION_UPDATE
        putExtra(PlaybackService.EXTRA_TITLE, title)
        putExtra(PlaybackService.EXTRA_SUBTITLE, subtitle)
        putExtra(PlaybackService.EXTRA_PLAYING, playing)
        putExtra(PlaybackService.EXTRA_POSITION_MS, PlaybackState.positionMs)
        putExtra(PlaybackService.EXTRA_DURATION_MS, PlaybackState.durationMs)
      }
      try {
        if (PlaybackState.serviceRunning) {
          startService(intent)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          startForegroundService(intent)
        } else {
          startService(intent)
        }
      } catch (_: Exception) {
        /* Android 12+ 后台启动限制或服务被系统回收时忽略 */
      }
    }

    @JavascriptInterface
    fun stopPlayback() {
      PlaybackState.active = false
      PlaybackState.playing = false
      try {
        stopService(Intent(this@MainActivity, PlaybackService::class.java))
      } catch (_: Exception) {
        /* ignore */
      }
    }
  }
}
