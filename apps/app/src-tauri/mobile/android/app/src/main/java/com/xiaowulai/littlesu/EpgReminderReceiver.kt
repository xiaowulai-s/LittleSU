package com.xiaowulai.littlesu

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/** 由 AlarmManager 触发的节目提醒；应用被回收后仍会显示系统通知。 */
class EpgReminderReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_REMIND = "com.xiaowulai.littlesu.epg.REMIND"
    const val EXTRA_ID = "id"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    private const val CHANNEL_ID = "littlesu_epg"
    private const val CHANNEL_NAME = "节目提醒"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val title = intent.getStringExtra(EXTRA_TITLE)?.trim().orEmpty()
    if (title.isEmpty()) return
    val body = intent.getStringExtra(EXTRA_BODY)?.trim().orEmpty()
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          CHANNEL_NAME,
          NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
          description = "直播节目开始前的提醒"
          setShowBadge(true)
        }
        manager.createNotificationChannel(channel)
      }

      val builder = Notification.Builder(context)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        builder.setChannelId(CHANNEL_ID)
      }
      builder
        .setSmallIcon(android.R.drawable.ic_popup_reminder)
        .setContentTitle("节目提醒 · $title")
        .setContentText(body.ifEmpty { "节目即将开始" })
        .setAutoCancel(true)

      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (launch != null) {
        launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val content = PendingIntent.getActivity(
          context,
          9100,
          launch,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        builder.setContentIntent(content)
      }

      val id = intent.getStringExtra(EXTRA_ID) ?: title
      manager.notify(id.hashCode(), builder.build())
    } catch (_: Exception) {
      /* 通知权限被拒绝或系统限制时静默失败 */
    }
  }
}
