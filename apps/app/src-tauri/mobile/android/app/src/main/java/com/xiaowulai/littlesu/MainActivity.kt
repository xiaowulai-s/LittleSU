package com.xiaowulai.littlesu

import android.Manifest
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  companion object {
    @Volatile
    var instance: MainActivity? = null
  }

  private var webViewRef: WebView? = null
  private var receiverRegistered = false
  private var notificationAsked = false

  private val downloadReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
      val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
      if (id < 0) return
      val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
      val uri = manager.getUriForDownloadedFile(id) ?: return
      val install = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      try {
        startActivity(install)
      } catch (_: Exception) {
        /* 无法拉起安装器时保留系统下载通知 */
      }
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
  }

  override fun onPause() {
    super.onPause()
    // 前台服务播放期间保持 WebView 的媒体与定时器存活，切后台/锁屏不中断
    if (PlaybackState.active) {
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
    webViewRef = null
    if (instance === this) instance = null
    super.onDestroy()
  }

  fun sendMediaAction(action: String) {
    runOnUiThread {
      webViewRef?.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('lsu:native-media',{detail:'$action'}))",
        null
      )
    }
  }

  private fun ensureNotificationPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || notificationAsked) return
    if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
    notificationAsked = true
    runOnUiThread {
      requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS)) { }
    }
  }

  inner class NativeBridge {
    @JavascriptInterface
    fun installApk(url: String): Boolean {
      if (!url.startsWith("https://")) return false
      return try {
        val request = DownloadManager.Request(Uri.parse(url))
          .setTitle("LittleSU TV 更新")
          .setDescription("正在下载安装包…")
          .setMimeType("application/vnd.android.package-archive")
          .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
          .setDestinationInExternalFilesDir(
            this@MainActivity,
            Environment.DIRECTORY_DOWNLOADS,
            "littlesu-update.apk"
          )
        val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        manager.enqueue(request)
        true
      } catch (_: Exception) {
        false
      }
    }

    @JavascriptInterface
    fun updatePlayback(title: String, subtitle: String, playing: Boolean) {
      PlaybackState.title = title
      PlaybackState.subtitle = subtitle
      PlaybackState.playing = playing
      PlaybackState.active = playing
      if (playing) ensureNotificationPermission()
      if (!playing && !PlaybackState.serviceRunning) return
      val intent = Intent(this@MainActivity, PlaybackService::class.java).apply {
        action = PlaybackService.ACTION_UPDATE
        putExtra(PlaybackService.EXTRA_TITLE, title)
        putExtra(PlaybackService.EXTRA_SUBTITLE, subtitle)
        putExtra(PlaybackService.EXTRA_PLAYING, playing)
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
