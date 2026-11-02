package com.xiaowulai.littlesu

import android.content.Context
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionProvider

/** Google Cast 初始化；使用默认 Media Receiver 播放当前 m3u8/MP4 地址。 */
class CastOptionsProvider : OptionsProvider {
  override fun getCastOptions(context: Context): CastOptions =
    CastOptions.Builder()
      .setReceiverApplicationId(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID)
      .build()

  override fun getAdditionalSessionProviders(context: Context): List<SessionProvider>? = null
}
