package com.xiaowulai.littlesu

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.session.MediaSession
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

object PlaybackState {
  @Volatile var active = false
  @Volatile var playing = false
  @Volatile var title = ""
  @Volatile var subtitle = ""
  @Volatile var positionMs = 0L
  @Volatile var durationMs = 0L
  @Volatile var serviceRunning = false
}

class PlaybackService : Service() {
  companion object {
    const val CHANNEL_ID = "littlesu_playback"
    const val NOTIFICATION_ID = 4101
    const val ACTION_UPDATE = "com.xiaowulai.littlesu.playback.UPDATE"
    const val ACTION_TOGGLE = "com.xiaowulai.littlesu.playback.TOGGLE"
    const val ACTION_STOP = "com.xiaowulai.littlesu.playback.STOP"
    const val EXTRA_TITLE = "title"
    const val EXTRA_SUBTITLE = "subtitle"
    const val EXTRA_PLAYING = "playing"
    const val EXTRA_POSITION_MS = "positionMs"
    const val EXTRA_DURATION_MS = "durationMs"
  }

  private var session: MediaSession? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var foregroundStarted = false

  override fun onCreate() {
    super.onCreate()
    PlaybackState.serviceRunning = true
    createChannel()
    session = MediaSession(this, "LittleSUPlayback").apply {
      setFlags(
        MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS
      )
      setCallback(object : MediaSession.Callback() {
        override fun onPlay() {
          setPlaying(true)
          sendAction("play")
          refresh()
        }

        override fun onPause() {
          setPlaying(false)
          sendAction("pause")
          refresh()
        }

        override fun onSeekTo(pos: Long) {
          PlaybackState.positionMs = pos.coerceAtLeast(0L)
          sendAction("seek", PlaybackState.positionMs)
          refresh()
        }

        override fun onStop() {
          sendAction("stop")
          stopSelf()
        }
      })
      isActive = true
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_TOGGLE -> {
        setPlaying(!PlaybackState.playing)
        sendAction(if (PlaybackState.playing) "play" else "pause")
      }
      ACTION_STOP -> {
        sendAction("stop")
        stopSelf()
        return START_NOT_STICKY
      }
      else -> {
        intent?.getStringExtra(EXTRA_TITLE)?.let { PlaybackState.title = it }
        intent?.getStringExtra(EXTRA_SUBTITLE)?.let { PlaybackState.subtitle = it }
        if (intent != null && intent.hasExtra(EXTRA_PLAYING)) {
          PlaybackState.playing = intent.getBooleanExtra(EXTRA_PLAYING, PlaybackState.playing)
        }
        if (intent != null && intent.hasExtra(EXTRA_POSITION_MS)) {
          PlaybackState.positionMs = intent.getLongExtra(EXTRA_POSITION_MS, PlaybackState.positionMs)
        }
        if (intent != null && intent.hasExtra(EXTRA_DURATION_MS)) {
          PlaybackState.durationMs = intent.getLongExtra(EXTRA_DURATION_MS, PlaybackState.durationMs)
        }
        PlaybackState.active = PlaybackState.playing
      }
    }
    refresh()
    return START_NOT_STICKY
  }

  private fun setPlaying(playing: Boolean) {
    PlaybackState.playing = playing
    PlaybackState.active = playing
  }

  private fun refresh() {
    startForegroundCompat()
    updateNotification()
    updateWakeLock()
  }

  private fun startForegroundCompat() {
    if (foregroundStarted) return
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    foregroundStarted = true
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "播放控制",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "后台播放时显示当前剧集与播放控制"
      setShowBadge(false)
      setSound(null, null)
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val openIntent = PendingIntent.getActivity(
      this,
      10,
      Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val toggleIntent = PendingIntent.getService(
      this,
      11,
      Intent(this, PlaybackService::class.java).setAction(ACTION_TOGGLE),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val stopIntent = PendingIntent.getService(
      this,
      12,
      Intent(this, PlaybackService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      Notification.Builder(this)
    }
    val toggleIcon = if (PlaybackState.playing) {
      android.R.drawable.ic_media_pause
    } else {
      android.R.drawable.ic_media_play
    }
    val toggleLabel = if (PlaybackState.playing) "暂停" else "继续播放"
    builder
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle(PlaybackState.title.ifBlank { "LittleSU TV" })
      .setContentText(PlaybackState.subtitle)
      .setContentIntent(openIntent)
      .setCategory(Notification.CATEGORY_TRANSPORT)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true)
      .setOngoing(true)
      .setShowWhen(false)
      .addAction(Notification.Action.Builder(toggleIcon, toggleLabel, toggleIntent).build())
      .addAction(
        Notification.Action.Builder(
          android.R.drawable.ic_menu_close_clear_cancel,
          "停止",
          stopIntent
        ).build()
      )
    session?.let {
      builder.setStyle(
        Notification.MediaStyle()
          .setMediaSession(it.sessionToken)
          .setShowActionsInCompactView(0)
      )
    }
    return builder.build()
  }

  private fun updateNotification() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(NOTIFICATION_ID, buildNotification())
    session?.setMetadata(
      android.media.MediaMetadata.Builder()
        .putString(
          android.media.MediaMetadata.METADATA_KEY_TITLE,
          PlaybackState.title.ifBlank { "LittleSU TV" }
        )
        .putString(android.media.MediaMetadata.METADATA_KEY_ARTIST, PlaybackState.subtitle)
        .putLong(android.media.MediaMetadata.METADATA_KEY_DURATION, PlaybackState.durationMs)
        .build()
    )
    var actions = android.media.session.PlaybackState.ACTION_PLAY or
      android.media.session.PlaybackState.ACTION_PAUSE or
      android.media.session.PlaybackState.ACTION_PLAY_PAUSE or
      android.media.session.PlaybackState.ACTION_STOP
    if (PlaybackState.durationMs > 0L) {
      actions = actions or android.media.session.PlaybackState.ACTION_SEEK_TO
    }
    session?.setPlaybackState(
      android.media.session.PlaybackState.Builder()
        .setActions(actions)
        .setState(
          if (PlaybackState.playing) {
            android.media.session.PlaybackState.STATE_PLAYING
          } else {
            android.media.session.PlaybackState.STATE_PAUSED
          },
          PlaybackState.positionMs,
          if (PlaybackState.playing) 1f else 0f
        )
        .build()
    )
  }

  private fun updateWakeLock() {
    if (PlaybackState.playing) {
      if (wakeLock == null) {
        val power = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = power
          .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LittleSU:Playback")
          .apply {
            setReferenceCounted(false)
            acquire(6 * 60 * 60 * 1000L)
          }
      }
    } else {
      wakeLock?.let { if (it.isHeld) it.release() }
      wakeLock = null
    }
  }

  private fun sendAction(action: String, positionMs: Long = -1L) {
    MainActivity.instance?.sendMediaAction(action, positionMs)
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    PlaybackState.serviceRunning = false
    PlaybackState.active = false
    foregroundStarted = false
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    session?.isActive = false
    session?.release()
    session = null
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
