package com.xiaowulai.littlesu

import android.app.Activity
import android.webkit.WebView
import androidx.mediarouter.app.MediaRouteChooserDialog
import androidx.mediarouter.media.MediaRouteSelector
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManagerListener
import org.json.JSONObject

/** Google Cast（Chromecast）发送端；设备选择使用系统 Cast 路由对话框。 */
class CastManager(private val activity: Activity, private val webView: WebView) {
  private val appId = CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID
  private val selector = MediaRouteSelector.Builder()
    .addControlCategory(CastMediaControlIntent.categoryForCast(appId))
    .build()
  private var castContext: CastContext? = null
  private var pendingUrl: String? = null
  private var pendingTitle: String = ""

  private val listener = object : SessionManagerListener<CastSession> {
    override fun onSessionStarted(session: CastSession, sessionId: String) {
      loadPending(session)
    }

    override fun onSessionStartFailed(session: CastSession, error: Int) {
      pendingUrl = null
      emit("lsu:chromecast-cast", JSONObject().put("ok", false).put("message", "Chromecast 连接失败（$error）").toString())
    }

    override fun onSessionEnded(session: CastSession, error: Int) {
      emit("lsu:chromecast-stop", JSONObject().put("ok", true).toString())
    }

    override fun onSessionEnding(session: CastSession) {
      emit("lsu:chromecast-stop", JSONObject().put("ok", true).toString())
    }

    override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) = Unit
    override fun onSessionResumeFailed(session: CastSession, error: Int) = Unit
    override fun onSessionResuming(session: CastSession, sessionId: String) = Unit
    override fun onSessionStarting(session: CastSession) = Unit
    override fun onSessionSuspended(session: CastSession, reason: Int) = Unit
  }

  init {
    try {
      castContext = CastContext.getSharedInstance(activity).also {
        it.sessionManager.addSessionManagerListener(listener, CastSession::class.java)
      }
    } catch (_: Exception) {
      castContext = null
    }
  }

  fun isAvailable(): Boolean = castContext != null

  fun cast(url: String, title: String): Boolean {
    val context = castContext ?: return false
    pendingUrl = url
    pendingTitle = title
    activity.runOnUiThread {
      try {
        val dialog = MediaRouteChooserDialog(activity)
        dialog.setRouteSelector(selector)
        dialog.show()
      } catch (error: Exception) {
        pendingUrl = null
        emit("lsu:chromecast-cast", JSONObject().put("ok", false).put("message", "无法打开 Chromecast 设备列表").toString())
      }
    }
    return true
  }

  fun stop(): Boolean {
    return try {
      castContext?.sessionManager?.endCurrentSession(true)
      true
    } catch (_: Exception) {
      false
    }
  }

  fun shutdown() {
    try {
      castContext?.sessionManager?.removeSessionManagerListener(listener, CastSession::class.java)
    } catch (_: Exception) {
      /* ignore */
    }
    castContext = null
  }

  private fun loadPending(session: CastSession) {
    val url = pendingUrl
    if (url.isNullOrBlank()) return
    val client = session.remoteMediaClient
    if (client == null) {
      pendingUrl = null
      emit("lsu:chromecast-cast", JSONObject().put("ok", false).put("message", "Chromecast 会话未就绪").toString())
      return
    }
    val contentType = if (url.contains(".m3u8", ignoreCase = true)) "application/x-mpegURL" else "video/mp4"
    val metadata = MediaMetadata(MediaMetadata.MEDIA_TYPE_MOVIE).apply {
      putString(MediaMetadata.KEY_TITLE, pendingTitle.ifBlank { "LittleSU TV" })
    }
    val media = MediaInfo.Builder(url)
      .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
      .setContentType(contentType)
      .setMetadata(metadata)
      .build()
    client.load(media)
    val name = session.castDevice?.friendlyName?.takeIf { it.isNotBlank() } ?: "Chromecast"
    pendingUrl = null
    emit(
      "lsu:chromecast-cast",
      JSONObject().put("ok", true).put("deviceId", "chromecast").put("name", name).toString(),
    )
  }

  private fun emit(event: String, json: String) {
    webView.post {
      try {
        webView.evaluateJavascript(
          "window.dispatchEvent(new CustomEvent('${event}',{detail:${json}}))",
          null,
        )
      } catch (_: Exception) {
        /* WebView 已销毁 */
      }
    }
  }
}
