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
import android.widget.Toast
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.io.File
import java.util.concurrent.ConcurrentHashMap

class MainActivity : TauriActivity() {
  companion object {
    @Volatile
    var instance: MainActivity? = null
  }

  private var webViewRef: WebView? = null
  private var receiverRegistered = false
  private var notificationAsked = false
  private var resumeToken = 0
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
  }

  override fun onPause() {
    // 必须在 super.onPause() 前取状态：WebView 暂停会触发视频 onPause 并清掉 active
    val keepPlaying = PlaybackState.active
    super.onPause()
    if (!keepPlaying) return
    val webView = webViewRef ?: return
    val token = ++resumeToken
    // 保持 WebView 的媒体与定时器存活，并主动恢复被 ROM/WebView 暂停的播放
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

  fun sendMediaAction(action: String, positionMs: Long = -1L) {
    runOnUiThread {
      if (action == "pause" || action == "stop") resumeToken += 1
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
